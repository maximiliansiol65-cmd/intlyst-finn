from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from database import SessionLocal, reset_current_workspace_id, set_current_workspace_id
from models.action_request import ActionRequest
from models.strategy_cycle import StrategyCycle
from models.user import Workspace
from services.decision_service import build_action_system, run_decision_system
from services.learning_service import summarize_learning


def _clamp(value: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, value))


def _json_dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=True)


def _json_load(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _is_conflicting_action(db: Session, workspace_id: int, title: str) -> bool:
    since = datetime.utcnow() - timedelta(hours=24)
    existing = (
        db.query(ActionRequest)
        .filter(
            ActionRequest.workspace_id == workspace_id,
            ActionRequest.title == title,
            ActionRequest.created_at >= since,
            ActionRequest.status.in_(["pending_approval", "approved", "executed"]),
        )
        .first()
    )
    return existing is not None


def _learning_calibration_factor(db: Session) -> float:
    learning = summarize_learning(db)
    predicted = float(learning.get("avg_predicted_impact") or 0.0)
    actual = float(learning.get("avg_actual_impact") or 0.0)
    if predicted <= 0 or actual <= 0:
        return 1.0
    ratio = actual / predicted
    return _clamp(ratio, 0.7, 1.3)


def _simulate_action(action: dict[str, Any], calibration: float) -> dict[str, Any]:
    expected_effect_pct = float(action.get("expected_effect_pct") or 0.0) * calibration
    duration_min = float(action.get("duration_min") or 30.0)
    impact_score = float(action.get("impact_score") or 0.0)

    risk_score = _clamp(18.0 + duration_min * 0.22 - impact_score * 0.06, 8.0, 85.0)
    effort_score = _clamp(duration_min / 2.0, 5.0, 100.0)
    net_score = round(expected_effect_pct * 3.2 - risk_score * 0.9 - effort_score * 0.25, 2)

    return {
        "action_id": action.get("action_id"),
        "scenario": action.get("title"),
        "predicted_traffic_uplift_pct": round(expected_effect_pct if "Traffic" in str(action.get("goal", "")) else expected_effect_pct * 0.75, 2),
        "predicted_conversion_uplift_pct": round(expected_effect_pct if "Conversion" in str(action.get("goal", "")) else expected_effect_pct * 0.6, 2),
        "predicted_revenue_uplift_pct": round(expected_effect_pct * 0.55, 2),
        "risk_score": round(risk_score, 2),
        "effort_score": round(effort_score, 2),
        "net_priority_score": net_score,
    }


def _strategy_changes_from_cause(cause_name: str, top_actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cause = (cause_name or "").lower()
    titles = [str(a.get("title")) for a in top_actions[:2]]
    if cause == "traffic":
        return [
            {"change": "Marketingstrategie anpassen", "detail": "Top-of-funnel Budget auf performante Kanaele shiften."},
            {"change": "Contentplan aktualisieren", "detail": f"Fokus auf: {', '.join(titles) if titles else 'Traffic-Hebel'}."},
            {"change": "A/B-Test vorschlagen", "detail": "Neue Landingpage-Variante fuer Traffic-Qualitaet testen."},
        ]
    if cause == "conversion":
        return [
            {"change": "Funnel-Strategie anpassen", "detail": "CTA und Product-Page-Struktur priorisiert optimieren."},
            {"change": "Aufgabenprioritaet neu verteilen", "detail": "UX/Checkout-Aufgaben auf High setzen."},
            {"change": "A/B-Test vorschlagen", "detail": "CTA + Preis-/Bundle-Variante kontrolliert testen."},
        ]
    if cause == "customers":
        return [
            {"change": "Retention-Strategie anpassen", "detail": "Reaktivierung und CRM-Follow-ups priorisieren."},
            {"change": "Contentplan automatisch anpassen", "detail": "Mehr Trust/Case-Content fuer Rueckgewinnung."},
            {"change": "Aufgabenprioritaet neu verteilen", "detail": "CRM- und Lifecycle-Tasks vorziehen."},
        ]
    return [
        {"change": "Kampagnenstrategie feinjustieren", "detail": "Marketing-Mix risikobasiert neu gewichten."},
        {"change": "Aufgabenprioritaet neu verteilen", "detail": "High-Impact-Massnahmen zuerst ausfuehren."},
        {"change": "A/B-Test vorschlagen", "detail": "Schnelles Experiment fuer naechsten Hebel starten."},
    ]


def run_strategy_cycle(
    db: Session,
    workspace_id: int,
    triggered_by: str,
    mode: str = "manual",
    prepare_action_requests: bool = False,
) -> dict[str, Any]:
    decision = run_decision_system(db, persist=True)
    action_system = build_action_system(db)
    learning = summarize_learning(db)
    calibration = _learning_calibration_factor(db)

    top_actions = list(action_system.get("top_actions") or [])[:3]
    simulations = [_simulate_action(action, calibration) for action in top_actions]
    simulations.sort(key=lambda item: item["net_priority_score"], reverse=True)
    simulation_by_action = {item["action_id"]: item for item in simulations}

    prioritized_actions = sorted(
        top_actions,
        key=lambda action: simulation_by_action.get(action.get("action_id"), {}).get("net_priority_score", -999),
        reverse=True,
    )

    prepared_request_ids: list[int] = []
    conflicts: list[dict[str, Any]] = []

    if prepare_action_requests:
        for action in prioritized_actions:
            title = f"[AUTO-STRATEGY] {action.get('title')}"
            if _is_conflicting_action(db, workspace_id, title):
                conflicts.append({"title": title, "reason": "Bereits als laufende/aktuelle Action vorhanden."})
                continue
            sim = simulation_by_action.get(action.get("action_id"), {})
            request = ActionRequest(
                workspace_id=workspace_id,
                title=title,
                description=(
                    f"{action.get('description')}\n\n"
                    f"Warum: {action.get('why_important')}\n"
                    f"Erwarteter Effekt: {action.get('expected_effect')}\n"
                    f"Simulation Umsatz-Uplift: {sim.get('predicted_revenue_uplift_pct', 0)}%"
                ),
                category="strategy",
                priority=str(action.get("priority", "Medium")).lower(),
                impact_score=float(action.get("impact_score") or 0.0),
                risk_score=float(sim.get("risk_score") or 0.0),
                estimated_hours=round(float(action.get("duration_min") or 30) / 60.0, 2),
                execution_type="strategy_bundle",
                status="pending_approval",
                requested_by=triggered_by,
                execution_plan_json=_json_dump(
                    {
                        "requires_user_confirmation": True,
                        "precheck_conflicts": True,
                        "simulation": sim,
                        "steps": [
                            "Konfliktcheck",
                            "Freigabe durch berechtigte Rolle",
                            "Ausfuehrung mit Live-Feedback",
                        ],
                    }
                ),
                target_systems_json=_json_dump(["intlyst_tasks", "mailchimp", "social_drafts", "notion", "slack"]),
            )
            db.add(request)
            db.flush()
            prepared_request_ids.append(request.id)

    cause_name = (action_system.get("cause") or {}).get("name") or (decision.get("cause_analysis") or {}).get("likely_cause")
    strategy_changes = _strategy_changes_from_cause(str(cause_name or ""), prioritized_actions)

    cycle = StrategyCycle(
        workspace_id=workspace_id,
        triggered_by=triggered_by,
        mode=mode,
        status="ok",
        problem_name=(action_system.get("problem") or {}).get("name"),
        cause_name=str(cause_name or ""),
        conflict_count=len(conflicts),
        requires_confirmation=True,
        kpi_snapshot_json=_json_dump(decision.get("kpis", [])),
        top_actions_json=_json_dump(prioritized_actions),
        simulations_json=_json_dump(simulations),
        strategy_changes_json=_json_dump(strategy_changes),
        prepared_request_ids_json=_json_dump(prepared_request_ids),
        notes=f"Learning calibration factor: {calibration:.2f}",
    )
    db.add(cycle)
    db.commit()
    db.refresh(cycle)

    return {
        "status": "ok",
        "cycle_id": cycle.id,
        "mode": mode,
        "requires_confirmation": True,
        "continuous_monitoring": {
            "enabled": True,
            "metrics": ["revenue", "traffic", "conversion", "social_media", "campaigns", "customers"],
        },
        "problem": action_system.get("problem"),
        "cause": action_system.get("cause"),
        "prioritized_actions": prioritized_actions,
        "simulations": simulations,
        "strategy_changes": strategy_changes,
        "conflicts": conflicts,
        "prepared_action_requests": prepared_request_ids,
        "learning": {
            "overall_accuracy": learning.get("overall_accuracy"),
            "avg_predicted_impact": learning.get("avg_predicted_impact"),
            "avg_actual_impact": learning.get("avg_actual_impact"),
            "calibration_factor": round(calibration, 2),
        },
        "reporting": {
            "dashboard_ready": True,
            "generated_at": cycle.created_at.isoformat() if cycle.created_at else None,
        },
    }


def get_latest_strategy_cycle(db: Session, workspace_id: int) -> dict[str, Any]:
    row = (
        db.query(StrategyCycle)
        .filter(StrategyCycle.workspace_id == workspace_id)
        .order_by(StrategyCycle.created_at.desc())
        .first()
    )
    if not row:
        # Fallback for mixed legacy/workspace data during migration.
        row = db.query(StrategyCycle).order_by(StrategyCycle.created_at.desc()).first()
    if not row:
        return {"status": "empty", "item": None}
    return {
        "status": "ok",
        "item": {
            "id": row.id,
            "workspace_id": row.workspace_id,
            "triggered_by": row.triggered_by,
            "mode": row.mode,
            "problem_name": row.problem_name,
            "cause_name": row.cause_name,
            "conflict_count": row.conflict_count,
            "requires_confirmation": row.requires_confirmation,
            "top_actions": _json_load(row.top_actions_json) or [],
            "simulations": _json_load(row.simulations_json) or [],
            "strategy_changes": _json_load(row.strategy_changes_json) or [],
            "prepared_action_requests": _json_load(row.prepared_request_ids_json) or [],
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "notes": row.notes,
        },
    }


def run_background_strategy_cycle_job() -> None:
    db = SessionLocal()
    try:
        workspace_ids = [item[0] for item in db.query(Workspace.id).all()] or [1]
        for workspace_id in workspace_ids:
            token = set_current_workspace_id(workspace_id)
            try:
                run_strategy_cycle(
                    db=db,
                    workspace_id=workspace_id,
                    triggered_by="system_background",
                    mode="background",
                    prepare_action_requests=False,  # Never auto-execute, only monitor/adapt.
                )
            finally:
                reset_current_workspace_id(token)
    finally:
        db.close()
