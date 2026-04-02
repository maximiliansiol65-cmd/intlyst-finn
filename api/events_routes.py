"""
Business Events API
Erstellen, lesen und verwalten von Geschäftsereignissen.

Diese Events fließen direkt in die Kausalitätsanalyse (Schicht 4) ein:
Intlyst erkennt automatisch ob ein Event mit anomalen Metriken korreliert.
"""

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from models.business_event import BusinessEvent

router = APIRouter(prefix="/api/events", tags=["events"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

VALID_CATEGORIES = {"marketing", "pricing", "product", "operations", "external", "other"}
VALID_IMPACTS    = {"positive", "negative", "neutral", "unknown"}


class EventCreate(BaseModel):
    event_date:      str = Field(..., description="ISO-Datum: YYYY-MM-DD")
    title:           str = Field(..., min_length=2, max_length=200)
    description:     Optional[str] = Field(None, max_length=1000)
    category:        str = Field("other")
    expected_impact: Optional[str] = Field("unknown")

    @field_validator("event_date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError("event_date muss das Format YYYY-MM-DD haben")
        return v

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"Ungültige Kategorie. Erlaubt: {', '.join(VALID_CATEGORIES)}")
        return v

    @field_validator("expected_impact")
    @classmethod
    def validate_impact(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in VALID_IMPACTS:
            raise ValueError(f"Ungültiger Impact. Erlaubt: {', '.join(VALID_IMPACTS)}")
        return v


class EventUpdate(BaseModel):
    event_date:      Optional[str]  = None
    title:           Optional[str]  = Field(None, min_length=2, max_length=200)
    description:     Optional[str]  = Field(None, max_length=1000)
    category:        Optional[str]  = None
    expected_impact: Optional[str]  = None

    @field_validator("event_date")
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                date.fromisoformat(v)
            except ValueError:
                raise ValueError("event_date muss das Format YYYY-MM-DD haben")
        return v


class EventResponse(BaseModel):
    id:              int
    event_date:      str
    title:           str
    description:     Optional[str]
    category:        str
    expected_impact: Optional[str]
    created_at:      str
    days_ago:        int  # Wie viele Tage her?


def _to_response(event: BusinessEvent) -> EventResponse:
    try:
        ev_date = date.fromisoformat(event.event_date)
        days_ago = (date.today() - ev_date).days
    except (ValueError, TypeError):
        days_ago = 0

    return EventResponse(
        id=event.id,
        event_date=event.event_date,
        title=event.title,
        description=event.description,
        category=event.category,
        expected_impact=event.expected_impact,
        created_at=event.created_at.isoformat() if event.created_at else "",
        days_ago=days_ago,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[EventResponse])
def list_events(
    days: int = 90,
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EventResponse]:
    """
    Listet alle Business Events der letzten N Tage.

    Query params:
    - days:     Zeitraum in Tagen (Standard: 90)
    - category: Optional filter (marketing/pricing/product/operations/external/other)
    """
    from datetime import timedelta
    since = (date.today() - timedelta(days=max(1, min(days, 730)))).isoformat()

    q = db.query(BusinessEvent).filter(BusinessEvent.event_date >= since)
    if category and category in VALID_CATEGORIES:
        q = q.filter(BusinessEvent.category == category)

    events = q.order_by(BusinessEvent.event_date.desc()).all()
    return [_to_response(e) for e in events]


@router.post("", response_model=EventResponse, status_code=201)
def create_event(
    body: EventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventResponse:
    """Erstellt einen neuen Business Event."""
    event = BusinessEvent(
        event_date=body.event_date,
        title=body.title.strip(),
        description=(body.description or "").strip() or None,
        category=body.category,
        expected_impact=body.expected_impact or "unknown",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _to_response(event)


@router.get("/upcoming/next14", response_model=list[EventResponse])
def get_upcoming_events(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[EventResponse]:
    """Gibt Events der nächsten 14 Tage zurück (für Countdown-Sektion im Briefing)."""
    from datetime import timedelta
    today_str = date.today().isoformat()
    end_str = (date.today() + timedelta(days=14)).isoformat()

    events = (
        db.query(BusinessEvent)
        .filter(BusinessEvent.event_date >= today_str, BusinessEvent.event_date <= end_str)
        .order_by(BusinessEvent.event_date)
        .all()
    )
    return [_to_response(e) for e in events]


@router.get("/{event_id}", response_model=EventResponse)
def get_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventResponse:
    """Gibt einen einzelnen Business Event zurück."""
    event = db.query(BusinessEvent).filter(BusinessEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event nicht gefunden")
    return _to_response(event)


@router.put("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    body: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EventResponse:
    """Aktualisiert einen Business Event."""
    event = db.query(BusinessEvent).filter(BusinessEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event nicht gefunden")

    if body.event_date is not None:
        event.event_date = body.event_date
    if body.title is not None:
        event.title = body.title.strip()
    if body.description is not None:
        event.description = body.description.strip() or None
    if body.category is not None and body.category in VALID_CATEGORIES:
        event.category = body.category
    if body.expected_impact is not None and body.expected_impact in VALID_IMPACTS:
        event.expected_impact = body.expected_impact

    event.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(event)
    return _to_response(event)


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Löscht einen Business Event."""
    event = db.query(BusinessEvent).filter(BusinessEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event nicht gefunden")
    db.delete(event)
    db.commit()
