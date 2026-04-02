"""
Role-based access control (RBAC) guards for FastAPI endpoints.

Role hierarchy (highest → lowest privileges):
  owner / ceo  →  admin / coo / cmo / cfo  →  manager / strategist  →  assistant  →  member
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import get_db
from models.user import WorkspaceMembership

# ---------------------------------------------------------------------------
# Role groupings
# ---------------------------------------------------------------------------

#: Full control — can do everything including approve, restore, export
CEO_ROLES = {"owner", "ceo"}

#: Department heads — can approve, view everything, manage teams
MANAGER_ROLES = CEO_ROLES | {"admin", "coo", "cmo", "cfo"}

#: Strategists and planners — read-only on insights & forecasts, can suggest
STRATEGIST_ROLES = MANAGER_ROLES | {"manager", "strategist"}

#: All authenticated workspace members
MEMBER_ROLES = STRATEGIST_ROLES | {"assistant", "member"}

#: Roles that require MFA
MFA_REQUIRED_ROLES = {"owner", "ceo", "admin", "coo", "cmo", "cfo"}


def _get_workspace_role(user: User, workspace_id: int, db: Session) -> str:
    """Return the user's role in the given workspace, or 'member' as fallback."""
    membership = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user.id,
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,  # noqa: E712
        )
        .first()
    )
    return membership.role if membership else "member"


# ---------------------------------------------------------------------------
# Dependency factories
# ---------------------------------------------------------------------------

def require_ceo(
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
) -> User:
    """Restrict endpoint to CEO / owner only."""
    role = _get_workspace_role(current_user, workspace_id, db)
    if role not in CEO_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nur der CEO/Owner hat Zugriff auf diese Funktion.",
        )
    return current_user


def require_manager_or_above(
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
) -> User:
    """Restrict endpoint to manager-level roles and above (CEO, COO, CMO, CFO, admin)."""
    role = _get_workspace_role(current_user, workspace_id, db)
    if role not in MANAGER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diese Funktion erfordert mindestens Manager-Berechtigungen.",
        )
    return current_user


def require_strategist_or_above(
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
) -> User:
    """Restrict endpoint to strategist-level roles and above."""
    role = _get_workspace_role(current_user, workspace_id, db)
    if role not in STRATEGIST_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diese Funktion erfordert mindestens Strategist-Berechtigungen.",
        )
    return current_user


def require_member_or_above(
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
) -> User:
    """Allow all authenticated workspace members."""
    role = _get_workspace_role(current_user, workspace_id, db)
    if role not in MEMBER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kein aktives Workspace-Mitglied.",
        )
    return current_user


def get_user_workspace_role(
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
    db: Session = Depends(get_db),
) -> str:
    """Return the current user's workspace role as a string (no access check)."""
    return _get_workspace_role(current_user, workspace_id, db)
