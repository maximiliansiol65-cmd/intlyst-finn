from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import engine, get_db
from models.audit_log import AuditLog
from models.base import Base

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])

Base.metadata.create_all(bind=engine)


class AuditLogCreate(BaseModel):
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    metadata_json: Optional[str] = None


def _payload(row: AuditLog) -> dict:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "actor_user_id": row.actor_user_id,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "metadata_json": row.metadata_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("")
def list_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.workspace_id == workspace_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    return {"items": [_payload(row) for row in rows]}


@router.post("")
def create_audit_log(
    body: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    row = AuditLog(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        action=body.action,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        metadata_json=body.metadata_json,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)
