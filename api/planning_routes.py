"""
Intelligentes Planungs-System: Jahresstrategie -> Monatsziele -> Wochenplan -> Tagesaufgaben.
Erzeugt automatische Strategie-Ketten, Priorisierung und CEO-Ansicht.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from models.daily_metrics import DailyMetrics
from models.task import Task
from models.goals import Goal

router = APIRouter(prefix="/api/planning", tags=["planning"])


# ── Data models ─────────────────────────────────────────────────────────────

class PlanItem(BaseModel):
    title: str
    reason: str
    priority: str  # high|medium|low
    kpis: List[str] = []
    time_horizon: str  # daily|weekly|monthly|yearly
    eta_minutes: Optional[int] = None


class PlanResponse(BaseModel):
    yearly: List[PlanItem]
    monthly: List[PlanItem]
    weekly: List[PlanItem]
    daily: List[PlanItem]


def _last_change(db: Session, workspace_id: int, metric: str, days: int = 30) -> float:
    """Return pct change last period vs previous period for metric."""
    today = date.today()
    period = [today - timedelta(days=days), today]
    prev_period = [today - timedelta(days=days * 2), today - timedelta(days=days)]

    def _sum(window):
        q = (
            db.query(DailyMetrics)
            .filter(
                DailyMetrics.workspace_id == workspace_id,
                DailyMetrics.period == "daily",
                DailyMetrics.date >= window[0],
                DailyMetrics.date <= window[1],
            )
        )
        attr = getattr(DailyMetrics, metric)
        total = sum(getattr(r, metric) or 0 for r in q.all())
        return total

    curr = _sum(period)
    prev = _sum(prev_period)
    if prev == 0:
        return 0.0
    return round((curr - prev) / prev * 100, 1)


def _priority_from_change(change: float) -> str:
    if abs(change) >= 15:
        return "high"
    if abs(change) >= 5:
        return "medium"
    return "low"


def _top_tasks(db: Session, workspace_id: int, limit: int = 3) -> List[Task]:
    tasks = (
        db.query(Task)
        .filter(Task.workspace_id == workspace_id, Task.status == "open")
        .order_by(Task.priority.desc(), Task.created_at.desc())
        .limit(limit)
        .all()
    )
    return tasks


def _goals(db: Session, workspace_id: int, period: str, limit: int = 3) -> List[Goal]:
    return (
        db.query(Goal)
        .filter(Goal.workspace_id == workspace_id, Goal.period == period)
        .order_by(Goal.end_date.desc())
        .limit(limit)
        .all()
    )


def _plan_chain(db: Session, workspace_id: int) -> PlanResponse:
    # KPI deltas
    rev_change = _last_change(db, workspace_id, "revenue")
    traffic_change = _last_change(db, workspace_id, "traffic")
    conv_change = _last_change(db, workspace_id, "conversion_rate")

    yearly = [
        PlanItem(
            title="Umsatzwachstum sichern",
            reason=f"Revenue {rev_change:+.1f}% ggü. Vormonat",
            priority=_priority_from_change(rev_change),
            kpis=["revenue", "profit"],
            time_horizon="yearly",
        ),
        PlanItem(
            title="Nachfrage erhöhen",
            reason=f"Traffic {traffic_change:+.1f}% und Conversion {conv_change:+.1f}%",
            priority=_priority_from_change(traffic_change + conv_change),
            kpis=["traffic", "conversion_rate"],
            time_horizon="yearly",
        ),
    ][:3]

    monthly_goals = _goals(db, workspace_id, "monthly", 3)
    monthly = [
        PlanItem(
            title=f"{g.metric} auf {int(g.target_value)} heben",
            reason="Monatsziel aktiv",
            priority="high",
            kpis=[g.metric],
            time_horizon="monthly",
        )
        for g in monthly_goals
    ]
    if len(monthly) < 3:
        monthly.append(
            PlanItem(
                title="Top-3 Wachstumsmaßnahmen starten",
                reason="Automatisch ergänzt",
                priority="medium",
                kpis=["revenue", "traffic"],
                time_horizon="monthly",
            )
        )

    weekly = [
        PlanItem(
            title="Marketing Push (7 Tage)",
            reason="Wachstum kurzfristig erhöhen",
            priority="high",
            kpis=["traffic", "conversion_rate"],
            time_horizon="weekly",
        ),
        PlanItem(
            title="Sales Pipeline auffüllen",
            reason="Lead-Volumen sichern",
            priority="medium",
            kpis=["new_customers"],
            time_horizon="weekly",
        ),
        PlanItem(
            title="Produkt/UX Quick Wins",
            reason="Conversion-Rate anheben",
            priority="medium",
            kpis=["conversion_rate"],
            time_horizon="weekly",
        ),
    ]

    top_tasks = _top_tasks(db, workspace_id, 3)
    daily = [
        PlanItem(
            title=t.title,
            reason=t.goal or "Direkt umsetzbare Aufgabe",
            priority=t.priority,
            kpis=[] if not t.kpis_json else [],
            time_horizon="daily",
            eta_minutes=t.time_estimate_minutes,
        )
        for t in top_tasks
    ]
    if not daily:
        daily = [
            PlanItem(
                title="3 Social Posts planen",
                reason="Traffic & Engagement kurzfristig heben",
                priority="high",
                kpis=["traffic", "engagement"],
                time_horizon="daily",
                eta_minutes=60,
            ),
            PlanItem(
                title="E-Mail an Bestandskunden senden",
                reason="Reaktivierung und Conversion",
                priority="medium",
                kpis=["conversion_rate", "revenue"],
                time_horizon="daily",
                eta_minutes=45,
            ),
        ]

    return PlanResponse(yearly=yearly, monthly=monthly[:3], weekly=weekly[:3], daily=daily[:3])


@router.get("/auto", response_model=PlanResponse)
def auto_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Erstellt automatisch eine verknüpfte Planung (Jahr → Monat → Woche → Tag)."""
    ws_id = getattr(current_user, "active_workspace_id", None) or 1
    return _plan_chain(db, ws_id)


@router.get("/ceo", response_model=PlanResponse)
def ceo_view(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reduzierte CEO-Sicht: nur Top-Prioritäten auf allen Ebenen (max 1 je Ebene)."""
    ws_id = getattr(current_user, "active_workspace_id", None) or 1
    plan = _plan_chain(db, ws_id)
    return PlanResponse(
        yearly=plan.yearly[:1],
        monthly=plan.monthly[:1],
        weekly=plan.weekly[:1],
        daily=plan.daily[:1],
    )
