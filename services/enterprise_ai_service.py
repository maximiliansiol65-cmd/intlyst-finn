from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional
import asyncio
import os

import httpx

from sqlalchemy.orm import Session

from api.auth_routes import User
from services.analysis_service import get_daily_rows, summarize_values
from services.approval_policy_service import build_policy_snapshot, get_policy_settings, get_workspace_role
from services.decision_service import analyze_causes, build_recommendations, get_decision_events
from services.external_signal_service import get_external_signals
from services.learning_service import summarize_learning
from models.task import Task
from api.auth_routes import User as AuthUser, WorkspaceMembership


CORE_METRICS = [
    "revenue",
    "traffic",
    "conversions",
    "conversion_rate",
    "new_customers",
    "cost",
    "profit",
    "gross_margin",
    "cashflow",
    "liquidity",
]

_KEYWORDS_TO_METRICS = {
    "cpm": ["traffic", "conversions", "cost"],
    "paid": ["traffic", "conversions", "cost"],
    "ads": ["traffic", "conversions", "cost"],
    "promo": ["revenue", "profit", "gross_margin"],
    "discount": ["revenue", "profit", "gross_margin"],
    "pricing": ["revenue", "profit", "gross_margin"],
    "competitor": ["revenue", "new_customers", "conversion_rate"],
    "competition": ["revenue", "new_customers", "conversion_rate"],
    "season": ["traffic", "conversions", "revenue"],
    "holiday": ["traffic", "conversions", "revenue"],
    "shipping": ["cost", "profit"],
    "supply": ["cost", "profit"],
}


def _metric_series(rows: list, metric: str) -> list[float]:
    values: list[float] = []
    for row in rows:
        value = getattr(row, metric, 0.0) or 0.0
        values.append(float(value))
    return values


def _build_metric_summary(rows: list) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for metric in CORE_METRICS:
        values = _metric_series(rows, metric)
        summary[metric] = summarize_values(values)
    return summary


def _build_forecasts(metric_summary: dict[str, Any]) -> list[dict[str, Any]]:
    forecasts = []
    for metric, stats in metric_summary.items():
        latest = float(stats.get("latest", 0.0))
        trend_pct = float(stats.get("trend_pct", 0.0))
        projected = latest * (1 + (trend_pct / 100) * 0.35)
        forecasts.append({
            "metric": metric,
            "latest": round(latest, 2),
            "trend_pct": round(trend_pct, 2),
            "forecast_7d": round(projected, 2),
            "direction": stats.get("trend", "stable"),
        })
    return forecasts


def _build_micro_changes(rows: list, metric_summary: dict[str, Any]) -> list[dict[str, Any]]:
    if len(rows) < 2:
        return []
    latest = rows[-1]
    previous = rows[-2]
    changes: list[dict[str, Any]] = []
    for metric in CORE_METRICS:
        current = float(getattr(latest, metric, 0.0) or 0.0)
        baseline = float(getattr(previous, metric, 0.0) or 0.0)
        delta_pct = ((current - baseline) / baseline * 100) if baseline else 0.0
        if abs(delta_pct) < 0.1:
            continue
        trend = metric_summary.get(metric, {}).get("trend", "stable")
        severity = "low"
        magnitude = abs(delta_pct)
        if magnitude >= 10:
            severity = "critical"
        elif magnitude >= 5:
            severity = "high"
        elif magnitude >= 2:
            severity = "medium"
        changes.append({
            "metric": metric,
            "current_value": round(current, 2),
            "previous_value": round(baseline, 2),
            "delta_pct": round(delta_pct, 2),
            "severity": severity,
            "trend": trend,
        })
    return changes


def _priority_to_deadline(priority: str) -> int:
    if priority == "high":
        return 2
    if priority == "low":
        return 6
    return 4


def _owner_role_hint(category: str) -> str:
    return {
        "marketing": "marketing",
        "growth": "marketing",
        "sales": "sales",
        "product": "product",
        "operations": "operations",
        "finance": "finance",
    }.get(category, "operations")


def _select_assignee(db: Session, workspace_id: Optional[int], owner_role: str) -> dict[str, Any]:
    if not workspace_id:
        return {"assigned_to": owner_role, "reason": "Kein Workspace-Kontext verfügbar."}
    member_ids = (
        db.query(WorkspaceMembership.user_id, WorkspaceMembership.role)
        .filter(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,  # noqa: E712
        )
        .all()
    )
    if not member_ids:
        return {"assigned_to": owner_role, "reason": "Keine Teammitglieder gefunden."}

    user_ids = [row[0] for row in member_ids]
    members = db.query(AuthUser).filter(AuthUser.id.in_(user_ids), AuthUser.is_active == True).all()
    if not members:
        return {"assigned_to": owner_role, "reason": "Keine aktiven Teammitglieder gefunden."}

    role_map = {row[0]: row[1] for row in member_ids}
    tasks = db.query(Task).filter(Task.status != "done").all()
    workload: dict[str, int] = {}
    for task in tasks:
        if task.assigned_to:
            workload[task.assigned_to] = workload.get(task.assigned_to, 0) + 1

    def score(member: AuthUser) -> tuple[int, int]:
        member_role = role_map.get(member.id, "member")
        role_match = 0
        if owner_role in {"marketing", "growth", "sales"} and member_role in {"manager", "admin"}:
            role_match = 1
        if owner_role in {"finance", "operations", "product"} and member_role in {"admin", "manager"}:
            role_match = 1
        return (role_match, -workload.get(member.email, 0))

    selected = sorted(members, key=score, reverse=True)[0]
    return {
        "assigned_to": selected.email,
        "reason": f"Auswahl nach Rolle ({role_map.get(selected.id, 'member')}) und aktueller Auslastung.",
    }


def _build_task_from_recommendation(
    rec: dict[str, Any],
    context: dict[str, Any],
    db: Session,
    workspace_id: Optional[int],
) -> dict[str, Any]:
    owner_role = _owner_role_hint(rec.get("category"))
    assignment = _select_assignee(db, workspace_id, owner_role)
    priority = rec.get("priority", "medium")
    due_days = _priority_to_deadline(priority)
    due_date = (datetime.utcnow() + timedelta(days=due_days)).date().isoformat()
    causes = rec.get("causes") or []
    cause_labels = [c.get("label") for c in causes if c.get("label")]
    expected_outcome = (
        f"+{rec.get('expected_reach_uplift_pct', 0)}% Reichweite, "
        f"{rec.get('expected_new_customers', 0)} neue Kunden, "
        f"+{rec.get('expected_revenue_uplift_pct', 0)}% Umsatz"
    )
    steps = [
        "Analyse der Auslöser (KPI, Ursache, Trend) prüfen",
        "Maßnahmen-Assets ausarbeiten (Content, Messaging, Offer)",
        "Ausführung vorbereiten und Wirkungsmessung aktivieren",
    ]
    description = (
        f"Warum wichtig: {rec.get('rationale')}\n"
        f"Schritte: {', '.join(steps)}.\n"
        f"Benötigte Daten/Materialien: KPI-Verlauf, Kampagnen-Performance, "
        f"Zielgruppe/Angebot, aktuelle Inhalte."
    )
    automation_suggestions = []
    prepared_assets = rec.get("prepared_assets") or {}
    if prepared_assets.get("email"):
        automation_suggestions.append("E-Mail-Entwurf automatisch vorbereiten (nach Freigabe senden).")
    if prepared_assets.get("social_posts"):
        automation_suggestions.append("Social-Posts als Entwürfe erzeugen und terminieren.")
    if rec.get("execution_plan"):
        automation_suggestions.append("Report-Update und Live-Tracking automatisch starten.")

    return {
        "title": rec.get("title"),
        "description": description,
        "priority": "high" if priority == "high" else "low" if priority == "low" else "medium",
        "assigned_to": assignment.get("assigned_to"),
        "assigned_reason": assignment.get("reason"),
        "due_in_days": due_days,
        "due_date": due_date,
        "status": "open",
        "expected_result": expected_outcome,
        "automation_suggestions": automation_suggestions,
        "context": {
            "recommendation_id": rec.get("id"),
            "event_id": rec.get("event_id"),
            "metric": rec.get("metric"),
            "direction": rec.get("direction"),
            "causes": cause_labels,
            "kpis": context.get("traffic_sources"),
        },
    }


def _safe_aggregate_data(db: Session, days: int, country_code: str = "DE") -> Optional[Any]:
    try:
        from analytics.data_aggregator import aggregate_all_data
    except Exception:
        return None
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = None
    try:
        if loop and loop.is_running():
            return None
        return asyncio.run(aggregate_all_data(db, days=days, country_code=country_code))
    except Exception:
        return None


def _fetch_hubspot_summary(limit: int = 30) -> Optional[dict[str, Any]]:
    key = os.getenv("HUBSPOT_API_KEY", "").strip()
    if not key:
        contacts = [
            {"lifecycle_stage": "customer"},
            {"lifecycle_stage": "lead"},
            {"lifecycle_stage": "customer"},
            {"lifecycle_stage": "opportunity"},
            {"lifecycle_stage": "lead"},
        ]
        total_deals = 12
        total_deal_value = 28500.0
        total_contacts = 47
        deal_close_rate = total_deals / max(total_contacts, 1)
        return {
            "source": "demo_data",
            "total_contacts": total_contacts,
            "total_deals": total_deals,
            "total_deal_value": total_deal_value,
            "deal_close_rate": round(deal_close_rate, 3),
            "avg_deal_value": round(total_deal_value / max(total_deals, 1), 2),
            "lifecycle_split": {
                "customer": 2,
                "lead": 2,
                "opportunity": 1,
            },
        }

    headers = {"Authorization": f"Bearer {key}"}
    with httpx.Client(timeout=12.0) as client:
        contacts_res = client.get(
            "https://api.hubapi.com/crm/v3/objects/contacts",
            headers=headers,
            params={"limit": limit, "properties": "lifecyclestage"},
        )
        deals_res = client.get(
            "https://api.hubapi.com/crm/v3/objects/deals",
            headers=headers,
            params={"limit": 100, "properties": "amount"},
        )

    if contacts_res.status_code != 200:
        return None
    contacts_data = contacts_res.json().get("results", [])
    deals_data = deals_res.json().get("results", []) if deals_res.status_code == 200 else []
    total_deal_value = sum(float(item.get("properties", {}).get("amount", 0) or 0) for item in deals_data)
    total_contacts = len(contacts_data)
    total_deals = len(deals_data)
    lifecycle_split: dict[str, int] = {}
    for contact in contacts_data:
        stage = (contact.get("properties", {}) or {}).get("lifecyclestage", "unknown")
        lifecycle_split[stage] = lifecycle_split.get(stage, 0) + 1

    deal_close_rate = total_deals / max(total_contacts, 1)
    return {
        "source": "hubspot",
        "total_contacts": total_contacts,
        "total_deals": total_deals,
        "total_deal_value": round(total_deal_value, 2),
        "deal_close_rate": round(deal_close_rate, 3),
        "avg_deal_value": round(total_deal_value / max(total_deals, 1), 2),
        "lifecycle_split": lifecycle_split,
    }


def _build_marketing_mix(aggregated: Optional[Any]) -> dict[str, Any]:
    if not aggregated or not getattr(aggregated, "ga4", None):
        return {}
    ga4 = aggregated.ga4
    traffic_sources = ga4.traffic_sources or {}
    top_channel = None
    top_share = None
    if traffic_sources:
        top_channel, top_share = max(traffic_sources.items(), key=lambda item: item[1])
    social = {}
    if getattr(aggregated, "instagram", None):
        ig = aggregated.instagram
        social["instagram"] = {
            "followers": ig.followers,
            "follower_growth_30d": ig.follower_growth_30d,
            "avg_engagement_rate_pct": ig.avg_engagement_rate_pct,
            "posting_frequency_per_week": ig.posting_frequency_per_week,
        }
    if getattr(aggregated, "tiktok", None):
        tk = aggregated.tiktok
        social["tiktok"] = {
            "followers": tk.followers,
            "follower_growth_30d": tk.follower_growth_30d,
            "avg_video_views": tk.avg_video_views,
            "avg_completion_rate_pct": tk.avg_completion_rate_pct,
        }
    return {
        "traffic_sources": traffic_sources,
        "top_channel": top_channel,
        "top_channel_share": top_share,
        "bounce_rate_pct": ga4.bounce_rate_pct,
        "avg_session_duration_sec": ga4.avg_session_duration_sec,
        "social": social,
    }


def _link_external_signals(external_signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    links = []
    for signal in external_signals:
        title = f"{signal.get('title', '')} {signal.get('description', '')}".lower()
        matched_metrics: list[str] = []
        for keyword, metrics in _KEYWORDS_TO_METRICS.items():
            if keyword in title:
                matched_metrics.extend(metrics)
        matched_metrics = sorted(set(matched_metrics))
        if matched_metrics:
            links.append({
                "signal": signal.get("title"),
                "source": signal.get("source"),
                "direction": signal.get("direction"),
                "confidence": signal.get("confidence"),
                "linked_metrics": matched_metrics,
                "rationale": "Keyword-Match zwischen externem Signal und internen KPI-Treibern.",
            })
    return links


def _build_alerts(events: list, external_signals: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    reactive = []
    proactive = []

    for event in events:
        if event.severity in {"critical", "high"} and event.direction == "down":
            reactive.append({
                "type": "performance_drop",
                "title": event.metric_label,
                "summary": event.summary,
                "severity": event.severity,
                "delta_pct": event.delta_pct,
            })
        if event.data_quality < 55:
            reactive.append({
                "type": "data_quality",
                "title": f"Datenqualität niedrig ({event.metric_label})",
                "summary": f"Coverage {event.data_quality}%. Mehr Datenquellen anbinden.",
                "severity": "medium",
            })

    for signal in external_signals:
        if signal.get("confidence", 0) >= 60:
            proactive.append({
                "type": "external_signal",
                "title": signal.get("title"),
                "summary": signal.get("description"),
                "impact_window_days": signal.get("impact_window_days"),
                "direction": signal.get("direction"),
                "confidence": signal.get("confidence"),
                "source": signal.get("source"),
                "url": signal.get("url"),
            })

    return {"reactive": reactive, "proactive": proactive}


def _build_proactive_strategies(metric_summary: dict[str, Any], external_links: list[dict[str, Any]]) -> list[dict[str, Any]]:
    strategies: list[dict[str, Any]] = []
    for metric, stats in metric_summary.items():
        trend = stats.get("trend")
        trend_pct = float(stats.get("trend_pct", 0.0))
        if trend == "up" and trend_pct >= 3:
            strategies.append({
                "type": "scale_up",
                "metric": metric,
                "title": f"{metric} skaliert positiv",
                "rationale": f"Trend +{trend_pct:.1f}%. Jetzt Budget und Distribution hochfahren.",
                "priority": "high" if trend_pct >= 8 else "medium",
            })
        if trend == "down" and trend_pct <= -3:
            strategies.append({
                "type": "stabilize",
                "metric": metric,
                "title": f"{metric} fällt",
                "rationale": f"Trend {trend_pct:.1f}%. Ursachen prüfen und Gegenmaßnahmen starten.",
                "priority": "high" if trend_pct <= -8 else "medium",
            })
    for link in external_links[:3]:
        strategies.append({
            "type": "external_opportunity",
            "metric": ", ".join(link.get("linked_metrics", [])),
            "title": f"Externer Impuls: {link.get('signal')}",
            "rationale": f"{link.get('source')} signalisiert Chance/Risiko. Frühzeitig handeln.",
            "priority": "medium",
        })
    return strategies


def _action_quality_checks(recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    seen: dict[tuple[str, str], list[str]] = {}
    duplicates = []
    conflicts = []
    for rec in recommendations:
        key = (rec.get("metric"), rec.get("category"))
        seen.setdefault(key, []).append(rec.get("id"))
    for key, ids in seen.items():
        if len(ids) > 1:
            duplicates.append({"metric": key[0], "category": key[1], "recommendation_ids": ids})
    # Conflicts: same metric with opposite direction
    direction_map: dict[str, set[str]] = {}
    for rec in recommendations:
        metric = rec.get("metric") or "unknown"
        direction_map.setdefault(metric, set()).add(rec.get("direction", ""))
    for metric, dirs in direction_map.items():
        if "up" in dirs and "down" in dirs:
            conflicts.append({"metric": metric, "issue": "Widersprüchliche Richtungen in Empfehlungen."})
    return {"duplicates": duplicates, "conflicts": conflicts}


def _build_prepared_actions(recommendations: list[dict[str, Any]], role: str, policy_settings: dict[str, Any]) -> list[dict[str, Any]]:
    actions = []
    for item in recommendations:
        policy = build_policy_snapshot(
            role,
            item.get("risk_score"),
            item.get("impact_score"),
            settings=policy_settings,
        )
        actions.append({
            "recommendation_id": item.get("id"),
            "title": item.get("title"),
            "description": item.get("description"),
            "category": item.get("category"),
            "priority": item.get("priority"),
            "impact_score": item.get("impact_score"),
            "risk_score": item.get("risk_score"),
            "estimated_hours": item.get("estimated_hours"),
            "execution_type": item.get("action_type"),
            "target_systems": (item.get("execution_plan") or {}).get("systems", []),
            "prepared_assets": item.get("prepared_assets"),
            "policy": policy,
            "approval_required": True,
        })
    return actions


def build_enterprise_ai_response(
    db: Session,
    current_user: User,
    workspace_id: Optional[int],
    industry: str = "ecommerce",
    lookback_days: int = 30,
) -> dict[str, Any]:
    rows = get_daily_rows(db, lookback_days)
    metric_summary = _build_metric_summary(rows)
    aggregated = _safe_aggregate_data(db, lookback_days)
    marketing_mix = _build_marketing_mix(aggregated)
    crm_snapshot = _fetch_hubspot_summary() or {}

    events = get_decision_events(db, lookback_days)
    external_signals = get_external_signals(industry)
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
    event_payloads = []
    for event in events:
        event_payloads.append({
            **event.to_dict(),
            "causes": analyze_causes(event, events, context),
        })

    recommendations = build_recommendations(events, context)

    role = get_workspace_role(db, current_user, workspace_id)
    policy_settings = get_policy_settings(db, workspace_id)
    prepared_actions = _build_prepared_actions(recommendations, role, policy_settings)
    task_specs = [
        _build_task_from_recommendation(rec, context, db, workspace_id)
        for rec in recommendations
    ]
    for action, task in zip(prepared_actions, task_specs):
        action["task"] = task

    priority_map = {"high": [], "medium": [], "low": []}
    for rec in recommendations:
        priority_map.setdefault(rec.get("priority", "medium"), []).append(rec.get("title"))

    data_sources = [
        {"name": "daily_metrics", "status": "available", "rows": len(rows)},
        {"name": "decision_events", "status": "available", "count": len(events)},
        {"name": "external_signals", "status": "available", "count": len(external_signals)},
        {"name": "marketing_mix", "status": "available" if marketing_mix else "partial"},
        {"name": "crm_pipeline", "status": "available" if crm_snapshot else "missing"},
        {"name": "recommendation_outcomes", "status": "available"},
    ]

    alerts = _build_alerts(events, external_signals)
    external_links = _link_external_signals(external_signals)
    proactive_strategies = _build_proactive_strategies(metric_summary, external_links)
    micro_changes = _build_micro_changes(rows, metric_summary)
    action_checks = _action_quality_checks(recommendations)

    task_summary = {}
    try:
        tasks = db.query(Task).all()
        tasks_open = sum(1 for t in tasks if t.status == "open")
        tasks_overdue = sum(1 for t in tasks if t.due_date and t.due_date < datetime.utcnow().date() and t.status != "done")
        tasks_high = sum(1 for t in tasks if t.priority == "high" and t.status != "done")
        task_summary = {
            "open": tasks_open,
            "overdue": tasks_overdue,
            "high_priority": tasks_high,
        }
    except Exception:
        task_summary = {}

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "functions": [
            "analyze",
            "recommend",
            "predict",
            "prepare_actions",
            "alerts",
            "automation",
            "learning",
            "security",
        ],
        "data_sources": data_sources,
        "analysis": {
            "summary": f"{len(events)} relevante Signale erkannt.",
            "changes": event_payloads,
            "micro_changes": micro_changes,
            "metric_summary": metric_summary,
            "marketing_mix": marketing_mix,
            "crm_snapshot": crm_snapshot,
            "external_links": external_links,
            "tasks": task_summary,
            "data_quality": (
                {
                    "score": aggregated.data_quality.score,
                    "connected_sources": aggregated.data_quality.connected_sources,
                    "missing_sources": aggregated.data_quality.missing_sources,
                    "missing_impact": aggregated.data_quality.missing_impact,
                }
                if aggregated
                else None
            ),
        },
        "recommendations": {
            "prioritized": [
                {**rec, "task": task_specs[idx]} for idx, rec in enumerate(recommendations)
            ],
            "priority_map": priority_map,
            "quality_checks": action_checks,
            "proactive_strategies": proactive_strategies,
        },
        "predict": {
            "forecasts": _build_forecasts(metric_summary),
        },
        "alerts": alerts,
        "actions": {
            "prepared": prepared_actions,
            "approval_required": True,
        },
        "automation": {
            "execution_ready": len(prepared_actions) > 0,
            "systems": sorted({system for item in recommendations for system in (item.get("execution_plan") or {}).get("systems", [])}),
            "approval_required": True,
        },
        "learning": summarize_learning(db),
        "security": {
            "role": role,
            "approval_policy": policy_settings,
            "approval_required": True,
            "data_encryption": "aes-256-at-rest + tls-in-transit",
        },
    }
