from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models.notification import Notification
from api.auth_routes import User, get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "alert"


@router.get("", response_model=list[NotificationResponse])
def get_notifications(
    unread_only: bool = False,
    skip: int = Query(0, ge=0, description="Offset fuer Pagination"),
    limit: int = Query(50, ge=1, le=200, description="Max. 200 Eintraege"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(desc(Notification.created_at)).offset(skip).limit(limit).all()


@router.get("/unread-count")
def get_unread_count(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    count = db.query(Notification).filter(Notification.is_read == False).count()
    return {"count": count}


@router.post("", response_model=NotificationResponse)
def create_notification(body: NotificationCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    valid_types = {"alert", "recommendation", "goal"}
    if body.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Type muss eine von {valid_types} sein.")

    notification = Notification(title=body.title, message=body.message, type=body.type)
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


@router.patch("/{notification_id}/read")
def mark_as_read(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification nicht gefunden.")

    setattr(notification, "is_read", True)
    db.commit()
    return {"message": "Als gelesen markiert."}


@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "Alle als gelesen markiert."}


@router.delete("/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notification = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification nicht gefunden.")

    db.delete(notification)
    db.commit()
    return {"message": "Gelöscht."}
