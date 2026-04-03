from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import engine, get_db
from models.base import Base
from models.work_schedule import WorkSchedule

router = APIRouter(prefix="/api/work-schedules", tags=["work-schedules"])

Base.metadata.create_all(bind=engine)


class WorkScheduleCreate(BaseModel):
    user_id: Optional[int] = None
    timezone: Optional[str] = "Europe/Berlin"
    weekly_hours_json: Optional[str] = None
    exceptions_json: Optional[str] = None


class WorkScheduleUpdate(BaseModel):
    user_id: Optional[int] = None
    timezone: Optional[str] = None
    weekly_hours_json: Optional[str] = None
    exceptions_json: Optional[str] = None


def _payload(row: WorkSchedule) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "workspace_id": row.workspace_id,
        "timezone": row.timezone,
        "weekly_hours_json": row.weekly_hours_json,
        "exceptions_json": row.exceptions_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_work_schedules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    rows = db.query(WorkSchedule).filter(WorkSchedule.workspace_id == workspace_id).all()
    return {"items": [_payload(row) for row in rows]}


@router.post("")
def create_work_schedule(
    body: WorkScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    row = WorkSchedule(
        user_id=body.user_id or current_user.id,
        workspace_id=workspace_id,
        timezone=body.timezone,
        weekly_hours_json=body.weekly_hours_json,
        exceptions_json=body.exceptions_json,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.get("/{schedule_id}")
def get_work_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(WorkSchedule).filter(
        WorkSchedule.id == schedule_id,
        WorkSchedule.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Work-Schedule nicht gefunden.")
    return _payload(row)


@router.patch("/{schedule_id}")
def update_work_schedule(
    schedule_id: int,
    body: WorkScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(WorkSchedule).filter(
        WorkSchedule.id == schedule_id,
        WorkSchedule.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Work-Schedule nicht gefunden.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.delete("/{schedule_id}")
def delete_work_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(WorkSchedule).filter(
        WorkSchedule.id == schedule_id,
        WorkSchedule.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Work-Schedule nicht gefunden.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": schedule_id}
