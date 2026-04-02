
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import get_db
from models.task import Task
from services.approval_policy_service import get_workspace_role
from services.decision_service import (
    analyze_causes,
    build_action_system,
    build_cause_overview,
    build_ceo_briefing,
    build_recommendations,
    get_decision_events,
    get_event_by_id,
    list_problem_history,
    run_decision_system,
)
from services.external_signal_service import get_external_signals
from services.enterprise_ai_service import _safe_aggregate_data, _build_marketing_mix, _fetch_hubspot_summary
from services.strategy_cycle_service import get_latest_strategy_cycle, run_strategy_cycle

router = APIRouter(prefix="/api/decision", tags=["decision"])


class ActionTaskAssignRequest(BaseModel):
    action_id: str
    assign_mode: str = Field(default="later", pattern="^(self|team_member|later)$")
    team_member: Optional[str] = None

# Neue Route: Top-Entscheidungen
@router.get("/decisions")
def get_decisions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    events = get_decision_events(db)
    from services.decision_service import build_decisions
    return {"decisions": build_decisions(events)}


@router.get("/events")
def get_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    events = get_decision_events(db)
    return {"events": [event.to_dict() for event in events], "count": len(events)}


@router.get("/events/{event_id}/causes")
def get_event_causes(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    event = get_event_by_id(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Decision Event nicht gefunden.")
    events = get_decision_events(db)
    aggregated = _safe_aggregate_data(db, 30)
    marketing_mix = _build_marketing_mix(aggregated)
    crm_snapshot = _fetch_hubspot_summary() or {}
    external_signals = get_external_signals("ecommerce")
    context = {
        "traffic_sources": marketing_mix.get("traffic_sources"),
        "bounce_rate_pct": marketing_mix.get("bounce_rate_pct"),
        "avg_session_duration_sec": marketing_mix.get("avg_session_duration_sec"),
        "social": marketing_mix.get("social"),
        "crm": crm_snapshot,
        "stripe": {
            "refund_rate_pct": getattr(aggregated.stripe, "refund_rate_pct", None) if aggregated and getattr(aggregated, "stripe", None) else None,
            "failed_payments_30d": getattr(aggregated.stripe, "failed_payments_30d", None) if aggregated and getattr(aggregated, "stripe", None) else None,
        },
        "external_signals": external_signals,
    }
    return {"event": event.to_dict(), "causes": analyze_causes(event, events, context)}


@router.get("/causes")
def get_cause_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    events = get_decision_events(db)
    aggregated = _safe_aggregate_data(db, 30)
    marketing_mix = _build_marketing_mix(aggregated)
    crm_snapshot = _fetch_hubspot_summary() or {}
    external_signals = get_external_signals("ecommerce")
    context = {
        "traffic_sources": marketing_mix.get("traffic_sources"),
        "bounce_rate_pct": marketing_mix.get("bounce_rate_pct"),
        "avg_session_duration_sec": marketing_mix.get("avg_session_duration_sec"),
        "social": marketing_mix.get("social"),
        "crm": crm_snapshot,
        "stripe": {
            "refund_rate_pct": getattr(aggregated.stripe, "refund_rate_pct", None) if aggregated and getattr(aggregated, "stripe", None) else None,
            "failed_payments_30d": getattr(aggregated.stripe, "failed_payments_30d", None) if aggregated and getattr(aggregated, "stripe", None) else None,
        },
        "external_signals": external_signals,
    }
    return build_cause_overview(events, context)


@router.get("/recommendations")
def get_decision_recommendations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    events = get_decision_events(db)
    aggregated = _safe_aggregate_data(db, 30)
    marketing_mix = _build_marketing_mix(aggregated)
    crm_snapshot = _fetch_hubspot_summary() or {}
    external_signals = get_external_signals("ecommerce")
    context = {
        "traffic_sources": marketing_mix.get("traffic_sources"),
        "bounce_rate_pct": marketing_mix.get("bounce_rate_pct"),
        "avg_session_duration_sec": marketing_mix.get("avg_session_duration_sec"),
        "social": marketing_mix.get("social"),
        "crm": crm_snapshot,
        "stripe": {
            "refund_rate_pct": getattr(aggregated.stripe, "refund_rate_pct", None) if aggregated and getattr(aggregated, "stripe", None) else None,
            "failed_payments_30d": getattr(aggregated.stripe, "failed_payments_30d", None) if aggregated and getattr(aggregated, "stripe", None) else None,
        },
        "external_signals": external_signals,
    }
    return {"recommendations": build_recommendations(events, context)}


@router.get("/briefing")
def get_briefing(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return build_ceo_briefing(db)


@router.get("/external-signals")
def get_signals(
    current_user: User = Depends(get_current_user),
):
    del current_user
    return {"items": get_external_signals("ecommerce")}


@router.get("/main-problem")
def get_main_problem(
    persist: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return run_decision_system(db, persist=persist)


@router.get("/problem-history")
def get_problem_history(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return {"items": list_problem_history(db, limit=limit)}


@router.get("/action-system")
def get_action_system(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return build_action_system(db)


@router.post("/action-system/create-top-tasks")
def create_top_tasks_from_actions(
    assign_mode: str = "later",
    team_member: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if assign_mode not in {"self", "team_member", "later"}:
        raise HTTPException(status_code=400, detail="assign_mode muss self, team_member oder later sein.")
    if assign_mode == "team_member" and not team_member:
        raise HTTPException(status_code=400, detail="team_member wird fuer assign_mode=team_member benoetigt.")

    action_system = build_action_system(db)
    top_actions = action_system.get("top_actions", [])
    created = []

    assigned_to = None
    if assign_mode == "self":
        assigned_to = current_user.email
    elif assign_mode == "team_member":
        assigned_to = team_member

    for action in top_actions[:3]:
        payload = action.get("task_payload", {})
        task = Task(
            title=payload.get("title") or action.get("title") or "Aufgabe",
            description=payload.get("description") or action.get("description"),
            priority=str(payload.get("priority", "medium")).lower(),
            assigned_to=assigned_to,
            due_date=date.fromisoformat(payload.get("due_date")) if payload.get("due_date") else None,
            created_by=current_user.email,
            status="open",
        )
        db.add(task)
        db.flush()
        created.append(
            {
                "task_id": task.id,
                "title": task.title,
                "priority": task.priority,
                "assigned_to": task.assigned_to,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "source_action_id": action.get("action_id"),
            }
        )

    db.commit()
    return {"created": created, "count": len(created)}


@router.get("/strategy-cycle/latest")
def get_latest_cycle(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    return get_latest_strategy_cycle(db, workspace_id=workspace_id)


@router.post("/strategy-cycle/run")
def run_cycle(
    prepare_action_requests: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    role = get_workspace_role(db, current_user, workspace_id)
    if role not in {"owner", "admin", "manager"}:
        raise HTTPException(status_code=403, detail="Nur Admin/Manager/Owner duerfen Strategiezyklen ausfuehren.")
    if prepare_action_requests and role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Nur Admin/Owner duerfen freigabepflichtige Action Requests vorbereiten.")
    return run_strategy_cycle(
        db=db,
        workspace_id=workspace_id,
        triggered_by=current_user.email,
        mode="manual",
        prepare_action_requests=prepare_action_requests,
    )
