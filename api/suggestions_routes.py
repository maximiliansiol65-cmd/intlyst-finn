from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import engine, get_db
from models.base import Base
from models.suggestion import Suggestion

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])

Base.metadata.create_all(bind=engine)


class SuggestionCreate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    payload_json: Optional[str] = None


class SuggestionUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    payload_json: Optional[str] = None
    status: Optional[str] = None


def _payload(row: Suggestion) -> dict:
    return {
        "id": row.id,
        "workspace_id": row.workspace_id,
        "user_id": row.user_id,
        "type": row.type,
        "title": row.title,
        "payload_json": row.payload_json,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    rows = (
        db.query(Suggestion)
        .filter(Suggestion.workspace_id == workspace_id)
        .order_by(Suggestion.created_at.desc())
        .all()
    )
    return {"items": [_payload(row) for row in rows]}


@router.post("")
def create_suggestion(
    body: SuggestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    row = Suggestion(
        workspace_id=workspace_id,
        user_id=current_user.id,
        type=body.type,
        title=body.title,
        payload_json=body.payload_json,
        status="proposed",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.get("/{suggestion_id}")
def get_suggestion(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Suggestion).filter(
        Suggestion.id == suggestion_id,
        Suggestion.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion nicht gefunden.")
    return _payload(row)


@router.patch("/{suggestion_id}")
def update_suggestion(
    suggestion_id: int,
    body: SuggestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Suggestion).filter(
        Suggestion.id == suggestion_id,
        Suggestion.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion nicht gefunden.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.delete("/{suggestion_id}")
def delete_suggestion(
    suggestion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Suggestion).filter(
        Suggestion.id == suggestion_id,
        Suggestion.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Suggestion nicht gefunden.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": suggestion_id}
