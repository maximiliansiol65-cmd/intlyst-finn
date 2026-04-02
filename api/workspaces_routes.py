"""
Workspace management: list, create, switch, and update workspace settings.
"""
from datetime import datetime
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from api.auth_routes import (
    User,
    Workspace,
    WorkspaceMembership,
    _ensure_default_workspace_for_user,
    _unique_workspace_slug,
    get_current_user,
    get_current_workspace_id,
    hash_password,
)
from api.billing_routes import PLANS, get_or_create_subscription
from database import get_db

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


class WorkspaceItem(BaseModel):
    id: int
    name: str
    slug: str
    logo_url: Optional[str]
    role: str
    member_count: int
    is_active: bool


class CreateWorkspaceRequest(BaseModel):
    name: str
    logo_url: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Workspace-Name muss mindestens 2 Zeichen haben.")
        if len(cleaned) > 120:
            raise ValueError("Workspace-Name darf maximal 120 Zeichen haben.")
        return cleaned


class SwitchWorkspaceRequest(BaseModel):
    workspace_id: int


class UpdateWorkspaceRequest(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None


class AddMemberRequest(BaseModel):
    email: str
    name: Optional[str] = None
    role: str = "member"


def _membership_for_user_workspace(db: Session, user_id: int, workspace_id: int) -> Optional[WorkspaceMembership]:
    return (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,
        )
        .first()
    )


def _workspace_payload(db: Session, workspace: Workspace, current_user_id: int) -> WorkspaceItem:
    members = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.workspace_id == workspace.id,
            WorkspaceMembership.is_active == True,
        )
        .all()
    )
    role = "member"
    for member in members:
        member_user_id = int(getattr(member, "user_id", 0) or 0)
        if member_user_id == current_user_id:
            role = str(getattr(member, "role", "member") or "member")
            break

    return WorkspaceItem(
        id=int(getattr(workspace, "id", 0) or 0),
        name=str(getattr(workspace, "name", "") or ""),
        slug=str(getattr(workspace, "slug", "") or ""),
        logo_url=getattr(workspace, "logo_url", None),
        role=role,
        member_count=len(members),
        is_active=False,
    )


@router.get("", response_model=list[WorkspaceItem])
def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_default_workspace_for_user(db, current_user)
    current_user_id = int(getattr(current_user, "id", 0) or 0)
    active_workspace_id = getattr(current_user, "active_workspace_id", None)
    memberships = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == current_user_id,
            WorkspaceMembership.is_active == True,
        )
        .all()
    )

    result: list[WorkspaceItem] = []
    for membership in memberships:
        workspace = db.query(Workspace).filter(Workspace.id == membership.workspace_id).first()
        if not workspace:
            continue
        workspace_id = int(getattr(workspace, "id", 0) or 0)
        item = _workspace_payload(db, workspace, current_user_id)
        item.is_active = bool(active_workspace_id is not None and workspace_id == int(active_workspace_id))
        result.append(item)

    return result


@router.post("", response_model=WorkspaceItem)
def create_workspace(
    body: CreateWorkspaceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = Workspace(
        name=body.name,
        slug=_unique_workspace_slug(db, body.name),
        logo_url=body.logo_url,
        owner_user_id=int(getattr(current_user, "id", 0) or 0),
        created_at=datetime.utcnow(),
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    db.add(
        WorkspaceMembership(
            user_id=int(getattr(current_user, "id", 0) or 0),
            workspace_id=workspace.id,
            role="owner",
            is_active=True,
        )
    )
    current_user.active_workspace_id = workspace.id
    db.commit()

    item = _workspace_payload(db, workspace, int(getattr(current_user, "id", 0) or 0))
    item.is_active = True
    return item


@router.post("/switch")
def switch_workspace(
    body: SwitchWorkspaceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user_id = int(getattr(current_user, "id", 0) or 0)
    membership = _membership_for_user_workspace(db, current_user_id, body.workspace_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Workspace.")

    workspace = db.query(Workspace).filter(Workspace.id == body.workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace nicht gefunden.")

    current_user_obj = cast(Any, current_user)
    current_user_obj.active_workspace_id = int(getattr(workspace, "id", body.workspace_id) or body.workspace_id)
    db.commit()

    return {
        "message": f"Workspace gewechselt zu {workspace.name}.",
        "workspace_id": workspace.id,
        "workspace_slug": workspace.slug,
    }


@router.get("/current")
def get_current_workspace(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace nicht gefunden.")

    members = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,
        )
        .all()
    )

    member_items = []
    for member in members:
        member_user_id = int(getattr(member, "user_id", 0) or 0)
        user = db.query(User).filter(User.id == member_user_id).first()
        if not user:
            continue
        member_items.append(
            {
                "user_id": int(getattr(user, "id", 0) or 0),
                "email": str(getattr(user, "email", "") or ""),
                "name": getattr(user, "name", None),
                "role": str(getattr(member, "role", "member") or "member"),
                "is_active": bool(getattr(user, "is_active", False)),
            }
        )

    subscription = get_or_create_subscription(
        db,
        user_id=int(getattr(current_user, "id", 0) or 0),
        workspace_id=workspace_id,
    )
    plan = str(subscription.plan or "trial")
    plan_data = PLANS.get(plan, PLANS["standard"])

    return {
        "id": int(getattr(workspace, "id", 0) or 0),
        "name": str(getattr(workspace, "name", "") or ""),
        "slug": str(getattr(workspace, "slug", "") or ""),
        "logo_url": getattr(workspace, "logo_url", None),
        "owner_user_id": int(getattr(workspace, "owner_user_id", 0) or 0),
        "members": member_items,
        "subscription": {
            "plan": plan,
            "plan_name": plan_data["name"] if plan != "trial" else "Trial",
            "status": subscription.status,
            "max_users": plan_data.get("max_users", 1),
        },
    }


@router.put("/current")
def update_current_workspace(
    body: UpdateWorkspaceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    membership = _membership_for_user_workspace(db, int(getattr(current_user, "id", 0) or 0), workspace_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Workspace.")
    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Nur Owner/Admin darf Workspace-Einstellungen aendern.")

    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace nicht gefunden.")

    if body.name is not None:
        new_name = body.name.strip()
        if len(new_name) < 2 or len(new_name) > 120:
            raise HTTPException(status_code=400, detail="Workspace-Name muss 2 bis 120 Zeichen haben.")
        setattr(workspace, "name", new_name)
    if body.logo_url is not None:
        setattr(workspace, "logo_url", body.logo_url.strip() or None)

    db.commit()
    return {"message": "Workspace-Einstellungen gespeichert."}


@router.get("/current/members")
def list_current_workspace_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    membership = _membership_for_user_workspace(db, int(getattr(current_user, "id", 0) or 0), workspace_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Workspace.")

    members = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,
        )
        .all()
    )
    result = []
    for member in members:
        member_user_id = int(getattr(member, "user_id", 0) or 0)
        user = db.query(User).filter(User.id == member_user_id).first()
        if not user:
            continue
        result.append(
            {
                "id": int(getattr(user, "id", 0) or 0),
                "email": str(getattr(user, "email", "") or ""),
                "name": getattr(user, "name", None),
                "role": str(getattr(member, "role", "member") or "member"),
                "is_active": bool(getattr(user, "is_active", False)),
            }
        )
    return result


@router.post("/current/members")
def add_current_workspace_member(
    body: AddMemberRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    current_user_id = int(getattr(current_user, "id", 0) or 0)
    membership = _membership_for_user_workspace(db, current_user_id, workspace_id)
    if not membership:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Workspace.")
    if membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Nur Owner/Admin darf Mitglieder verwalten.")

    role = body.role if body.role in ("admin", "manager", "member") else "member"
    email = body.email.strip().lower()
    existing_user = db.query(User).filter(User.email == email).first()

    if existing_user:
        existing_membership = (
            db.query(WorkspaceMembership)
            .filter(
                WorkspaceMembership.user_id == int(getattr(existing_user, "id", 0) or 0),
                WorkspaceMembership.workspace_id == workspace_id,
            )
            .first()
        )
        if existing_membership is not None and bool(getattr(existing_membership, "is_active", False)):
            raise HTTPException(status_code=409, detail="Nutzer ist bereits Mitglied.")
        if existing_membership:
            existing_membership_obj = cast(Any, existing_membership)
            existing_membership_obj.is_active = True
            existing_membership_obj.role = role
            db.commit()
            return {"message": "Mitglied reaktiviert.", "user_id": int(getattr(existing_user, "id", 0) or 0)}

        db.add(
            WorkspaceMembership(
                user_id=int(getattr(existing_user, "id", 0) or 0),
                workspace_id=workspace_id,
                role=role,
                is_active=True,
            )
        )
        db.commit()
        return {"message": "Bestehender Nutzer hinzugefuegt.", "user_id": int(getattr(existing_user, "id", 0) or 0)}

    temp_password = "Welcome1234!"
    new_user = User(
        email=email,
        password_hash=hash_password(temp_password),
        name=(body.name or "").strip() or None,
        role=role,
        onboarding_done=False,
        active_workspace_id=workspace_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    db.add(
        WorkspaceMembership(
            user_id=new_user.id,
            workspace_id=workspace_id,
            role=role,
            is_active=True,
        )
    )
    db.commit()

    return {
        "message": "Neues Mitglied erstellt und hinzugefuegt.",
        "user_id": new_user.id,
        "temporary_password": temp_password,
    }


@router.delete("/current/members/{user_id}")
def remove_current_workspace_member(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    actor_membership = _membership_for_user_workspace(db, int(getattr(current_user, "id", 0) or 0), workspace_id)
    if not actor_membership:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf diesen Workspace.")
    if actor_membership.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Nur Owner/Admin darf Mitglieder entfernen.")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Du kannst dich nicht selbst entfernen.")

    member = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Mitglied nicht gefunden.")

    member_obj = cast(Any, member)
    member_obj.is_active = False
    target_user = db.query(User).filter(User.id == user_id).first()
    if target_user is not None and int(getattr(target_user, "active_workspace_id", 0) or 0) == workspace_id:
        fallback = (
            db.query(WorkspaceMembership)
            .filter(
                WorkspaceMembership.user_id == user_id,
                WorkspaceMembership.is_active == True,
                WorkspaceMembership.workspace_id != workspace_id,
            )
            .first()
        )
        target_user_obj = cast(Any, target_user)
        target_user_obj.active_workspace_id = int(getattr(fallback, "workspace_id", 0) or 0) if fallback else None

    db.commit()
    return {"message": "Mitglied entfernt."}
