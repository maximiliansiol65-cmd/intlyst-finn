from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from api.role_guards import CEO_ROLES, MANAGER_ROLES, _get_workspace_role
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
    context_json: Optional[str] = None


def _payload(row: AuditLog) -> dict:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "actor_user_id": row.actor_user_id,
        "actor_role": getattr(row, "actor_role", None),
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "metadata_json": row.metadata_json,
        "context_json": getattr(row, "context_json", None),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("")
def list_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    actor_role: Optional[str] = Query(None, description="Filter by actor role"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    action: Optional[str] = Query(None, description="Filter by action keyword"),
    date_from: Optional[date] = Query(None, description="From date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="To date (YYYY-MM-DD)"),
    limit: int = Query(200, le=1000),
):
    ws_role = _get_workspace_role(current_user, workspace_id, db)

    # Members can only see their own logs; managers see workspace logs; CEO sees all
    query = db.query(AuditLog).filter(AuditLog.workspace_id == workspace_id)
    if ws_role not in MANAGER_ROLES:
        query = query.filter(AuditLog.actor_user_id == current_user.id)

    if actor_role:
        query = query.filter(AuditLog.actor_role == actor_role)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if date_from:
        from datetime import datetime as dt
        query = query.filter(AuditLog.created_at >= dt.combine(date_from, dt.min.time()))
    if date_to:
        from datetime import datetime as dt, timedelta
        query = query.filter(AuditLog.created_at < dt.combine(date_to, dt.min.time()) + timedelta(days=1))

    rows = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return {"items": [_payload(row) for row in rows], "total": len(rows), "viewer_role": ws_role}


@router.post("")
def create_audit_log(
    body: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Immutable — audit logs can only be created, never updated or deleted via API."""
    ws_role = _get_workspace_role(current_user, workspace_id, db)
    row = AuditLog(
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        actor_role=ws_role,
        action=body.action,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        metadata_json=body.metadata_json,
        context_json=body.context_json,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)


# ── Internal helper used by other services ────────────────────────────────────

def record_audit_event(
    db: Session,
    workspace_id: int,
    actor_user_id: int,
    actor_role: str,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    metadata_json: Optional[str] = None,
    context_json: Optional[str] = None,
) -> AuditLog:
    """Helper to record an audit event programmatically (no HTTP context required)."""
    row = AuditLog(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=metadata_json,
        context_json=context_json,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    return row
