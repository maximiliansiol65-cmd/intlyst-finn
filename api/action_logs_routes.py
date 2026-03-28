import json
from datetime import date as dt_date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models.action_logs import ActionLog
from models.action_request import ActionRequest
from api.auth_routes import User, get_current_user, get_current_workspace_id
from services.decision_service import build_action_system

router = APIRouter(prefix="/api/actions", tags=["actions"])


def _created_at_iso(value) -> Optional[str]:
    return value.isoformat() if getattr(value, "isoformat", None) else None


def _roi_score(action: dict) -> float:
    """Lightweight ROI proxy combining impact and risk."""
    impact = float(action.get("impact_score") or action.get("expected_effect_pct") or 0)
    risk = float(action.get("risk_score") or 12.0)
    return round(max(0.0, impact - risk * 0.3), 2)


def _execution_targets(execution_type: str) -> list[str]:
    mapping = {
        "task": ["intlyst_tasks", "hubspot", "trello", "slack"],
        "email_draft": ["intlyst_email_draft", "mailchimp", "slack"],
        "report": ["intlyst_reports", "notion", "slack"],
        "strategy_bundle": [
            "intlyst_tasks",
            "intlyst_email_draft",
            "social_drafts",
            "mailchimp",
            "hubspot",
            "trello",
            "slack",
            "notion",
        ],
    }
    return mapping.get(execution_type, ["intlyst_tasks"])


def _serialize_action(action: dict) -> dict:
    return {
        "id": action.get("action_id") or action.get("id"),
        "title": action.get("title"),
        "description": action.get("description"),
        "category": action.get("category") or action.get("priority_category") or "operations",
        "priority": str(action.get("priority") or "medium").lower(),
        "impact_score": action.get("impact_score"),
        "expected_effect_pct": action.get("expected_effect_pct"),
        "roi_score": _roi_score(action),
        "duration_min": action.get("duration_min"),
        "deadline": action.get("deadline"),
        "task_payload": action.get("task_payload"),
        "conversion_options": [
            {"execution_type": "task", "label": "Als Aufgabe"},
            {"execution_type": "email_draft", "label": "E-Mail-Kampagne"},
            {"execution_type": "strategy_bundle", "label": "Social/Posts"},
            {"execution_type": "report", "label": "Report"},
        ],
    }


class ActionLogCreate(BaseModel):
    date: dt_date = Field(default_factory=dt_date.today)
    title: str
    description: Optional[str] = None
    category: Literal["marketing", "product", "sales", "operations"]
    impact_pct: Optional[float] = None
    status: Literal["done", "pending"] = "done"


class ActionLogUpdate(BaseModel):
    date: Optional[dt_date] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[Literal["marketing", "product", "sales", "operations"]] = None
    impact_pct: Optional[float] = None
    status: Optional[Literal["done", "pending"]] = None


class ActionConversionBody(BaseModel):
    execution_type: Literal["task", "email_draft", "report", "strategy_bundle"] = "task"
    assigned_to: Optional[str] = None


@router.get("")
def list_action_logs(
    category: Optional[Literal["marketing", "product", "sales", "operations"]] = Query(default=None),
    status: Optional[Literal["done", "pending"]] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    # Scope to the active workspace to avoid cross-tenant leakage
    query = db.query(ActionLog).filter(ActionLog.workspace_id == workspace_id)
    if category:
        query = query.filter(ActionLog.category == category)
    if status:
        query = query.filter(ActionLog.status == status)

    rows = query.order_by(desc(ActionLog.date), desc(ActionLog.id)).limit(limit).all()

    return {
        "count": len(rows),
        "items": [
            {
                "id": row.id,
                "date": str(row.date),
                "title": row.title,
                "description": row.description,
                "category": row.category,
                "impact_pct": row.impact_pct,
                "status": row.status,
                "created_at": _created_at_iso(getattr(row, "created_at", None)),
            }
            for row in rows
        ],
    }


@router.post("")
def create_action_log(
    payload: ActionLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    row = ActionLog(
        workspace_id=workspace_id,
        date=payload.date,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        impact_pct=payload.impact_pct,
        status=payload.status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "date": str(row.date),
        "title": row.title,
        "description": row.description,
        "category": row.category,
        "impact_pct": row.impact_pct,
        "status": row.status,
        "created_at": _created_at_iso(getattr(row, "created_at", None)),
    }


@router.put("/{log_id}")
def update_action_log(
    log_id: int,
    payload: ActionLogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    row = (
        db.query(ActionLog)
        .filter(ActionLog.id == log_id, ActionLog.workspace_id == workspace_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Action log not found.")

    updates = payload.model_dump(exclude_unset=True)
    for field_name, value in updates.items():
        setattr(row, field_name, value)

    db.commit()
    db.refresh(row)

    return {
        "id": row.id,
        "date": str(row.date),
        "title": row.title,
        "description": row.description,
        "category": row.category,
        "impact_pct": row.impact_pct,
        "status": row.status,
        "created_at": _created_at_iso(getattr(row, "created_at", None)),
    }


@router.delete("/{log_id}")
def delete_action_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    row = (
        db.query(ActionLog)
        .filter(ActionLog.id == log_id, ActionLog.workspace_id == workspace_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Action log not found.")

    db.delete(row)
    db.commit()
    return {"message": "Action log deleted successfully.", "id": log_id}


@router.get("/next")
def list_future_actions(
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Surface KI-basierte Aktionsvorschläge mit ROI-Signal."""
    del current_user  # Auth ist bereits enforced
    system = build_action_system(db)
    actions_raw = (system.get("top_actions") or []) + (system.get("background_actions") or [])
    actions_raw = actions_raw[:limit]
    items = [_serialize_action(a) for a in actions_raw]
    return {
        "status": system.get("status"),
        "problem": system.get("problem"),
        "cause": system.get("cause"),
        "count": len(items),
        "items": items,
    }


@router.post("/next/{action_id}/convert")
def convert_action_to_request(
    action_id: str,
    payload: ActionConversionBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Wandelt einen Vorschlag in eine ausfuehrbare Action Request um (Task/Post/Email)."""
    system = build_action_system(db)
    actions_raw = (system.get("top_actions") or []) + (system.get("background_actions") or [])
    selected = next((a for a in actions_raw if (a.get("action_id") or a.get("id")) == action_id), None)
    if not selected:
        raise HTTPException(status_code=404, detail="Action not found in recommendations.")

    execution_type = payload.execution_type
    target_systems = _execution_targets(execution_type)
    est_hours = None
    if selected.get("duration_min"):
        est_hours = round(float(selected["duration_min"]) / 60.0, 2)

    request = ActionRequest(
        workspace_id=workspace_id,
        recommendation_id=action_id,
        title=selected.get("title") or "Maßnahme",
        description=selected.get("description"),
        category=selected.get("category") or "operations",
        priority=str(selected.get("priority") or "medium").lower(),
        impact_score=selected.get("impact_score") or selected.get("expected_effect_pct"),
        risk_score=selected.get("risk_score") or 12.0,
        estimated_hours=est_hours,
        execution_type=execution_type,
        status="approved",
        requested_by=current_user.email,
        approved_by=current_user.email,
        execution_plan_json=json.dumps(selected.get("task_payload") or {}),
        target_systems_json=json.dumps(target_systems),
        progress_pct=10.0,
        progress_stage="queued",
        next_action_text="Automatisch erzeugt aus Forecast – jetzt im Team starten.",
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    return {
        "message": "Action in Ausführung umgewandelt.",
        "execution_type": execution_type,
        "target_systems": target_systems,
        "action_request_id": request.id,
        "title": request.title,
        "status": request.status,
    }
