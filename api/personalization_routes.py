from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from models.user_profile import UserProfile
from services.personalization_service import build_state, record_user_event

router = APIRouter(prefix="/api/personalization", tags=["personalization"])


class BehaviorEvent(BaseModel):
    event_type: str = Field(..., description="z.B. app_open, view_kpi, task_open, suggestion_accept")
    page: Optional[str] = None
    kpi: Optional[str] = None
    feature: Optional[str] = None
    task_id: Optional[int] = None
    suggestion_id: Optional[str] = None
    content_style: Optional[str] = None
    content_length: Optional[str] = None
    tone: Optional[str] = None
    outcome: Optional[str] = None  # accepted | ignored | completed | viewed
    duration_ms: Optional[int] = None
    accepted: Optional[bool] = None
    metadata: Dict[str, Any] = {}


class ProfileEnvelope(BaseModel):
    profile: Dict[str, Any]
    scores: Dict[str, Any]
    generated_at: str
    dashboard: Dict[str, Any]
    tasks: list[Dict[str, Any]]
    suggestions: Dict[str, Any]
    content: Dict[str, Any]


@router.post("/events", status_code=201)
def log_behavior_event(
    body: BehaviorEvent,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Erfasst ein Nutzerverhalten-Event für das Echtzeit-Personalisierungssystem."""
    if not body.event_type:
        raise HTTPException(status_code=400, detail="event_type ist erforderlich")
    event = record_user_event(
        db,
        user_id=current_user.id,
        workspace_id=getattr(current_user, "active_workspace_id", None),
        payload=body.model_dump(),
    )
    return {"status": "logged", "event_id": event.id}


@router.get("/profile", response_model=ProfileEnvelope)
def get_personalization_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Berechnet/liest das dynamische Nutzerprofil und gibt aktuelle Prioritäten zurück."""
    state = build_state(db, user_id=current_user.id, workspace_id=getattr(current_user, "active_workspace_id", None))
    return state


@router.get("/state", response_model=ProfileEnvelope)
def get_personalization_state(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Liefert die komplette Personalisierungs-Payload für das Frontend:
    - Profil (Prioritäten, Stil, Verhaltenstyp)
    - Scores für Dashboard, Tasks, Content, Vorschläge
    - Sortierte Task-Liste und Dashboard-Order
    """
    state = build_state(db, user_id=current_user.id, workspace_id=getattr(current_user, "active_workspace_id", None))
    return state
