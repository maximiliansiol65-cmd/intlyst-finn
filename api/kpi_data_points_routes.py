"""
kpi_data_points_routes.py
REST API for KPI time-series data.
GET  /api/kpi-data-points               – List data points (filter by kpi_id, range, source)
POST /api/kpi-data-points               – Ingest a new KPI reading
GET  /api/kpi-data-points/summary       – Aggregated view: latest, avg, min, max, trend per KPI
GET  /api/kpi-data-points/{kpi_id}/series – Full time series for a single KPI
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, over
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import get_current_user, User
from api.role_guards import require_strategist_or_above, require_manager_or_above
from models.kpi_data_point import KPIDataPoint
from services.tenant_guard import require_workspace_context

router = APIRouter(prefix="/api/kpi-data-points", tags=["kpi-data-points"])

# ── Range presets (days back) ─────────────────────────────────────────────────
RANGE_DAYS = {"today": 1, "7d": 7, "30d": 30, "90d": 90, "year": 365}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class KPIDataPointOut(BaseModel):
    id: int
    workspace_id: int
    kpi_id: int
    kpi_name: Optional[str] = None
    recorded_at: str
    value: float
    source: Optional[str] = None
    comparison_value: Optional[float] = None
    change_pct: Optional[float] = None
    trend_direction: Optional[str] = None
    quality_score: Optional[float] = None

    @classmethod
    def from_orm_clean(cls, obj: KPIDataPoint) -> "KPIDataPointOut":
        return cls(
            id=obj.id,
            workspace_id=obj.workspace_id,
            kpi_id=obj.kpi_id,
            kpi_name=obj.kpi_name,
            recorded_at=str(obj.recorded_at),
            value=obj.value,
            source=obj.source,
            comparison_value=obj.comparison_value,
            change_pct=obj.change_pct,
            trend_direction=obj.trend_direction,
            quality_score=obj.quality_score,
        )


class KPIDataPointIn(BaseModel):
    kpi_id: int
    kpi_name: Optional[str] = None
    value: float
    source: Optional[str] = Field(None, description="manual|ga4|shopify|api|calculated")
    comparison_value: Optional[float] = None
    change_pct: Optional[float] = None
    trend_direction: Optional[str] = Field("stable", description="up|down|stable")
    quality_score: Optional[float] = Field(100.0, ge=0, le=100)
    recorded_at: Optional[str] = None  # ISO datetime string; defaults to now


class KPISummaryOut(BaseModel):
    kpi_id: int
    kpi_name: Optional[str] = None
    latest_value: Optional[float] = None
    latest_at: Optional[str] = None
    avg_value: Optional[float] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    trend_direction: Optional[str] = None
    data_points: int = 0


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=List[KPISummaryOut])
def kpi_summary(
    range: str = Query("30d", description="today|7d|30d|90d|year"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    """N+1-free summary: single query using a ranked subquery for latest-per-KPI."""
    workspace_id = require_workspace_context()
    days = RANGE_DAYS.get(range, 30)
    since = datetime.utcnow() - timedelta(days=days)

    # Step 1: Aggregate stats per KPI in a single query
    agg_rows = (
        db.query(
            KPIDataPoint.kpi_id,
            KPIDataPoint.kpi_name,
            func.count(KPIDataPoint.id).label("cnt"),
            func.avg(KPIDataPoint.value).label("avg_v"),
            func.min(KPIDataPoint.value).label("min_v"),
            func.max(KPIDataPoint.value).label("max_v"),
        )
        .filter(
            KPIDataPoint.workspace_id == workspace_id,
            KPIDataPoint.recorded_at >= since,
        )
        .group_by(KPIDataPoint.kpi_id, KPIDataPoint.kpi_name)
        .all()
    )

    if not agg_rows:
        return []

    # Step 2: Fetch latest row per KPI in ONE query using MAX(id) per group
    kpi_ids = [row.kpi_id for row in agg_rows]
    latest_id_subq = (
        db.query(func.max(KPIDataPoint.id).label("max_id"))
        .filter(
            KPIDataPoint.workspace_id == workspace_id,
            KPIDataPoint.kpi_id.in_(kpi_ids),
        )
        .group_by(KPIDataPoint.kpi_id)
        .subquery()
    )
    latest_rows = (
        db.query(KPIDataPoint)
        .filter(KPIDataPoint.id.in_(latest_id_subq))
        .all()
    )
    latest_by_kpi = {row.kpi_id: row for row in latest_rows}

    result = []
    for row in agg_rows:
        latest = latest_by_kpi.get(row.kpi_id)
        result.append(KPISummaryOut(
            kpi_id=row.kpi_id,
            kpi_name=row.kpi_name,
            latest_value=latest.value if latest else None,
            latest_at=str(latest.recorded_at) if latest else None,
            avg_value=round(row.avg_v, 4) if row.avg_v is not None else None,
            min_value=row.min_v,
            max_value=row.max_v,
            trend_direction=latest.trend_direction if latest else None,
            data_points=row.cnt,
        ))
    return result


@router.get("/{kpi_id}/series", response_model=List[KPIDataPointOut])
def kpi_series(
    kpi_id: int,
    range: str = Query("30d", description="today|7d|30d|90d|year"),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    days = RANGE_DAYS.get(range, 30)
    since = datetime.utcnow() - timedelta(days=days)
    points = (
        db.query(KPIDataPoint)
        .filter(
            KPIDataPoint.workspace_id == workspace_id,
            KPIDataPoint.kpi_id == kpi_id,
            KPIDataPoint.recorded_at >= since,
        )
        .order_by(KPIDataPoint.recorded_at.asc())
        .limit(limit)
        .all()
    )
    return [KPIDataPointOut.from_orm_clean(p) for p in points]


@router.get("/", response_model=List[KPIDataPointOut])
def list_kpi_data_points(
    kpi_id: Optional[int] = Query(None),
    range: str = Query("7d", description="today|7d|30d|90d|year"),
    source: Optional[str] = Query(None, description="manual|ga4|shopify|api|calculated"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    days = RANGE_DAYS.get(range, 7)
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(KPIDataPoint).filter(
        KPIDataPoint.workspace_id == workspace_id,
        KPIDataPoint.recorded_at >= since,
    )
    if kpi_id is not None:
        q = q.filter(KPIDataPoint.kpi_id == kpi_id)
    if source:
        q = q.filter(KPIDataPoint.source == source)
    points = q.order_by(KPIDataPoint.recorded_at.desc()).limit(limit).all()
    return [KPIDataPointOut.from_orm_clean(p) for p in points]


@router.post("/", response_model=KPIDataPointOut, status_code=201)
def ingest_kpi_data_point(
    body: KPIDataPointIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_above),
):
    workspace_id = require_workspace_context()
    recorded_at = datetime.utcnow()
    if body.recorded_at:
        try:
            recorded_at = datetime.fromisoformat(body.recorded_at)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid recorded_at format; use ISO 8601")

    point = KPIDataPoint(
        workspace_id=workspace_id,
        kpi_id=body.kpi_id,
        kpi_name=body.kpi_name,
        recorded_at=recorded_at,
        value=body.value,
        source=body.source,
        comparison_value=body.comparison_value,
        change_pct=body.change_pct,
        trend_direction=body.trend_direction or "stable",
        quality_score=body.quality_score if body.quality_score is not None else 100.0,
    )
    db.add(point)
    db.commit()
    db.refresh(point)
    return KPIDataPointOut.from_orm_clean(point)
