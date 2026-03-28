"""
Proaktives Vorhersage- und Handlungssystem:
 - Erkennt Trends, Risiken, Chancen aus KPIs
 - Liefert Forecasts und priorisierte Empfehlungen
 - Bereitet 1-Klick-Aktionen (E-Mail, Social, Tasks) vor
 - CEO-Ansicht und einfache Simulation
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from analytics.forecasting import forecast_metric
from database import get_db
from models.daily_metrics import DailyMetrics

router = APIRouter(prefix="/api/proactive", tags=["proactive"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class MetricForecast(BaseModel):
    metric: str
    trend: str
    change_7d_pct: float
    forecast_7d: List[float]
    risk_level: str  # high|medium|low|opportunity


class ActionDraft(BaseModel):
    title: str
    priority: str
    category: str  # marketing|sales|content|strategy
    description: str
    kpis: List[str]
    eta_minutes: int
    email_subject: str
    email_body: str
    social_text: str
    task_payload: dict


class ProactiveResponse(BaseModel):
    forecasts: List[MetricForecast]
    risks: List[str]
    opportunities: List[str]
    actions: List[ActionDraft]


class SimulationRequest(BaseModel):
    measures: List[str]  # e.g. ["launch_email", "add_social_campaign"]
    baseline_metric: str = "revenue"


class SimulationResult(BaseModel):
    metric: str
    expected_change_pct: float
    rationale: str


def _latest_series(db: Session, metric: str, days: int = 60) -> List[float]:
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily")
        .order_by(DailyMetrics.date.desc())
        .limit(days)
        .all()
    )
    values = [float(getattr(r, metric, 0) or 0) for r in rows][::-1]
    return values


def _pct_change(series: List[float], window: int = 7) -> float:
    if len(series) < window * 2:
        return 0.0
    recent = series[-window:]
    prev = series[-window * 2 : -window]
    prev_avg = sum(prev) / len(prev) if prev else 0
    if prev_avg == 0:
        return 0.0
    return round((sum(recent) / len(recent) - prev_avg) / prev_avg * 100, 1)


def _risk_level(change: float) -> str:
    if change <= -10:
        return "high"
    if change <= -3:
        return "medium"
    if change >= 8:
        return "opportunity"
    return "low"


def _action_for(metric: str, change: float) -> ActionDraft:
    metric_label = {
        "revenue": "Umsatz",
        "traffic": "Traffic",
        "conversion_rate": "Conversion",
        "new_customers": "Neukunden",
        "social": "Social Engagement",
    }.get(metric, metric)

    if change < 0:
        title = f"{metric_label} stabilisieren"
        priority = "high" if change <= -10 else "medium"
        description = f"{metric_label} ist um {abs(change):.1f}% gefallen. Sofortmaßnahmen starten."
        email_body = (
            f"Team,\n\n{metric_label} ist um {abs(change):.1f}% gefallen. Bitte diese 3 Schritte umsetzen:\n"
            "1) Schnellkampagne aktivieren (Paid + Social)\n"
            "2) Landingpage-CTA testen und A/B starten\n"
            "3) Bestandskunden-Reaktivierung per E-Mail\n"
        )
        social = "Sofort-Update: Neue Aktionen live, stay tuned."
    else:
        title = f"{metric_label} Wachstumshebel nutzen"
        priority = "medium"
        description = f"{metric_label} steigt um {change:.1f}%. Jetzt Upsell/Conversion optimieren."
        email_body = (
            f"{metric_label} zeigt Momentum (+{change:.1f}%). Vorschlag:\n"
            "1) Upsell/Bundle-Angebot live schalten\n"
            "2) Retargeting verstärken\n"
            "3) Social Proof prominent platzieren\n"
        )
        social = "Momentum nutzen: Neue Angebote jetzt testen."

    return ActionDraft(
        title=title,
        priority=priority,
        category="marketing" if metric in ("traffic", "social") else "sales",
        description=description,
        kpis=[metric],
        eta_minutes=90,
        email_subject=title,
        email_body=email_body,
        social_text=social,
        task_payload={
            "title": title,
            "priority": priority,
            "goal": description,
            "kpis": [metric],
            "impact": "high" if priority == "high" else "medium",
        },
    )


def _build_insights(db: Session) -> ProactiveResponse:
    metrics = ["revenue", "traffic", "conversion_rate", "new_customers"]
    forecasts: List[MetricForecast] = []
    risks: List[str] = []
    opportunities: List[str] = []
    actions: List[ActionDraft] = []

    for m in metrics:
        series = _latest_series(db, m, 60)
        change = _pct_change(series, 7)
        risk = _risk_level(change)
        try:
            fc = forecast_metric(series, metric=m, horizon_days=7)
            forecast_vals = [p.value for p in fc.forecast] if fc.forecast else []
            trend = fc.trend
        except Exception:
            forecast_vals = []
            trend = "stable"

        forecasts.append(MetricForecast(
            metric=m,
            trend=trend,
            change_7d_pct=change,
            forecast_7d=forecast_vals,
            risk_level=risk,
        ))

        if risk in ("high", "medium") and change < 0:
            risks.append(f"{m}: {change:+.1f}% (Risiko {risk})")
            actions.append(_action_for(m, change))
        if risk == "opportunity":
            opportunities.append(f"{m}: {change:+.1f}% Momentum")
            actions.append(_action_for(m, change))

    # Priorisieren Aktionen: high > medium
    priority_order = {"high": 0, "medium": 1, "low": 2}
    actions = sorted(actions, key=lambda a: priority_order.get(a.priority, 2))[:6]

    return ProactiveResponse(
        forecasts=forecasts,
        risks=risks,
        opportunities=opportunities,
        actions=actions,
    )


@router.get("/insights", response_model=ProactiveResponse)
def proactive_insights(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Proaktive Vorhersagen, Risiken, Chancen und 1-Klick-fertige Aktionen."""
    return _build_insights(db)


@router.get("/ceo", response_model=ProactiveResponse)
def proactive_ceo(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """CEO-Ansicht: nur Top-Risiko, Top-Chance, Top-Aktion pro Ebene."""
    data = _build_insights(db)
    return ProactiveResponse(
        forecasts=data.forecasts[:2],
        risks=data.risks[:1],
        opportunities=data.opportunities[:1],
        actions=data.actions[:2],
    )


@router.post("/simulate", response_model=List[SimulationResult])
def simulate(measures: SimulationRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Grobe Was-wäre-wenn Simulation mit heuristischen Impact-Faktoren."""
    impacts = {
        "launch_email": 4,
        "add_social_campaign": 3,
        "landingpage_ab": 2,
        "increase_budget": 5,
    }
    total = sum(impacts.get(m, 1) for m in measures.measures)
    change = min(25.0, total * 1.5)
    return [
        SimulationResult(
            metric=measures.baseline_metric,
            expected_change_pct=change,
            rationale=f"Summierte Wirkung der Maßnahmen ({', '.join(measures.measures)})",
        )
    ]

