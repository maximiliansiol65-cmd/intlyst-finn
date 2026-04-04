import json
import os
from datetime import date, timedelta
from typing import Optional
import math

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user, get_current_workspace_id
from api.role_guards import require_member_or_above
from models.daily_metrics import DailyMetrics
from security_config import is_configured_secret
from services.forecast_service import persist_forecast_diagnosis

router = APIRouter(prefix="/api/forecast", tags=["forecast"])


@router.get("")
def forecast_overview(current_user: User = Depends(require_member_or_above)):
    """Health endpoint so unauthenticated calls fail with 401."""
    return {"metrics": ["revenue", "traffic", "conversion_rate", "new_customers"]}

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"


class ForecastPoint(BaseModel):
    date: str
    value: float
    is_forecast: bool
    confidence_low: Optional[float] = None
    confidence_high: Optional[float] = None


class ForecastResponse(BaseModel):
    metric: str
    metric_label: str
    horizon_days: int
    historical: list[ForecastPoint]
    forecast: list[ForecastPoint]
    trend: str
    growth_pct: float
    summary: str
    confidence_note: str = ""
    generated_by: str = "claude"
    persisted_forecast_id: Optional[int] = None
    linked_insight_id: Optional[int] = None
    root_cause_insight_id: Optional[int] = None
    decision_problem_id: Optional[int] = None
    hidden_problems: list[dict] = []
    opportunities: list[dict] = []
    top_opportunity: Optional[dict] = None
    recommended_actions: list[str] = []


METRIC_LABELS = {
    "revenue": "Umsatz",
    "traffic": "Traffic",
    "conversions": "Conversions",
    "conversion_rate": "Conversion Rate",
    "new_customers": "Neue Kunden",
}


def _build_fallback_forecast(historical: list[dict], horizon_days: int) -> dict:
    # Lokaler Fallback: lineare Regression + Konfidenzintervall
    values = [float(point.get("value", 0.0)) for point in historical]
    if not values:
        return {
            "forecast": [],
            "trend": "stable",
            "growth_pct": 0.0,
            "summary": "Fallback-Prognose ohne externe KI.",
            "confidence_note": "",
        }

    # Lineare Regression auf den letzten 14 Tagen
    window = values[-14:] if len(values) >= 14 else values
    n = len(window)
    x_mean = (n - 1) / 2.0
    y_mean = sum(window) / n
    ss_xx = sum((i - x_mean) ** 2 for i in range(n))
    ss_xy = sum((i - x_mean) * (window[i] - y_mean) for i in range(n))
    slope = ss_xy / ss_xx if ss_xx != 0 else 0.0
    intercept = y_mean - slope * x_mean

    # Residual-Standardabweichung für Konfidenzband
    residuals = [window[i] - (intercept + slope * i) for i in range(n)]
    std_err = math.sqrt(sum(r ** 2 for r in residuals) / max(n - 2, 1))
    z95 = 1.96  # 95% Konfidenz

    today = date.today()
    forecast = []
    for index in range(horizon_days):
        x_future = n + index
        predicted = intercept + slope * x_future
        predicted = max(0.0, predicted)
        # Konfidenzband weitet sich mit Abstand aus
        margin = z95 * std_err * math.sqrt(1 + 1 / n + (x_future - x_mean) ** 2 / max(ss_xx, 1e-9))
        forecast.append({
            "date": str(today + timedelta(days=index + 1)),
            "value": round(predicted, 4),
            "confidence_low":  round(max(0.0, predicted - margin), 4),
            "confidence_high": round(predicted + margin, 4),
        })

    first = values[0] if values[0] != 0 else 1.0
    growth_pct = round((forecast[-1]["value"] - values[0]) / first * 100, 2) if forecast else 0.0
    trend = "up" if slope > 0.01 else "down" if slope < -0.01 else "stable"

    return {
        "forecast": forecast,
        "confidence_note": "Lineare Regression (14-Tage-Fenster), 95%-Konfidenzband",
        "trend": trend,
        "growth_pct": growth_pct,
        "summary": "Fallback-Prognose aktiv: Externe KI war nicht verfuegbar.",
    }


def get_historical(metric: str, db: Session, workspace_id: int, days: int = 30) -> list[dict]:
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= since,
        )
        .order_by(DailyMetrics.date)
        .all()
    )
    mapping = {
        "revenue": lambda row: row.revenue,
        "traffic": lambda row: float(row.traffic),
        "conversions": lambda row: float(row.conversions),
        "conversion_rate": lambda row: row.conversion_rate,
        "new_customers": lambda row: float(row.new_customers),
    }
    getter = mapping.get(metric, lambda row: 0.0)
    return [{"date": str(row.date), "value": round(getter(row), 4)} for row in rows]


async def call_claude_forecast(
    metric: str,
    label: str,
    historical: list[dict],
    horizon_days: int,
) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY fehlt oder ungueltig.")

    hist_text = "\n".join(f"{point['date']}: {point['value']}" for point in historical[-14:])

    today = date.today()
    future_dates = [str(today + timedelta(days=index + 1)) for index in range(horizon_days)]

    system = (
        "Du bist ein Datenanalyst. Erstelle eine Prognose basierend auf historischen "
        "Geschaeftsdaten. Antworte NUR mit einem JSON-Objekt - kein Markdown und kein "
        "erklaerender Text davor oder danach."
    )

    prompt = f"""Metrik: {label}
Historische Daten (letzte 14 Tage):
{hist_text}

Erstelle eine {horizon_days}-Tage-Prognose fuer diese Daten.
Beruecksichtige den Trend, Wochenmuster und realistische Schwankungen.

Antworte NUR mit diesem JSON:
{{
  "forecast": [
    {{"date": "{future_dates[0]}", "value": 0.0}},
    ... fuer alle {horizon_days} Tage
  ],
  "trend": "up|down|stable",
  "growth_pct": 5.2,
  "summary": "Ein Satz: was erwartet den Nutzer in den naechsten {horizon_days} Tagen"
}}

Wichtig: Exakt {horizon_days} Eintraege im forecast Array. Dates: {', '.join(future_dates[:3])} ... {future_dates[-1]}"""

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            CLAUDE_API_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 1000,
                "system": system,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Claude Fehler: {response.text[:200]}")

    raw = response.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Forecast JSON-Parse Fehler: {str(exc)}")


@router.get("/{metric}", response_model=ForecastResponse)
async def get_forecast(
    metric: str,
    horizon: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    if metric not in METRIC_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"Metrik ungueltig. Erlaubt: {list(METRIC_LABELS.keys())}",
        )

    if horizon not in [30, 60, 90]:
        raise HTTPException(status_code=400, detail="Horizon muss 30, 60 oder 90 sein.")

    label = METRIC_LABELS[metric]
    historical_raw = get_historical(metric, db, workspace_id, days=30)

    if not historical_raw:
        raise HTTPException(status_code=404, detail="Keine historischen Daten verfuegbar.")

    try:
        result = await call_claude_forecast(metric, label, historical_raw, horizon)
        result["generated_by"] = "claude"
    except HTTPException:
        result = _build_fallback_forecast(historical_raw, horizon)
        result["generated_by"] = "local"
    except Exception:
        result = _build_fallback_forecast(historical_raw, horizon)
        result["generated_by"] = "local"

    historical = [
        ForecastPoint(date=point["date"], value=point["value"], is_forecast=False)
        for point in historical_raw
    ]
    forecast = [
        ForecastPoint(
            date=point["date"],
            value=round(float(point["value"]), 4),
            is_forecast=True,
            confidence_low=round(float(point["confidence_low"]), 4) if point.get("confidence_low") is not None else None,
            confidence_high=round(float(point["confidence_high"]), 4) if point.get("confidence_high") is not None else None,
        )
        for point in result["forecast"]
    ]

    response = ForecastResponse(
        metric=metric,
        metric_label=label,
        horizon_days=horizon,
        historical=historical,
        forecast=forecast,
        trend=result.get("trend", "stable"),
        growth_pct=float(result.get("growth_pct", 0.0)),
        summary=result.get("summary", ""),
        confidence_note=result.get("confidence_note", ""),
        generated_by=result.get("generated_by", "claude"),
    )
    try:
        diagnosis = persist_forecast_diagnosis(
            db=db,
            workspace_id=workspace_id,
            kpi_name=metric,
            forecast_result={
                "historical": historical_raw,
                "forecast": result.get("forecast", []),
                "trend": result.get("trend", "stable"),
                "growth_pct": result.get("growth_pct", 0.0),
                "confidence": 70.0,
            },
            historical_points=historical_raw,
        )
        response.persisted_forecast_id = int(diagnosis["forecast_record"].id)
        response.linked_insight_id = diagnosis["linked_insight_id"]
        response.root_cause_insight_id = diagnosis["root_cause_insight_id"]
        response.decision_problem_id = diagnosis["decision_problem_id"]
        response.hidden_problems = diagnosis["hidden_problems"]
        response.opportunities = diagnosis.get("opportunities", [])
        response.top_opportunity = diagnosis.get("top_opportunity")
        response.recommended_actions = diagnosis["actions"]
    except Exception:
        pass
    return response
