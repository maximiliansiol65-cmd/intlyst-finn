from __future__ import annotations

import json
from typing import Iterable

from sqlalchemy.orm import Session

from models.insight import Insight
from models.goals import Goal
from models.junction_tables import GoalKPI, InsightGoal, InsightTask, TaskGoal


def _normalize_ids(ids: Iterable[int | str] | None) -> list[int]:
    normalized: list[int] = []
    seen: set[int] = set()
    for value in ids or []:
        try:
            item = int(value)
        except (TypeError, ValueError):
            continue
        if item <= 0 or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


def _parse_json_ids(payload: str | None) -> list[int]:
    if not payload:
        return []
    try:
        data = json.loads(payload)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return _normalize_ids(data)


def _replace_links(
    db: Session,
    model,
    workspace_id: int,
    source_field: str,
    source_id: int,
    target_field: str,
    target_ids: Iterable[int | str] | None,
) -> list[int]:
    normalized_ids = _normalize_ids(target_ids)
    (
        db.query(model)
        .filter(
            model.workspace_id == workspace_id,
            getattr(model, source_field) == source_id,
        )
        .delete(synchronize_session=False)
    )
    for target_id in normalized_ids:
        db.add(
            model(
                workspace_id=workspace_id,
                **{source_field: source_id, target_field: target_id},
            )
        )
    db.flush()
    return normalized_ids


def sync_goal_kpi_links(db: Session, workspace_id: int, goal_id: int, kpi_ids: Iterable[int | str] | None) -> list[int]:
    normalized_ids = _replace_links(db, GoalKPI, workspace_id, "goal_id", goal_id, "kpi_id", kpi_ids)
    goal = (
        db.query(Goal)
        .filter(Goal.workspace_id == workspace_id, Goal.id == goal_id)
        .first()
    )
    if goal:
        goal.linked_kpi_ids = json.dumps(normalized_ids)
        db.flush()
    return normalized_ids


def sync_insight_task_links(db: Session, workspace_id: int, insight_id: int, task_ids: Iterable[int | str] | None) -> list[int]:
    normalized_ids = _replace_links(db, InsightTask, workspace_id, "insight_id", insight_id, "task_id", task_ids)
    insight = (
        db.query(Insight)
        .filter(Insight.workspace_id == workspace_id, Insight.id == insight_id)
        .first()
    )
    if insight:
        insight.linked_task_ids = json.dumps(normalized_ids)
        db.flush()
    return normalized_ids


def sync_insight_goal_links(db: Session, workspace_id: int, insight_id: int, goal_ids: Iterable[int | str] | None) -> list[int]:
    normalized_ids = _replace_links(db, InsightGoal, workspace_id, "insight_id", insight_id, "goal_id", goal_ids)
    insight = (
        db.query(Insight)
        .filter(Insight.workspace_id == workspace_id, Insight.id == insight_id)
        .first()
    )
    if insight:
        insight.linked_goal_ids = json.dumps(normalized_ids)
        db.flush()
    return normalized_ids


def sync_task_goal_links(db: Session, workspace_id: int, task_id: int, goal_ids: Iterable[int | str] | None) -> list[int]:
    return _replace_links(db, TaskGoal, workspace_id, "task_id", task_id, "goal_id", goal_ids)


def get_goal_kpi_ids(db: Session, workspace_id: int, goal_id: int) -> list[int]:
    rows = (
        db.query(GoalKPI.kpi_id)
        .filter(GoalKPI.workspace_id == workspace_id, GoalKPI.goal_id == goal_id)
        .all()
    )
    resolved = _normalize_ids(row[0] for row in rows)
    if resolved:
        return resolved
    goal = db.query(Goal).filter(Goal.workspace_id == workspace_id, Goal.id == goal_id).first()
    return _parse_json_ids(goal.linked_kpi_ids if goal else None)


def get_insight_task_ids(db: Session, workspace_id: int, insight_id: int) -> list[int]:
    rows = (
        db.query(InsightTask.task_id)
        .filter(InsightTask.workspace_id == workspace_id, InsightTask.insight_id == insight_id)
        .all()
    )
    resolved = _normalize_ids(row[0] for row in rows)
    if resolved:
        return resolved
    insight = db.query(Insight).filter(Insight.workspace_id == workspace_id, Insight.id == insight_id).first()
    return _parse_json_ids(insight.linked_task_ids if insight else None)


def get_insight_goal_ids(db: Session, workspace_id: int, insight_id: int) -> list[int]:
    rows = (
        db.query(InsightGoal.goal_id)
        .filter(InsightGoal.workspace_id == workspace_id, InsightGoal.insight_id == insight_id)
        .all()
    )
    resolved = _normalize_ids(row[0] for row in rows)
    if resolved:
        return resolved
    insight = db.query(Insight).filter(Insight.workspace_id == workspace_id, Insight.id == insight_id).first()
    return _parse_json_ids(insight.linked_goal_ids if insight else None)


def get_task_goal_ids(db: Session, workspace_id: int, task_id: int) -> list[int]:
    rows = (
        db.query(TaskGoal.goal_id)
        .filter(TaskGoal.workspace_id == workspace_id, TaskGoal.task_id == task_id)
        .all()
    )
    return _normalize_ids(row[0] for row in rows)
