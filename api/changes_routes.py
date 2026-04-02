from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from services.change_detection_service import detect_changes

router = APIRouter(prefix="/api/changes", tags=["changes"])


@router.get("")
def list_changes(
    days: int = Query(default=7, ge=3, le=30, description="Vergleichsfenster (Tage)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return {"items": detect_changes(db, days=days)}
