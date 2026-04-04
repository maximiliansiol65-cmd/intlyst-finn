"""
tenant_guard.py
Phase 1: Hard tenant context enforcement.

Every service or route that touches the DB must call require_workspace_context()
before executing queries. This prevents accidental cross-tenant data access
if the middleware ever fails to set the workspace context.
"""
from __future__ import annotations

from fastapi import HTTPException, status

from database import get_current_workspace_id


class TenantContextError(Exception):
    """Raised when a DB operation is attempted without workspace context."""


def require_workspace_context() -> int:
    """
    Assert that a workspace context is active. Returns workspace_id.
    Raises HTTP 403 in route context, TenantContextError in service context.

    Usage in routes:
        workspace_id = require_workspace_context()

    Usage in services (non-HTTP):
        from services.tenant_guard import require_workspace_context
        workspace_id = require_workspace_context()
    """
    workspace_id = get_current_workspace_id()
    if workspace_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kein Workspace-Kontext gesetzt. Zugriff verweigert.",
        )
    return workspace_id


def require_workspace_context_service() -> int:
    """
    Non-HTTP variant for use in background services / celery tasks.
    Raises TenantContextError instead of HTTPException.
    """
    workspace_id = get_current_workspace_id()
    if workspace_id is None:
        raise TenantContextError(
            "DB operation attempted without workspace context. "
            "Call set_current_workspace_id() before running service logic."
        )
    return workspace_id


def assert_owns_resource(resource_workspace_id: int, current_workspace_id: int) -> None:
    """
    Double-check that a fetched resource actually belongs to the current workspace.
    Defense-in-depth against the event listener being bypassed (e.g., raw SQL).
    """
    if resource_workspace_id != current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ressource nicht gefunden.",  # Intentionally vague — no cross-tenant info leak
        )
