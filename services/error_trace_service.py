from __future__ import annotations

import json
import traceback
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.error_trace import ErrorTrace


def record_error_trace(
    db: Session,
    *,
    error: Exception,
    traceback_text: Optional[str] = None,
    request_id: Optional[str] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    workspace_id: Optional[int] = None,
    status_code: int = 500,
    context: Optional[dict[str, Any]] = None,
) -> ErrorTrace:
    row = ErrorTrace(
        workspace_id=workspace_id,
        request_id=request_id,
        method=method,
        path=path,
        error_type=error.__class__.__name__,
        error_message=str(error)[:4000],
        traceback_text=(traceback_text or traceback.format_exc())[:20000],
        context_json=json.dumps(context or {}, default=str)[:12000],
        status_code=status_code,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_recent_error_traces(db: Session, limit: int = 50, error_type: Optional[str] = None):
    query = db.query(ErrorTrace).order_by(ErrorTrace.created_at.desc())
    if error_type:
        query = query.filter(ErrorTrace.error_type == error_type)
    return query.limit(limit).all()
