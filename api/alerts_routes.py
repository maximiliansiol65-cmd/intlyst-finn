from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models.notification import Notification
from api.auth_routes import User, get_current_user

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

@router.get("", response_model=list[AlertResponse], summary="Get alerts (filterable by severity + type)")
def get_alerts(
    severity: Optional[str] = Query(None, enum=["high", "medium", "low"]),
    type: Optional[str] = Query(None, enum=["alert", "recommendation", "goal"]),
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification)
    if type:
        query = query.filter(Notification.type == type)
    if unread_only:
        query = query.filter(Notification.is_read == False)  # noqa: E712

    notifications = query.order_by(desc(Notification.created_at)).limit(100).all()

    result = []
    for n in notifications:
        sev = classify_severity(n)
        if severity and sev != severity:
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
