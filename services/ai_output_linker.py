from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable, Sequence

from sqlalchemy.orm import Session

from models.custom_kpi import CustomKPI
from models.goals import Goal
from models.task import Task


@dataclass
class AIOutputEntityLinks:
    kpi_ids: list[int]
    task_ids: list[int]
    goal_ids: list[int]


def _normalize_label(value: str | None) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower())
    return " ".join(cleaned.split())


def _match_label(label: str, candidates: Sequence[tuple[int, list[str]]]) -> int | None:
    if not label:
        return None
    normalized = _normalize_label(label)
    if not normalized:
        return None
    for ident, forms in candidates:
        if normalized in forms[0] or forms[0] in normalized:
            return ident
    for ident, forms in candidates:
        if any(normalized in form or form in normalized for form in forms if form):
            return ident
    return None


def _build_candidates(items: Iterable[object], *fields: str) -> list[tuple[int, list[str]]]:
    candidates: list[tuple[int, list[str]]] = []
    for item in items:
        text_values: list[str] = []
        for field in fields:
            raw = getattr(item, field, None)
            normalized = _normalize_label(raw if isinstance(raw, str) else None)
            if normalized:
                text_values.append(normalized)
        if text_values:
            candidates.append((getattr(item, "id", 0), text_values))
    return candidates


def _match_all(labels: Iterable[str], candidates: Sequence[tuple[int, list[str]]]) -> list[int]:
    matched: list[int] = []
    seen: set[int] = set()
    for label in labels:
        ident = _match_label(label, candidates)
        if ident and ident not in seen:
            seen.add(ident)
            matched.append(ident)
    return matched


def resolve_ai_output_entity_links(
    db: Session,
    workspace_id: int,
    kpi_names: Iterable[str],
    task_titles: Iterable[str],
) -> AIOutputEntityLinks:
    candidate_kpis = (
        db.query(CustomKPI)
        .filter(CustomKPI.workspace_id == workspace_id, CustomKPI.is_active == True)
        .all()
    )
    kpi_candidates = _build_candidates(candidate_kpis, "name", "description")

    candidate_tasks = (
        db.query(Task)
        .filter(Task.workspace_id == workspace_id)
        .order_by(Task.created_at.desc())
        .all()
    )
    task_candidates = _build_candidates(candidate_tasks, "title", "description")

    candidate_goals = (
        db.query(Goal)
        .filter(Goal.workspace_id == workspace_id)
        .all()
    )
    goal_candidates = _build_candidates(candidate_goals, "title", "metric")

    kpi_ids = _match_all(kpi_names, kpi_candidates)
    task_ids = _match_all(task_titles, task_candidates)
    goal_ids = _match_all(kpi_names, goal_candidates)

    if not goal_ids and task_titles:
        goal_ids = _match_all(task_titles, goal_candidates)

    return AIOutputEntityLinks(kpi_ids=kpi_ids, task_ids=task_ids, goal_ids=goal_ids)
