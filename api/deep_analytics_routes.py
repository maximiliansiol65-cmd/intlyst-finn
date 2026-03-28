from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.auth_routes import User, decode_token, get_current_user, get_current_workspace_id
from database import SessionLocal, get_db
from models.user import User as UserModel, WorkspaceMembership
from services.deep_analytics_service import (
    deep_insight_report,
    latest_kpi_snapshot,
    predictive_overview,
    root_cause_analysis,
    validate_rows,
    get_rows,
)

router = APIRouter(prefix="/api/deep-analytics", tags=["deep-analytics"])


def _resolve_stream_context(
    token: Optional[str],
    workspace_id: Optional[int],
    db: Session,
) -> Tuple[UserModel, int]:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token fehlt.")
    payload = decode_token(token, expected_type="access")
    user_id = int(payload["sub"])
    user = db.query(UserModel).filter(UserModel.id == user_id, UserModel.is_active == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nutzer nicht gefunden oder inaktiv.")
    target_workspace_id = workspace_id or getattr(user, "active_workspace_id", None)
    if not target_workspace_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kein Workspace gewählt.")
    membership = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user.id,
            WorkspaceMembership.workspace_id == int(target_workspace_id),
            WorkspaceMembership.is_active == True,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kein Zugriff auf diesen Workspace.")
    return user, int(target_workspace_id)


@router.get("/snapshot")
def get_snapshot(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    return latest_kpi_snapshot(db, workspace_id=workspace_id)


@router.get("/predict")
def get_predictive_overview(
    horizon_days: int = Query(default=14, ge=7, le=60),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    return predictive_overview(db, workspace_id=workspace_id, horizon_days=horizon_days)


@router.get("/root-cause")
def get_root_cause(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    return root_cause_analysis(db, workspace_id=workspace_id)


@router.get("/quality")
def get_data_quality(
    lookback_days: int = Query(default=120, ge=14, le=800),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    rows = get_rows(db, workspace_id=workspace_id, days=lookback_days)
    payload = validate_rows(rows)
    payload["lookback_days"] = lookback_days
    payload["evaluated_at"] = datetime.utcnow().isoformat()
    return payload


@router.get("/report")
def get_deep_report(
    industry: str = Query(default="ecommerce", min_length=2, max_length=80),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    return deep_insight_report(db, workspace_id=workspace_id, industry=industry)


@router.get("/stream")
def stream_deep_analytics(
    request: Request,
    token: Optional[str] = Query(default=None),
    workspace_id: Optional[int] = Query(default=None),
    industry: str = Query(default="ecommerce", min_length=2, max_length=80),
):
    db = SessionLocal()
    try:
        _, effective_workspace_id = _resolve_stream_context(token, workspace_id, db)
    finally:
        db.close()

    async def event_generator():
        heartbeat = 0
        while True:
            if await request.is_disconnected():
                break

            db_session = SessionLocal()
            try:
                snapshot = latest_kpi_snapshot(db_session, workspace_id=effective_workspace_id)
                prediction = predictive_overview(db_session, workspace_id=effective_workspace_id, horizon_days=14)
                root_cause = root_cause_analysis(db_session, workspace_id=effective_workspace_id)
                report = deep_insight_report(db_session, workspace_id=effective_workspace_id, industry=industry)
            finally:
                db_session.close()

            data: dict[str, Any] = {
                "type": "kpi_update",
                "generated_at": datetime.utcnow().isoformat(),
                "snapshot": snapshot,
                "prediction": prediction,
                "root_cause": root_cause,
                "insights": report.get("insights", []),
            }
            yield f"event: kpi_update\ndata: {json.dumps(data)}\n\n"

            heartbeat += 1
            if heartbeat % 3 == 0:
                meta = {"type": "heartbeat", "ts": datetime.utcnow().isoformat()}
                yield f"event: heartbeat\ndata: {json.dumps(meta)}\n\n"

            # 8 Sekunden als Kompromiss aus Realtime-Eindruck und Backend-Last
            await asyncio.sleep(8)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
