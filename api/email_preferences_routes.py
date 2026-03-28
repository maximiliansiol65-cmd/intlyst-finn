from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from api.auth_routes import get_current_user
from models.email_preferences import EmailPreferences

router = APIRouter(prefix="/api/email-preferences", tags=["email-preferences"])

class PrefsUpdate(BaseModel):
    enabled:         Optional[bool] = None
    alerts:          Optional[bool] = None
    goals:           Optional[bool] = None
    recommendations: Optional[bool] = None
    reports:         Optional[bool] = None
    weekly_summary:  Optional[bool] = None
    anomalies:       Optional[bool] = None

def get_or_create_prefs(user_id: int, db: Session) -> EmailPreferences:
    prefs = db.query(EmailPreferences).filter_by(user_id=user_id).first()
    if not prefs:
        prefs = EmailPreferences(user_id=user_id)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return prefs

@router.get("")
def get_prefs(db: Session = Depends(get_db), user=Depends(get_current_user)):
    prefs = get_or_create_prefs(user.id, db)
    return {
        "enabled":         prefs.enabled,
        "alerts":          prefs.alerts,
        "goals":           prefs.goals,
        "recommendations": prefs.recommendations,
        "reports":         prefs.reports,
        "weekly_summary":  prefs.weekly_summary,
        "anomalies":       prefs.anomalies,
    }

@router.patch("")
def update_prefs(body: PrefsUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    prefs = get_or_create_prefs(user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(prefs, field, value)
    db.commit()
    db.refresh(prefs)
    return {
        "enabled":         prefs.enabled,
        "alerts":          prefs.alerts,
        "goals":           prefs.goals,
        "recommendations": prefs.recommendations,
        "reports":         prefs.reports,
        "weekly_summary":  prefs.weekly_summary,
        "anomalies":       prefs.anomalies,
    }
