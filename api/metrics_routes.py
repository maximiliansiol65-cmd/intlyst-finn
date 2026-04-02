"""
Metrics input routes — direct daily KPI entry with validation.
POST /api/metrics  — Save or update daily metrics for a date
GET  /api/metrics  — List recent metrics entries
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from api.role_guards import require_manager_or_above
from database import get_db
from models.daily_metrics import DailyMetrics
from services.kpi_validation_service import record_inconsistency, validate_daily_metrics

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


class MetricsInput(BaseModel):
    date: date
    period: str = "daily"
    revenue: Optional[float] = None
    cost: Optional[float] = None
    profit: Optional[float] = None
    gross_margin: Optional[float] = None
    cashflow: Optional[float] = None
    liquidity: Optional[float] = None
    traffic: Optional[float] = None
    conversions: Optional[float] = None
    conversion_rate: Optional[float] = None
    new_customers: Optional[float] = None

    @field_validator("period")
    @classmethod
    def validate_period(cls, v: str) -> str:
        if v not in ("daily", "weekly", "monthly"):
            raise ValueError("Period muss 'daily', 'weekly' oder 'monthly' sein.")
        return v


def _to_dict(m: MetricsInput) -> dict:
    return {k: v for k, v in m.model_dump().items() if v is not None and k not in ("date", "period")}


@router.post("")
def save_metrics(
    body: MetricsInput,
    db: Session = Depends(get_db),
    _: User = Depends(require_manager_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Save or update daily metrics. Returns 200 + warnings list; invalid data is flagged, not rejected."""
    data_dict = _to_dict(body)
    warnings = validate_daily_metrics(data_dict)

    if warnings:
        record_inconsistency(db, workspace_id, warnings, context=f"metrics:{body.date}")

    existing = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.date == body.date,
            DailyMetrics.period == body.period,
        )
        .first()
    )

    if existing:
        for k, v in data_dict.items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        action = "updated"
    else:
        row = DailyMetrics(
            workspace_id=workspace_id,
            date=body.date,
            period=body.period,
            **data_dict,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        existing = row
        action = "created"

    return {
        "action": action,
        "id": existing.id,
        "date": str(body.date),
        "warnings": warnings,
        "has_inconsistencies": len(warnings) > 0,
    }


@router.get("")
def list_metrics(
    days: int = 30,
    period: str = "daily",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    from datetime import timedelta
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.date >= since,
            DailyMetrics.period == period,
        )
        .order_by(DailyMetrics.date.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "date": str(r.date),
                "period": r.period,
                "revenue": r.revenue,
                "cost": r.cost,
                "profit": r.profit,
                "traffic": r.traffic,
                "conversions": r.conversions,
                "conversion_rate": r.conversion_rate,
                "new_customers": r.new_customers,
                "cashflow": r.cashflow,
                "liquidity": r.liquidity,
            }
            for r in rows
        ]
    }
