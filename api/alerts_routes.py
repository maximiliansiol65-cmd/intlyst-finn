from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models.notification import Notification
from api.auth_routes import User, get_current_user
from api.role_guards import CEO_ROLES, MANAGER_ROLES, STRATEGIST_ROLES, _get_workspace_role
from api.auth_routes import get_current_workspace_id

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


# ─── model ──────────────────────────────────────────────────────────────────

class AlertResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    severity: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── severity classifier ─────────────────────────────────────────────────────

def classify_severity(notif: Notification) -> str:
    title   = str(getattr(notif, "title",   "") or "")
    message = str(getattr(notif, "message", "") or "")
    combined = (title + " " + message).lower()
    if any(w in combined for w in ["einbruch", "stark", "sofort", "kritisch", "0%"]):
        return "high"
    elif any(w in combined for w in ["rückgang", "unter plan", "gefallen", "anomalie"]):
        return "medium"
    return "low"


# ─── endpoint ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AlertResponse], summary="Get alerts (role-filtered, severity + type)")
def get_alerts(
    severity: Optional[str] = Query(None, enum=["high", "medium", "low"]),
    type: Optional[str] = Query(None, enum=["alert", "recommendation", "goal", "data_inconsistency"]),
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    ws_role = _get_workspace_role(current_user, workspace_id, db)

    query = db.query(Notification).filter(Notification.workspace_id == workspace_id)

    # Role-based visibility:
    # - CEO/owner: all alerts in workspace
    # - Managers (COO/CMO/CFO/admin): workspace alerts (same as CEO for now)
    # - Strategist/assistant/member: only non-critical, non-data alerts
    if ws_role not in MANAGER_ROLES:
        # Restrict: strategists and below cannot see critical internal alerts
        query = query.filter(Notification.type.notin_(["data_inconsistency"]))

    if type:
        query = query.filter(Notification.type == type)
    if unread_only:
        query = query.filter(Notification.is_read == False)  # noqa: E712

    notifications = query.order_by(desc(Notification.created_at)).limit(200).all()

    result = []
    for n in notifications:
        sev = classify_severity(n)
        if severity and sev != severity:
            continue
        # Members cannot see high-severity operational alerts
        if ws_role not in STRATEGIST_ROLES and sev == "high":
            continue
        result.append(AlertResponse(
            id=getattr(n, "id"),
            title=str(getattr(n, "title", "")),
            message=str(getattr(n, "message", "")),
            type=str(getattr(n, "type", "")),
            severity=sev,
            is_read=bool(getattr(n, "is_read", False)),
            created_at=getattr(n, "created_at"),
        ))
    return result
