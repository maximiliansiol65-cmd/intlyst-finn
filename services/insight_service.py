"""
insight_service.py
Generates, persists, and retrieves Insight records.
Links insights to tasks and goals.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.insight import Insight
from models.activity_log_di import ActivityLog

logger = logging.getLogger(__name__)


# ── Role-to-insight-type mapping ───────────────────────────────────────────────
_ROLE_INSIGHT_TYPES: dict[str, list[str]] = {
    "ceo": ["problem", "opportunity", "trend", "benchmark"],
    "coo": ["problem", "root_cause", "review"],
    "cmo": ["marketing", "trend", "opportunity"],
    "cfo": ["finance", "root_cause", "trend"],
    "strategist": ["opportunity", "benchmark", "market", "trend"],
    "assistant": ["review", "problem"],
}


def create_insight(
    db: Session,
    workspace_id: int,
    title: str,
    insight_type: str = "problem",
    what_happened: str | None = None,
    why_it_happened: str | None = None,
    what_it_means: str | None = None,
    what_to_do: str | None = None,
    expected_outcome: str | None = None,
    affected_kpi_ids: list[int] | None = None,
    priority: str = "medium",
    confidence_score: float = 70.0,
    impact_score: float = 50.0,
    target_role: str | None = None,
    generated_by_ai_role: str | None = None,
    period_start: datetime | None = None,
    period_end: datetime | None = None,
    linked_goal_ids: list[int] | None = None,
    actor_user_id: int | None = None,
) -> Insight:
    """Create and persist a new Insight record."""
    insight = Insight(
        workspace_id=workspace_id,
        title=title,
        insight_type=insight_type,
        what_happened=what_happened,
        why_it_happened=why_it_happened,
        what_it_means=what_it_means,
        what_to_do=what_to_do,
        expected_outcome=expected_outcome,
        # Legacy compat
        problem=what_happened,
        cause=why_it_happened,
        measure=what_to_do,
        affected_kpi_ids=json.dumps(affected_kpi_ids or []),
        priority=priority,
        confidence_score=confidence_score,
        impact_score=impact_score,
        target_role=target_role,
        generated_by_ai_role=generated_by_ai_role,
        period_start=period_start,
        period_end=period_end,
        linked_goal_ids=json.dumps(linked_goal_ids or []),
        status="new",
    )
    db.add(insight)
    db.flush()

    # Audit log
    _log_activity(
        db,
        workspace_id=workspace_id,
        user_id=actor_user_id,
        ai_agent_role=generated_by_ai_role,
        action_type="create",
        entity_type="insight",
        entity_id=str(insight.id),
        reason=f"Insight generated: {insight_type}",
    )

    db.commit()
    db.refresh(insight)
    logger.info("Insight %s created (workspace=%s type=%s)", insight.id, workspace_id, insight_type)
    return insight


def get_insights(
    db: Session,
    workspace_id: int,
    role: str | None = None,
    insight_type: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    limit: int = 50,
) -> list[Insight]:
    """Return insights filtered by role, type, status, priority."""
    q = db.query(Insight).filter(Insight.workspace_id == workspace_id)

    if role and role != "all":
        allowed_types = _ROLE_INSIGHT_TYPES.get(role, [])
        if allowed_types:
            q = q.filter(
                (Insight.target_role == role)
                | (Insight.target_role == "all")
                | (Insight.target_role.is_(None))
                | (Insight.insight_type.in_(allowed_types))
            )
    if insight_type:
        q = q.filter(Insight.insight_type == insight_type)
    if status:
        q = q.filter(Insight.status == status)
    if priority:
        q = q.filter(Insight.priority == priority)

    return (
        q.order_by(Insight.impact_score.desc(), Insight.created_at.desc())
        .limit(limit)
        .all()
    )


def get_insight_by_id(db: Session, workspace_id: int, insight_id: int) -> Insight | None:
    return (
        db.query(Insight)
        .filter(Insight.workspace_id == workspace_id, Insight.id == insight_id)
        .first()
    )


def acknowledge_insight(
    db: Session,
    workspace_id: int,
    insight_id: int,
    user_id: int | None = None,
) -> Insight | None:
    insight = get_insight_by_id(db, workspace_id, insight_id)
    if not insight:
        return None
    insight.status = "acknowledged"
    insight.updated_at = datetime.utcnow()
    _log_activity(
        db, workspace_id=workspace_id, user_id=user_id,
        action_type="update", entity_type="insight", entity_id=str(insight_id),
        field_changed="status", old_value="new", new_value="acknowledged",
    )
    db.commit()
    return insight


def submit_insight_feedback(
    db: Session,
    workspace_id: int,
    insight_id: int,
    rating: int,  # 1–5
    comment: str | None = None,
    user_id: int | None = None,
) -> Insight | None:
    insight = get_insight_by_id(db, workspace_id, insight_id)
    if not insight:
        return None
    # Store feedback in structured_data field (reuse linked_task_ids slot or add json)
    insight.updated_at = datetime.utcnow()
    _log_activity(
        db, workspace_id=workspace_id, user_id=user_id,
        action_type="feedback", entity_type="insight", entity_id=str(insight_id),
        new_value=json.dumps({"rating": rating, "comment": comment}),
    )
    db.commit()
    return insight


def link_tasks_to_insight(
    db: Session,
    workspace_id: int,
    insight_id: int,
    task_ids: list[int],
) -> Insight | None:
    """Link created tasks back to their source insight."""
    insight = get_insight_by_id(db, workspace_id, insight_id)
    if not insight:
        return None
    existing = json.loads(insight.linked_task_ids or "[]")
    merged = list(set(existing + task_ids))
    insight.linked_task_ids = json.dumps(merged)
    insight.updated_at = datetime.utcnow()
    db.commit()
    return insight


# ── Internal helpers ───────────────────────────────────────────────────────────

def _log_activity(
    db: Session,
    workspace_id: int,
    action_type: str,
    entity_type: str,
    user_id: int | None = None,
    ai_agent_role: str | None = None,
    entity_id: str | None = None,
    field_changed: str | None = None,
    old_value: str | None = None,
    new_value: str | None = None,
    reason: str | None = None,
    consequence: str | None = None,
) -> None:
    try:
        log = ActivityLog(
            workspace_id=workspace_id,
            user_id=user_id,
            ai_agent_role=ai_agent_role,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=entity_id,
            field_changed=field_changed,
            old_value=old_value,
            new_value=new_value,
            reason=reason,
            consequence=consequence,
        )
        db.add(log)
    except Exception as exc:
        logger.warning("Failed to write activity log: %s", exc)
