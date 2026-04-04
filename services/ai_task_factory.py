from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from models.ai_output import AIOutput
from models.task import Task
from services.ai_output_linker import AIOutputEntityLinks
from services.ai_output_schema import AIOutputStructured
from services.relationship_service import sync_task_goal_links


def _normalize_phrase(value: str | None) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", (value or "").strip().lower())
    return " ".join(cleaned.split())


def _build_existing_titles(db: Session, workspace_id: int) -> dict[str, int]:
    rows = (
        db.query(Task.id, Task.title)
        .filter(Task.workspace_id == workspace_id)
        .all()
    )
    return {
        _normalize_phrase(row.title): row.id
        for row in rows
        if row.title
    }


def create_tasks_from_ai_output(
    db: Session,
    workspace_id: int,
    output: AIOutput,
    structured: AIOutputStructured,
    asset_links: AIOutputEntityLinks,
) -> list[int]:
    if not structured.suggested_tasks:
        return []

    normalized_existing = _build_existing_titles(db, workspace_id)
    created: list[int] = []
    for suggestion in structured.suggested_tasks:
        normalized = _normalize_phrase(suggestion)
        if not normalized or normalized in normalized_existing:
            continue

        task = Task(
            workspace_id=workspace_id,
            title=suggestion,
            description=f"AI-Empfehlung: {structured.recommended_action}",
            priority="medium",
            impact="medium",
            status="open",
            source_type="ai_suggestion",
            trigger_reason=f"AIOutput {output.id}",
            recommendation_id=output.id,
            expected_result=structured.expected_outcome,
            goal=structured.business_meaning,
            steps_json=json.dumps([structured.recommended_action]) if structured.recommended_action else None,
            kpis_json=json.dumps(structured.affected_kpi_names) if structured.affected_kpi_names else None,
            created_by="ai_system",
        )
        db.add(task)
        db.flush()
        created.append(task.id)
        normalized_existing[normalized] = task.id

        if asset_links.goal_ids:
            sync_task_goal_links(db, workspace_id, task.id, asset_links.goal_ids)

    return created
