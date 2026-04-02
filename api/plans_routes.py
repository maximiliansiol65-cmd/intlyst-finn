from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import engine, get_db
from models.base import Base
from models.plan import Plan

router = APIRouter(prefix="/api/plans", tags=["plans"])

Base.metadata.create_all(bind=engine)


class PlanCreate(BaseModel):
    title: Optional[str] = None
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class PlanUpdate(BaseModel):
    title: Optional[str] = None
    user_id: Optional[int] = None
    team_id: Optional[int] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None


def _payload(row: Plan) -> dict:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "user_id": row.user_id,
        "team_id": row.team_id,
        "title": row.title,
        "period_start": row.period_start.isoformat() if row.period_start else None,
        "period_end": row.period_end.isoformat() if row.period_end else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    rows = db.query(Plan).filter(Plan.workspace_id == workspace_id).order_by(Plan.created_at.desc()).all()
    return {"items": [_payload(row) for row in rows]}


@router.post("")
def create_plan(
    body: PlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    row = Plan(
        workspace_id=workspace_id,
        user_id=body.user_id or current_user.id,
        team_id=body.team_id,
        title=body.title,
        period_start=body.period_start,
        period_end=body.period_end,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.get("/{plan_id}")
def get_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Plan).filter(Plan.id == plan_id, Plan.workspace_id == workspace_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden.")
    return _payload(row)


@router.patch("/{plan_id}")
def update_plan(
    plan_id: int,
    body: PlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Plan).filter(Plan.id == plan_id, Plan.workspace_id == workspace_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.delete("/{plan_id}")
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Plan).filter(Plan.id == plan_id, Plan.workspace_id == workspace_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Plan nicht gefunden.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": plan_id}
