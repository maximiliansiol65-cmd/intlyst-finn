"""
activity_logs_di_routes.py
REST API for the Decision Intelligence ActivityLog (business audit trail).
GET /api/activity-logs  – List activity log entries with filters
"""
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import get_current_user, User
from models.activity_log_di import ActivityLog

router = APIRouter(prefix="/api/activity-logs", tags=["activity-logs"])


class ActivityLogOut(BaseModel):
    id: int
    workspace_id: int
    user_id: Optional[int] = None
    ai_agent_role: Optional[str] = None
    action_type: str
    entity_type: str
    entity_id: Optional[str] = None
    field_changed: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    reason: Optional[str] = None
    consequence: Optional[str] = None
    created_at: Optional[str] = None

    @classmethod
    def from_orm_clean(cls, obj: Any) -> "ActivityLogOut":
        return cls(
            id=int(getattr(obj, "id")),
            workspace_id=int(getattr(obj, "workspace_id")),
            user_id=(int(getattr(obj, "user_id")) if getattr(obj, "user_id", None) is not None else None),
            ai_agent_role=getattr(obj, "ai_agent_role", None),
            action_type=str(getattr(obj, "action_type")),
            entity_type=str(getattr(obj, "entity_type")),
            entity_id=(str(getattr(obj, "entity_id")) if getattr(obj, "entity_id", None) is not None else None),
            field_changed=getattr(obj, "field_changed", None),
            old_value=getattr(obj, "old_value", None),
            new_value=getattr(obj, "new_value", None),
            reason=getattr(obj, "reason", None),
            consequence=getattr(obj, "consequence", None),
            created_at=(str(getattr(obj, "created_at")) if getattr(obj, "created_at", None) is not None else None),
        )


@router.get("/", response_model=List[ActivityLogOut])
def list_activity_logs(
    entity_type: Optional[str] = Query(None, description="Filter by entity type: task|goal|insight|forecast|ai_output"),
    user_id: Optional[int] = Query(None),
    ai_agent_role: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = get_current_workspace_id() or 1
    q = (
        db.query(ActivityLog)
        .filter(ActivityLog.workspace_id == workspace_id)
        .execution_options(skip_workspace_scope=True)
    )
    if entity_type:
        q = q.filter(ActivityLog.entity_type == entity_type)
    if user_id:
        q = q.filter(ActivityLog.user_id == user_id)
    if ai_agent_role:
        q = q.filter(ActivityLog.ai_agent_role == ai_agent_role)
    if action_type:
        q = q.filter(ActivityLog.action_type == action_type)

    logs = q.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return [ActivityLogOut.from_orm_clean(log) for log in logs]
