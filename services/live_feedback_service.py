from __future__ import annotations

import json
import os
from datetime import date, datetime
import math
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.action_request import ActionRequest
from models.business_event import BusinessEvent
from models.recommendation_outcome import RecommendationOutcome
from models.user_integration import UserIntegration
from services.integration_execution_service import fetch_mailchimp_campaign_feedback


def _parse_json(raw: Optional[str]) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _get_integration(db: Session, user_id: int, integration_type: str) -> Optional[UserIntegration]:
    return (
        db.query(UserIntegration)
        .filter(
            UserIntegration.user_id == user_id,
            UserIntegration.integration_type == integration_type,
            UserIntegration.is_active == True,  # noqa: E712
        )
        .first()
    )


def _coerce_float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        num = float(value)
        return num if math.isfinite(num) else None
    except Exception:
        return None


def _sanitize_live_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    numeric_rules = {
        "revenue_uplift_pct": (-100.0, 500.0),
        "reach_uplift_pct": (-100.0, 1000.0),
        "new_customers": (0.0, 1_000_000.0),
        "open_rate": (0.0, 100.0),
        "click_rate": (0.0, 100.0),
    }
    for key, value in metrics.items():
        if key in numeric_rules:
            coerced = _coerce_float(value)
            if coerced is None:
                continue
            minimum, maximum = numeric_rules[key]
            if coerced < minimum:
                coerced = minimum
            if coerced > maximum:
                coerced = maximum
            clean[key] = coerced
        else:
            # Keep non-numeric metadata if it's a short string.
            if isinstance(value, str) and value.strip():
                clean[key] = value.strip()[:200]
    return clean


def _estimate_actual_impact(metrics: dict[str, Any]) -> Optional[float]:
    components: list[float] = []
    revenue = _coerce_float(metrics.get("revenue_uplift_pct"))
    if revenue is not None:
        components.append(revenue)
    reach = _coerce_float(metrics.get("reach_uplift_pct"))
    if reach is not None:
        components.append(reach * 0.55)
    customers = _coerce_float(metrics.get("new_customers"))
    if customers is not None:
        components.append(min(20.0, customers * 1.4))
    open_rate = _coerce_float(metrics.get("open_rate"))
    if open_rate is not None:
        components.append(max(0.0, (open_rate - 18.0) * 0.35))
    click_rate = _coerce_float(metrics.get("click_rate"))
    if click_rate is not None:
        components.append(max(0.0, (click_rate - 1.5) * 1.4))
    return round(sum(components), 1) if components else None


def _append_business_event(db: Session, action: ActionRequest, source: str, metrics: dict[str, Any], note: Optional[str]) -> None:
    revenue = _coerce_float(metrics.get("revenue_uplift_pct"))
    reach = _coerce_float(metrics.get("reach_uplift_pct"))
    impactful = (revenue is not None and abs(revenue) >= 5.0) or (reach is not None and abs(reach) >= 10.0)
    if not impactful:
        return

    title = f"Live Feedback: {action.title}"
    today = date.today().isoformat()
    exists = (
        db.query(BusinessEvent)
        .filter(
            BusinessEvent.workspace_id == action.workspace_id,
            BusinessEvent.event_date == today,
            BusinessEvent.title == title,
        )
        .first()
    )
    if exists:
        return

    summary_parts = [f"Quelle: {source}"]
    if revenue is not None:
        summary_parts.append(f"Umsatz-Effekt {revenue:+.1f}%")
    if reach is not None:
        summary_parts.append(f"Reichweiten-Effekt {reach:+.1f}%")
    if note:
        summary_parts.append(note)

    db.add(BusinessEvent(
        workspace_id=action.workspace_id,
        event_date=today,
        title=title,
        description=" | ".join(summary_parts)[:1000],
        category="external",
        expected_impact="positive" if (revenue or 0) >= 0 else "negative",
    ))


def ingest_live_feedback(
    db: Session,
    action: ActionRequest,
    source: str,
    metrics: dict[str, Any],
    note: Optional[str] = None,
) -> dict[str, Any]:
    payload = _parse_json(action.live_feedback_json)
    entries = payload.get("entries") or []
    aggregate = payload.get("aggregate") or {}
    synced_at = datetime.utcnow().isoformat()

    clean_metrics = _sanitize_live_metrics(metrics)
    entries.append({
        "source": source,
        "metrics": clean_metrics,
        "note": note,
        "synced_at": synced_at,
    })
    for key, value in clean_metrics.items():
        aggregate[key] = value
    aggregate["last_source"] = source
    aggregate["last_synced_at"] = synced_at
    payload = {"entries": entries[-15:], "aggregate": aggregate}

    action.live_feedback_json = json.dumps(payload)
    action.last_live_sync_at = datetime.utcnow()

    impact = _estimate_actual_impact(aggregate)
    outcome = (
        db.query(RecommendationOutcome)
        .filter(RecommendationOutcome.action_request_id == action.id)
        .order_by(RecommendationOutcome.created_at.desc())
        .first()
    )
    if outcome:
        if impact is not None:
            outcome.actual_impact_pct = impact
            outcome.actual_roi_score = round(max(0.0, impact * 1.15 - (action.risk_score or 0.0) * 0.2), 1)
        outcome.status = "live_tracking"
        existing_note = (outcome.learning_note or "").strip()
        note_part = f"{source}: {note}" if note else f"{source}: Live-Sync aktualisiert"
        outcome.learning_note = f"{existing_note} | {note_part}".strip(" |")

    progress_pct = action.progress_pct or 0.0
    if impact is not None and impact >= max((action.impact_score or 0.0) * 0.35, 8.0):
        action.progress_pct = max(progress_pct, 96.0)
        action.progress_stage = "measuring"
        action.next_action_text = "Live-Signale positiv. Skalierung oder zweite Welle vorbereiten."
    elif impact is not None and impact > 0:
        action.progress_pct = max(progress_pct, 82.0)
        action.progress_stage = "measuring"
        action.next_action_text = "Signal ist positiv. Weitere 24-48h beobachten."
    else:
        action.progress_pct = max(progress_pct, 68.0)
        action.progress_stage = "needs_attention"
        action.next_action_text = "Live-Signale schwach. Ursache prüfen und Strategie nachjustieren."

    _append_business_event(db, action, source, aggregate, note)
    db.flush()
    return payload


async def sync_action_live_feedback(
    db: Session,
    user_id: int,
    workspace_id: int,
    action: ActionRequest,
) -> dict[str, Any]:
    del workspace_id
    artifact = _parse_json(action.artifact_payload)
    synced_sources: list[str] = []
    last_payload: dict[str, Any] = _parse_json(action.live_feedback_json)

    campaign_id = ((artifact.get("mailchimp") or {}).get("campaign_id"))
    if campaign_id:
        mailchimp_metrics = await fetch_mailchimp_campaign_feedback(db, user_id, campaign_id)
        if mailchimp_metrics:
            last_payload = ingest_live_feedback(
                db,
                action,
                "mailchimp",
                mailchimp_metrics,
                note="Kampagnen-Performance aus Mailchimp synchronisiert",
            )
            synced_sources.append("mailchimp")

    webhook_artifact = artifact.get("webhook") or {}
    if webhook_artifact.get("status_code"):
        last_payload.setdefault("aggregate", {})["webhook_status_code"] = webhook_artifact.get("status_code")

    if not synced_sources:
        return {
            "synced": False,
            "message": "Keine live-fähigen Artefakte für diese Action gefunden.",
            "live_feedback": last_payload or None,
        }

    return {
        "synced": True,
        "sources": synced_sources,
        "live_feedback": last_payload,
    }


def find_action_for_live_feedback(
    db: Session,
    action_request_id: Optional[int],
    execution_ref: Optional[str],
) -> Optional[ActionRequest]:
    if action_request_id:
        row = db.query(ActionRequest).filter(ActionRequest.id == action_request_id).first()
        if row:
            return row
    if execution_ref:
        return db.query(ActionRequest).filter(ActionRequest.execution_ref == execution_ref).first()
    return None


def validate_live_feedback_secret(db: Session, provided_secret: Optional[str]) -> bool:
    if not provided_secret:
        return False
    env_secret = os.getenv("INTLYST_LIVE_FEEDBACK_SECRET", "").strip()
    if env_secret and provided_secret == env_secret:
        return True
    match = (
        db.query(UserIntegration)
        .filter(
            UserIntegration.integration_type == "webhook",
            UserIntegration.is_active == True,  # noqa: E712
        )
        .all()
    )
    for row in match:
        if row.get_credentials().get("secret") == provided_secret:
            return True
    return False
