"""
Team-System — Mitglieder einladen, Rollen, Berechtigungen
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import secrets
from database import get_db
from models.base import Base
from api.auth_routes import (
    Workspace,
    WorkspaceMembership,
    get_current_user,
    get_current_workspace_id,
    User,
)
from api.auth_routes import hash_password

router = APIRouter(prefix="/api/team", tags=["team"])

# ── Models ───────────────────────────────────────────────

class TeamInvite(Base):
    __tablename__ = "team_invites"

    id         = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    email      = Column(String, nullable=False)
    role       = Column(String, nullable=False, default="member")
    token      = Column(String, unique=True, nullable=False)
    invited_by = Column(Integer, nullable=False)
    accepted   = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Permission(Base):
    __tablename__ = "permissions"

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, nullable=False)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    resource   = Column(String, nullable=False)  # dashboard|insights|tasks|alerts|data|market|customers
    can_view   = Column(Boolean, default=True)
    can_edit   = Column(Boolean, default=False)
    can_delete = Column(Boolean, default=False)


# ── Schemas ──────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: str
    name: Optional[str]  = None
    role: str            = "member"


class TeamMember(BaseModel):
    id: int
    email: str
    name: Optional[str]
    role: str
    is_active: bool
    onboarding_done: bool
    created_at: str


class UpdateRoleRequest(BaseModel):
    role: str


class PermissionUpdate(BaseModel):
    resource: str
    can_view: bool   = True
    can_edit: bool   = False
    can_delete: bool = False


class NotificationPrefs(BaseModel):
    alerts_high:        bool = True
    alerts_medium:      bool = True
    alerts_low:         bool = False
    daily_digest:       bool = True
    task_assigned:      bool = True
    goal_reached:       bool = True
    anomaly_detected:   bool = True


# ── Standard-Berechtigungen je Rolle ─────────────────────

DEFAULT_PERMISSIONS = {
    "admin": {
        "dashboard":  {"can_view": True,  "can_edit": True,  "can_delete": True},
        "insights":   {"can_view": True,  "can_edit": True,  "can_delete": True},
        "tasks":      {"can_view": True,  "can_edit": True,  "can_delete": True},
        "alerts":     {"can_view": True,  "can_edit": True,  "can_delete": True},
        "data":       {"can_view": True,  "can_edit": True,  "can_delete": True},
        "market":     {"can_view": True,  "can_edit": True,  "can_delete": False},
        "customers":  {"can_view": True,  "can_edit": True,  "can_delete": False},
        "settings":   {"can_view": True,  "can_edit": True,  "can_delete": False},
    },
    "member": {
        "dashboard":  {"can_view": True,  "can_edit": False, "can_delete": False},
        "insights":   {"can_view": True,  "can_edit": False, "can_delete": False},
        "tasks":      {"can_view": True,  "can_edit": True,  "can_delete": False},
        "alerts":     {"can_view": True,  "can_edit": False, "can_delete": False},
        "data":       {"can_view": True,  "can_edit": False, "can_delete": False},
        "market":     {"can_view": True,  "can_edit": False, "can_delete": False},
        "customers":  {"can_view": True,  "can_edit": False, "can_delete": False},
        "settings":   {"can_view": False, "can_edit": False, "can_delete": False},
    },
    "manager": {
        "dashboard":  {"can_view": True,  "can_edit": True,  "can_delete": False},
        "insights":   {"can_view": True,  "can_edit": True,  "can_delete": False},
        "tasks":      {"can_view": True,  "can_edit": True,  "can_delete": True},
        "alerts":     {"can_view": True,  "can_edit": True,  "can_delete": False},
        "data":       {"can_view": True,  "can_edit": False, "can_delete": False},
        "market":     {"can_view": True,  "can_edit": False, "can_delete": False},
        "customers":  {"can_view": True,  "can_edit": True,  "can_delete": False},
        "settings":   {"can_view": False, "can_edit": False, "can_delete": False},
    },
}


def create_default_permissions(user_id: int, role: str, workspace_id: int, db: Session):
    perms = DEFAULT_PERMISSIONS.get(role, DEFAULT_PERMISSIONS["member"])
    for resource, perm in perms.items():
        existing = db.query(Permission).filter(
            Permission.user_id == user_id,
            Permission.workspace_id == workspace_id,
            Permission.resource == resource,
        ).first()
        if not existing:
            db.add(Permission(user_id=user_id, workspace_id=workspace_id, resource=resource, **perm))
    db.commit()


# ── Endpunkte ────────────────────────────────────────────

@router.get("/members", response_model=list[TeamMember])
def get_members(
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
):
    member_ids = (
        db.query(WorkspaceMembership.user_id)
        .filter(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,
        )
        .all()
    )
    ids = [row[0] for row in member_ids]
    members = db.query(User).filter(User.is_active == True, User.id.in_(ids)).all() if ids else []
    return [
        TeamMember(
            id=m.id,
            email=m.email,
            name=m.name,
            role=m.role,
            is_active=m.is_active,
            onboarding_done=m.onboarding_done,
            created_at=str(m.created_at),
        )
        for m in members
    ]


@router.post("/invite")
def invite_member(
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Nur Admins können Mitglieder einladen.")

    if body.role not in ("admin", "manager", "member"):
        raise HTTPException(status_code=400, detail="Rolle muss 'admin', 'manager' oder 'member' sein.")

    existing = db.query(User).filter(User.email == body.email.lower()).first()
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace nicht gefunden.")

    if existing:
        membership = (
            db.query(WorkspaceMembership)
            .filter(
                WorkspaceMembership.user_id == existing.id,
                WorkspaceMembership.workspace_id == workspace_id,
            )
            .first()
        )
        if membership and membership.is_active:
            raise HTTPException(status_code=409, detail="Nutzer ist bereits im Workspace.")
        if membership:
            membership.is_active = True
            membership.role = body.role
            db.commit()
            create_default_permissions(existing.id, body.role, workspace_id, db)
            return {
                "message": f"{body.email} wurde wieder aktiviert.",
                "user_id": existing.id,
                "invite_token": None,
                "login_url": "http://localhost:5173/login",
            }

    temp_password = secrets.token_urlsafe(10)

    if not existing:
        new_user = User(
            email=body.email.lower(),
            password_hash=hash_password(temp_password),
            name=body.name,
            role=body.role,
            onboarding_done=False,
            active_workspace_id=workspace_id,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        user_id = new_user.id
    else:
        user_id = existing.id

    db.add(
        WorkspaceMembership(
            user_id=user_id,
            workspace_id=workspace_id,
            role=body.role,
            is_active=True,
        )
    )
    db.commit()

    create_default_permissions(user_id, body.role, workspace_id, db)

    invite_token = secrets.token_urlsafe(32)
    db.add(TeamInvite(
        workspace_id=workspace_id,
        email=body.email.lower(),
        role=body.role,
        token=invite_token,
        invited_by=current_user.id,
    ))
    db.commit()

    return {
        "message":        f"{body.email} wurde eingeladen.",
        "user_id":        user_id,
        "temp_password":  temp_password,
        "invite_token":   invite_token,
        "note":           "In Production: E-Mail mit Login-Link senden.",
        "login_url":      f"http://localhost:5173/login?email={body.email}&token={invite_token}",
    }


@router.put("/members/{user_id}/role")
def update_role(
    user_id: int,
    body: UpdateRoleRequest,
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Nur Admins können Rollen ändern.")

    if body.role not in ("admin", "manager", "member"):
        raise HTTPException(status_code=400, detail="Rolle muss 'admin', 'manager' oder 'member' sein.")

    membership = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,
        )
        .first()
    )
    member = db.query(User).filter(User.id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Nutzer nicht gefunden.")
    if not membership:
        raise HTTPException(status_code=404, detail="Nutzer ist nicht Mitglied im Workspace.")

    if member.id == current_user.id:
        raise HTTPException(status_code=400, detail="Du kannst deine eigene Rolle nicht ändern.")

    member.role = body.role
    membership.role = body.role
    db.commit()

    create_default_permissions(user_id, body.role, workspace_id, db)

    return {"message": f"Rolle auf '{body.role}' gesetzt."}


@router.delete("/members/{user_id}")
def remove_member(
    user_id: int,
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Nur Admins können Mitglieder entfernen.")

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Du kannst dich nicht selbst entfernen.")

    membership = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,
        )
        .first()
    )
    member = db.query(User).filter(User.id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Nutzer nicht gefunden.")
    if not membership:
        raise HTTPException(status_code=404, detail="Nutzer ist nicht Mitglied im Workspace.")

    membership.is_active = False
    if member.active_workspace_id == workspace_id:
        fallback = (
            db.query(WorkspaceMembership)
            .filter(
                WorkspaceMembership.user_id == member.id,
                WorkspaceMembership.is_active == True,
                WorkspaceMembership.workspace_id != workspace_id,
            )
            .first()
        )
        member.active_workspace_id = fallback.workspace_id if fallback else None
    db.commit()
    return {"message": f"{member.email} wurde aus dem Workspace entfernt."}


@router.get("/permissions/{user_id}")
def get_permissions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
):
    perms = db.query(Permission).filter(
        Permission.user_id == user_id,
        Permission.workspace_id == workspace_id,
    ).all()
    if not perms:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            create_default_permissions(user_id, user.role, workspace_id, db)
            perms = db.query(Permission).filter(
                Permission.user_id == user_id,
                Permission.workspace_id == workspace_id,
            ).all()

    return [
        {
            "resource":   p.resource,
            "can_view":   p.can_view,
            "can_edit":   p.can_edit,
            "can_delete": p.can_delete,
        }
        for p in perms
    ]


@router.put("/permissions/{user_id}")
def update_permissions(
    user_id: int,
    body: PermissionUpdate,
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Nur Admins können Berechtigungen ändern.")

    perm = db.query(Permission).filter(
        Permission.user_id == user_id,
        Permission.workspace_id == workspace_id,
        Permission.resource == body.resource,
    ).first()

    if perm:
        perm.can_view   = body.can_view
        perm.can_edit   = body.can_edit
        perm.can_delete = body.can_delete
    else:
        db.add(Permission(
            user_id=user_id,
            workspace_id=workspace_id,
            resource=body.resource,
            can_view=body.can_view,
            can_edit=body.can_edit,
            can_delete=body.can_delete,
        ))
    db.commit()
    return {"message": "Berechtigung aktualisiert."}
