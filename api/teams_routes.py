from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import get_db
from models.team import Team
from models.team_membership import TeamMembership

router = APIRouter(prefix="/api/teams", tags=["teams"])


class TeamCreate(BaseModel):
    name: str
    company_id: Optional[int] = None
    lead_user_id: Optional[int] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    company_id: Optional[int] = None
    lead_user_id: Optional[int] = None


class TeamMemberCreate(BaseModel):
    user_id: int
    specialty: Optional[str] = None


class TeamMemberUpdate(BaseModel):
    specialty: Optional[str] = None


def _payload(row: Team) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "company_id": row.company_id,
        "workspace_id": row.workspace_id,
        "lead_user_id": row.lead_user_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _member_payload(row: TeamMembership) -> dict:
    return {
        "id": row.id,
        "team_id": row.team_id,
        "user_id": row.user_id,
        "workspace_id": row.workspace_id,
        "specialty": row.specialty,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("")
def list_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    rows = db.query(Team).filter(Team.workspace_id == workspace_id).all()
    return {"items": [_payload(row) for row in rows]}


@router.post("")
def create_team(
    body: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = Team(
        name=body.name,
        company_id=body.company_id,
        workspace_id=workspace_id,
        lead_user_id=body.lead_user_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)

@router.get("/memberships")
def list_team_memberships(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    rows = db.query(TeamMembership).filter(TeamMembership.workspace_id == workspace_id).all()
    return {"items": [_member_payload(row) for row in rows]}


@router.get("/{team_id}")
def get_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Team).filter(Team.id == team_id, Team.workspace_id == workspace_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Team nicht gefunden.")
    return _payload(row)


@router.patch("/{team_id}")
def update_team(
    team_id: int,
    body: TeamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Team).filter(Team.id == team_id, Team.workspace_id == workspace_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Team nicht gefunden.")
    if body.name is not None:
        row.name = body.name
    if body.company_id is not None:
        row.company_id = body.company_id
    if body.lead_user_id is not None:
        row.lead_user_id = body.lead_user_id
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.delete("/{team_id}")
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(Team).filter(Team.id == team_id, Team.workspace_id == workspace_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Team nicht gefunden.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": team_id}

@router.post("/{team_id}/members")
def add_team_member(
    team_id: int,
    body: TeamMemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    team = db.query(Team).filter(Team.id == team_id, Team.workspace_id == workspace_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team nicht gefunden.")
    existing = db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.user_id == body.user_id,
        TeamMembership.workspace_id == workspace_id,
    ).first()
    if existing:
        existing.specialty = body.specialty
        db.commit()
        db.refresh(existing)
        return _member_payload(existing)
    row = TeamMembership(
        team_id=team_id,
        user_id=body.user_id,
        workspace_id=workspace_id,
        specialty=body.specialty,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _member_payload(row)


@router.patch("/{team_id}/members/{user_id}")
def update_team_member(
    team_id: int,
    user_id: int,
    body: TeamMemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.user_id == user_id,
        TeamMembership.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden.")
    if body.specialty is not None:
        row.specialty = body.specialty
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _member_payload(row)


@router.delete("/{team_id}/members/{user_id}")
def remove_team_member(
    team_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.user_id == user_id,
        TeamMembership.workspace_id == workspace_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Teammitglied nicht gefunden.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "team_id": team_id, "user_id": user_id}
