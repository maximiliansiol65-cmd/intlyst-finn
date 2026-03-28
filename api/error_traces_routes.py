import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from services.error_trace_service import list_recent_error_traces

router = APIRouter(prefix="/api/error-traces", tags=["error-traces"])


def _serialize(item):
    try:
        context = json.loads(item.context_json) if item.context_json else {}
    except Exception:
        context = {}
    return {
        "id": item.id,
        "workspace_id": item.workspace_id,
        "request_id": item.request_id,
        "method": item.method,
        "path": item.path,
        "error_type": item.error_type,
        "error_message": item.error_message,
        "traceback_text": item.traceback_text,
        "context": context,
        "status_code": item.status_code,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


@router.get("")
def get_error_traces(
    limit: int = Query(default=25, ge=1, le=200),
    error_type: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if getattr(current_user, "role", "member") not in {"admin", "owner"}:
        raise HTTPException(status_code=403, detail="Nur Admin/Owner darf Error Traces sehen.")
    rows = list_recent_error_traces(db, limit=limit, error_type=error_type)
    return {
        "count": len(rows),
        "items": [_serialize(row) for row in rows],
    }
