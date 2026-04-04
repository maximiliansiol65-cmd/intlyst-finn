"""
di_dashboard_routes.py
Decision Intelligence dashboard summary endpoint.
GET /api/di/dashboard  – Returns the top-1 of each signal type for the CEO overview:
  - critical_kpi:    KPI with worst recent trend (down + highest deviation)
  - top_opportunity: Insight of type 'opportunity' with highest impact_score
  - top_problem:     Insight of type 'problem' with highest priority + impact
  - top_task:        Highest-priority open task
  - top_recommendation: Newest AI output with highest confidence
  - forecast_alert:  Forecast where worst_case is meaningfully below baseline
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import get_current_user, get_current_workspace_id, User
from api.role_guards import require_member_or_above
from models.kpi_data_point import KPIDataPoint
from models.insight import Insight
from models.ai_output import AIOutput
from models.forecast_record import ForecastRecord

try:
    from models.task import Task
    _HAS_TASK = True
except Exception:
    _HAS_TASK = False

router = APIRouter(prefix="/api/di", tags=["di-dashboard"])

PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class KPISignal(BaseModel):
    kpi_id: int
    kpi_name: Optional[str] = None
    latest_value: float
    trend_direction: Optional[str] = None
    change_pct: Optional[float] = None


class InsightSignal(BaseModel):
    id: int
    title: str
    insight_type: str
    priority: str
    impact_score: Optional[float] = None
    what_to_do: Optional[str] = None


class TaskSignal(BaseModel):
    id: int
    title: str
    priority: str
    status: str
    assignee: Optional[str] = None
    due_date: Optional[str] = None


class AIOutputSignal(BaseModel):
    id: int
    agent_role: str
    output_type: str
    content: str
    confidence_score: Optional[float] = None
    generated_at: str


class ForecastSignal(BaseModel):
    id: int
    kpi_name: str
    forecast_value: Optional[float] = None
    worst_case: Optional[float] = None
    baseline_value: Optional[float] = None
    confidence: Optional[float] = None
    trend: Optional[str] = None


class DIDashboardOut(BaseModel):
    generated_at: str
    critical_kpi: Optional[KPISignal] = None
    top_opportunity: Optional[InsightSignal] = None
    top_problem: Optional[InsightSignal] = None
    top_task: Optional[TaskSignal] = None
    top_recommendation: Optional[AIOutputSignal] = None
    forecast_alert: Optional[ForecastSignal] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_critical_kpi(db: Session, workspace_id: int) -> Optional[KPISignal]:
    """Latest KPI with trend=down and worst change_pct."""
    since = datetime.utcnow() - timedelta(days=7)
    candidates = (
        db.query(KPIDataPoint)
        .filter(
            KPIDataPoint.workspace_id == workspace_id,
            KPIDataPoint.trend_direction == "down",
            KPIDataPoint.recorded_at >= since,
        )
        .order_by(KPIDataPoint.change_pct.asc())
        .first()
    )
    if not candidates:
        # Fallback: just the latest reading regardless of trend
        candidates = (
            db.query(KPIDataPoint)
            .filter(KPIDataPoint.workspace_id == workspace_id)
            .order_by(KPIDataPoint.recorded_at.desc())
            .first()
        )
    if not candidates:
        return None
    return KPISignal(
        kpi_id=candidates.kpi_id,
        kpi_name=candidates.kpi_name,
        latest_value=candidates.value,
        trend_direction=candidates.trend_direction,
        change_pct=candidates.change_pct,
    )


def _get_insight(db: Session, workspace_id: int, insight_type: str) -> Optional[InsightSignal]:
    obj = (
        db.query(Insight)
        .filter(
            Insight.workspace_id == workspace_id,
            Insight.insight_type == insight_type,
            Insight.status.in_(["new", "acknowledged", "in_progress"]),
        )
        .order_by(Insight.impact_score.desc())
        .first()
    )
    if not obj:
        return None
    return InsightSignal(
        id=obj.id,
        title=obj.title,
        insight_type=obj.insight_type,
        priority=obj.priority,
        impact_score=obj.impact_score,
        what_to_do=obj.what_to_do,
    )


def _get_top_task(db: Session, workspace_id: int) -> Optional[TaskSignal]:
    if not _HAS_TASK:
        return None
    try:
        obj = (
            db.query(Task)
            .filter(
                Task.workspace_id == workspace_id,
                Task.status.in_(["open", "in_progress"]),
            )
            .all()
        )
        if not obj:
            return None
        # Sort by priority then due_date
        obj.sort(key=lambda t: (PRIORITY_ORDER.get(t.priority, 99), t.due_date or datetime.max))
        top = obj[0]
        return TaskSignal(
            id=top.id,
            title=top.title,
            priority=top.priority,
            status=top.status,
            assignee=getattr(top, "assigned_to", None),  # Field is assigned_to, not assignee
            due_date=str(top.due_date) if getattr(top, "due_date", None) else None,
        )
    except Exception:
        return None


def _get_top_recommendation(db: Session, workspace_id: int) -> Optional[AIOutputSignal]:
    obj = (
        db.query(AIOutput)
        .filter(
            AIOutput.workspace_id == workspace_id,
            AIOutput.status == "new",
        )
        .order_by(AIOutput.confidence_score.desc(), AIOutput.generated_at.desc())
        .first()
    )
    if not obj:
        return None
    return AIOutputSignal(
        id=obj.id,
        agent_role=obj.agent_role,
        output_type=obj.output_type,
        content=obj.content[:300],  # Truncate for dashboard card
        confidence_score=obj.confidence_score,
        generated_at=str(obj.generated_at),
    )


def _get_forecast_alert(db: Session, workspace_id: int) -> Optional[ForecastSignal]:
    """Forecast where worst_case is ≥10% below baseline."""
    forecasts = (
        db.query(ForecastRecord)
        .filter(
            ForecastRecord.workspace_id == workspace_id,
            ForecastRecord.worst_case.isnot(None),
            ForecastRecord.baseline_value.isnot(None),
        )
        .order_by(ForecastRecord.generated_at.desc())
        .limit(20)
        .all()
    )
    worst = None
    worst_deviation = 0.0
    for f in forecasts:
        if f.baseline_value and f.baseline_value != 0:
            deviation = (f.baseline_value - f.worst_case) / abs(f.baseline_value)
            if deviation > worst_deviation:
                worst_deviation = deviation
                worst = f
    if not worst or worst_deviation < 0.10:
        return None
    return ForecastSignal(
        id=worst.id,
        kpi_name=worst.kpi_name,
        forecast_value=worst.forecast_value,
        worst_case=worst.worst_case,
        baseline_value=worst.baseline_value,
        confidence=worst.confidence,
        trend=worst.trend,
    )


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DIDashboardOut)
def di_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    return DIDashboardOut(
        generated_at=str(datetime.utcnow()),
        critical_kpi=_get_critical_kpi(db, workspace_id),
        top_opportunity=_get_insight(db, workspace_id, "opportunity"),
        top_problem=_get_insight(db, workspace_id, "problem"),
        top_task=_get_top_task(db, workspace_id),
        top_recommendation=_get_top_recommendation(db, workspace_id),
        forecast_alert=_get_forecast_alert(db, workspace_id),
    )
