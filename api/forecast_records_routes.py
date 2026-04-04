"""
forecast_records_routes.py
REST API for persisted ForecastRecord entries.
GET /api/forecast-records              – List stored forecasts
GET /api/forecast-records/{id}/vs-actual – Compare forecast against actual value
POST /api/forecast-records/{id}/actual   – Submit actual value for a past forecast
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import get_current_user, User
from api.role_guards import require_strategist_or_above, require_manager_or_above
from models.forecast_record import ForecastRecord
from services.tenant_guard import require_workspace_context, assert_owns_resource
from services.forecast_service import (
    get_forecast_records,
    compare_forecast_vs_actual,
)

router = APIRouter(prefix="/api/forecast-records", tags=["forecast-records"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ForecastRecordOut(BaseModel):
    id: int
    workspace_id: int
    kpi_id: Optional[int] = None
    kpi_name: str
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    baseline_value: Optional[float] = None
    forecast_value: Optional[float] = None
    best_case: Optional[float] = None
    worst_case: Optional[float] = None
    confidence_range: Optional[str] = None
    model_version: Optional[str] = None
    trend: Optional[str] = None
    growth_pct: Optional[float] = None
    confidence: Optional[float] = None
    actual_value: Optional[float] = None
    accuracy_pct: Optional[float] = None
    linked_insight_id: Optional[int] = None
    linked_scenario_ids: Optional[str] = None
    generated_at: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_clean(cls, obj: object) -> "ForecastRecordOut":
        return cls(
            id=int(getattr(obj, "id")),
            workspace_id=int(getattr(obj, "workspace_id")),
            kpi_id=(int(getattr(obj, "kpi_id")) if getattr(obj, "kpi_id", None) is not None else None),
            kpi_name=str(getattr(obj, "kpi_name")),
            period_start=(str(getattr(obj, "period_start")) if getattr(obj, "period_start", None) is not None else None),
            period_end=(str(getattr(obj, "period_end")) if getattr(obj, "period_end", None) is not None else None),
            baseline_value=(float(getattr(obj, "baseline_value")) if getattr(obj, "baseline_value", None) is not None else None),
            forecast_value=(float(getattr(obj, "forecast_value")) if getattr(obj, "forecast_value", None) is not None else None),
            best_case=(float(getattr(obj, "best_case")) if getattr(obj, "best_case", None) is not None else None),
            worst_case=(float(getattr(obj, "worst_case")) if getattr(obj, "worst_case", None) is not None else None),
            confidence_range=getattr(obj, "confidence_range", None),
            model_version=getattr(obj, "model_version", None),
            trend=getattr(obj, "trend", None),
            growth_pct=(float(getattr(obj, "growth_pct")) if getattr(obj, "growth_pct", None) is not None else None),
            confidence=(float(getattr(obj, "confidence")) if getattr(obj, "confidence", None) is not None else None),
            actual_value=(float(getattr(obj, "actual_value")) if getattr(obj, "actual_value", None) is not None else None),
            accuracy_pct=(float(getattr(obj, "accuracy_pct")) if getattr(obj, "accuracy_pct", None) is not None else None),
            linked_insight_id=(int(getattr(obj, "linked_insight_id")) if getattr(obj, "linked_insight_id", None) is not None else None),
            linked_scenario_ids=getattr(obj, "linked_scenario_ids", None),
            generated_at=(str(getattr(obj, "generated_at")) if getattr(obj, "generated_at", None) is not None else None),
        )


class ActualValueIn(BaseModel):
    actual_value: float = Field(..., description="The real measured value after the forecast period")


class ForecastVsActualOut(BaseModel):
    forecast_id: int
    kpi_name: str
    forecast_value: Optional[float]
    actual_value: Optional[float]
    accuracy_pct: Optional[float]
    trend: Optional[str]
    period_end: Optional[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ForecastRecordOut])
def list_forecast_records(
    kpi_name: Optional[str] = Query(None),
    kpi_id: Optional[int] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    records = get_forecast_records(db, workspace_id, kpi_name=kpi_name, kpi_id=kpi_id, limit=limit)
    return [ForecastRecordOut.from_orm_clean(r) for r in records]


@router.get("/{forecast_id}/vs-actual", response_model=ForecastVsActualOut)
def get_vs_actual(
    forecast_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    record = (
        db.query(ForecastRecord)
        .filter(ForecastRecord.workspace_id == workspace_id, ForecastRecord.id == forecast_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Forecast record not found")
    assert_owns_resource(getattr(record, "workspace_id"), workspace_id)
    record_id = getattr(record, "id", None)
    kpi_name = getattr(record, "kpi_name", "")
    forecast_value = getattr(record, "forecast_value", None)
    actual_value = getattr(record, "actual_value", None)
    accuracy_pct = getattr(record, "accuracy_pct", None)
    trend = getattr(record, "trend", None)
    period_end_raw = getattr(record, "period_end", None)
    return ForecastVsActualOut(
        forecast_id=int(record_id) if isinstance(record_id, int) else forecast_id,
        kpi_name=str(kpi_name),
        forecast_value=float(forecast_value) if forecast_value is not None else None,
        actual_value=float(actual_value) if actual_value is not None else None,
        accuracy_pct=float(accuracy_pct) if accuracy_pct is not None else None,
        trend=str(trend) if trend is not None else None,
        period_end=str(period_end_raw) if period_end_raw is not None else None,
    )


@router.post("/{forecast_id}/actual", response_model=ForecastRecordOut)
def submit_actual(
    forecast_id: int,
    body: ActualValueIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_above),
):
    workspace_id = require_workspace_context()
    record = compare_forecast_vs_actual(db, workspace_id, forecast_id, body.actual_value)
    if not record:
        raise HTTPException(status_code=404, detail="Forecast record not found")
    return ForecastRecordOut.from_orm_clean(record)
