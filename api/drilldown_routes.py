"""
Drilldown API — rollenbasierter KPI-Tiefeneinblick
GET /api/drilldown/{kpi_key}?days=30
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.auth_routes import get_current_user, get_current_workspace_id
from api.role_guards import (
    CEO_ROLES, MANAGER_ROLES, STRATEGIST_ROLES,
    _get_workspace_role,
)
from database import get_db
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from models.user import User

router = APIRouter(prefix="/api/drilldown", tags=["drilldown"])

# KPI keys → DailyMetrics column map
_KPI_COLUMNS = {
    "revenue":          DailyMetrics.revenue,
    "cost":             DailyMetrics.cost,
    "profit":           DailyMetrics.profit,
    "gross_margin":     DailyMetrics.gross_margin,
    "cashflow":         DailyMetrics.cashflow,
    "liquidity":        DailyMetrics.liquidity,
    "traffic":          DailyMetrics.traffic,
    "conversions":      DailyMetrics.conversions,
    "conversion_rate":  DailyMetrics.conversion_rate,
    "new_customers":    DailyMetrics.new_customers,
}

# Which KPI keys are restricted (require manager+ to see)
_FINANCIAL_KEYS = {"cost", "profit", "gross_margin", "cashflow", "liquidity"}


class DataPoint(BaseModel):
    date: date
    value: float


class TrendSummary(BaseModel):
    avg: float
    min: float
    max: float
    change_pct: Optional[float]   # vs. previous period


class DrilldownResponse(BaseModel):
    kpi_key: str
    days: int
    role: str
    datapoints: list[DataPoint]
    trend: TrendSummary
    goal_target: Optional[float] = None
    goal_status: Optional[str] = None
    causality_note: Optional[str] = None


def _compute_trend(values: list[float]) -> TrendSummary:
    if not values:
        return TrendSummary(avg=0, min=0, max=0, change_pct=None)
    avg = sum(values) / len(values)
    half = max(len(values) // 2, 1)
    first_half = values[:half]
    second_half = values[half:]
    avg_first = sum(first_half) / len(first_half) if first_half else 0
    avg_second = sum(second_half) / len(second_half) if second_half else 0
    change_pct: Optional[float] = None
    if avg_first and avg_first != 0:
        change_pct = round((avg_second - avg_first) / abs(avg_first) * 100, 2)
    return TrendSummary(
        avg=round(avg, 4),
        min=round(min(values), 4),
        max=round(max(values), 4),
        change_pct=change_pct,
    )


def _get_goal_for_kpi(db: Session, workspace_id: int, kpi_key: str):
    """Returns most recent active goal matching the KPI key (case-insensitive title check)."""
    try:
        goals = (
            db.query(Goal)
            .filter(Goal.workspace_id == workspace_id, Goal.status != "archived")
            .order_by(Goal.created_at.desc())
            .limit(50)
            .all()
        )
        for g in goals:
            title = str(getattr(g, "title", "") or "").lower()
            kpi_lower = kpi_key.lower().replace("_", " ")
            if kpi_lower in title or kpi_key.lower() in title:
                return g
    except Exception:
        pass
    return None


@router.get("/{kpi_key}", response_model=DrilldownResponse)
def drilldown_kpi(
    kpi_key: str,
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """
    Drilldown eines KPI über N Tage.

    Rollenzugriff:
    - member/assistant: nur traffic, conversions, conversion_rate, new_customers
    - strategist+: alle KPIs
    - manager+: alle KPIs + Zielstatus
    - CEO/owner: alle KPIs + Zielstatus + Kausalitätshinweis
    """
    col = _KPI_COLUMNS.get(kpi_key)
    if col is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unbekannter KPI-Schlüssel '{kpi_key}'. Gültig: {sorted(_KPI_COLUMNS.keys())}"
        )

    ws_role = _get_workspace_role(current_user, workspace_id, db)

    # Access control: Members cannot see financial KPIs
    if kpi_key in _FINANCIAL_KEYS and ws_role not in STRATEGIST_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Finanzkennzahlen sind erst ab Strategist-Rolle sichtbar."
        )

    since = date.today() - timedelta(days=days)

    rows = (
        db.query(DailyMetrics.date, col)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.date >= since,
        )
        .order_by(DailyMetrics.date.asc())
        .all()
    )

    datapoints = [DataPoint(date=r[0], value=float(r[1] or 0)) for r in rows]
    values = [dp.value for dp in datapoints]
    trend = _compute_trend(values)

    # Goal lookup: only for manager+
    goal_target: Optional[float] = None
    goal_status: Optional[str] = None
    if ws_role in MANAGER_ROLES:
        goal = _get_goal_for_kpi(db, workspace_id, kpi_key)
        if goal:
            goal_target = float(getattr(goal, "target_value", None) or 0) or None
            goal_status = str(getattr(goal, "status", "") or "")

    # Causality note: only for CEO/owner (lightweight, no heavy stats)
    causality_note: Optional[str] = None
    if ws_role in CEO_ROLES and trend.change_pct is not None:
        if trend.change_pct <= -10:
            causality_note = (
                f"Rückgang von {abs(trend.change_pct):.1f}% erkannt. "
                "Mögliche Ursachen: saisonale Effekte, Kampagnenende oder Kostenerhöhung. "
                "Kausalitätsanalyse über /api/ai/analyze verfügbar."
            )
        elif trend.change_pct >= 10:
            causality_note = (
                f"Wachstum von {trend.change_pct:.1f}% erkannt. "
                "Treiber können über /api/ai/analyze genauer untersucht werden."
            )

    return DrilldownResponse(
        kpi_key=kpi_key,
        days=days,
        role=ws_role,
        datapoints=datapoints,
        trend=trend,
        goal_target=goal_target,
        goal_status=goal_status,
        causality_note=causality_note,
    )
