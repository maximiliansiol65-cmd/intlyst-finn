from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import get_db
from models.time_block import TimeBlock
from models.plan import Plan

router = APIRouter(prefix="/api/time-blocks", tags=["time-blocks"])


class TimeBlockCreate(BaseModel):
    plan_id: Optional[int] = None
    task_id: Optional[int] = None
    title: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class TimeBlockUpdate(BaseModel):
    plan_id: Optional[int] = None
    task_id: Optional[int] = None
    title: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


def _payload(row: TimeBlock) -> dict:
    return {
        "id": row.id,
        "plan_id": row.plan_id,
        "task_id": row.task_id,
        "title": row.title,
        "starts_at": row.starts_at.isoformat() if row.starts_at else None,
        "ends_at": row.ends_at.isoformat() if row.ends_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_time_blocks(
    plan_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    query = db.query(TimeBlock)
    if plan_id is not None:
        query = query.filter(TimeBlock.plan_id == plan_id)
    rows = query.order_by(TimeBlock.created_at.desc()).all()
    return {"items": [_payload(row) for row in rows]}


@router.post("")
def create_time_block(
    body: TimeBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    if body.plan_id is not None:
        plan = db.query(Plan).filter(Plan.id == body.plan_id, Plan.workspace_id == workspace_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan nicht gefunden.")
    row = TimeBlock(
        plan_id=body.plan_id,
        task_id=body.task_id,
        title=body.title,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.get("/{time_block_id}")
def get_time_block(
    time_block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user, workspace_id
    row = db.query(TimeBlock).filter(TimeBlock.id == time_block_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Time-Block nicht gefunden.")
    return _payload(row)


@router.patch("/{time_block_id}")
def update_time_block(
    time_block_id: int,
    body: TimeBlockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user, workspace_id
    row = db.query(TimeBlock).filter(TimeBlock.id == time_block_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Time-Block nicht gefunden.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.delete("/{time_block_id}")
def delete_time_block(
    time_block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user, workspace_id
    row = db.query(TimeBlock).filter(TimeBlock.id == time_block_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Time-Block nicht gefunden.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": time_block_id}
