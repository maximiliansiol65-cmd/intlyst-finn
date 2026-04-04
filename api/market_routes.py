"""
Markt- und Standortanalyse - Google Trends + Branchenvergleich + KI-Markteinschaetzung
"""

import json
import os
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user, get_current_workspace_id
from api.role_guards import require_member_or_above
from models.daily_metrics import DailyMetrics
from security_config import is_configured_secret

router = APIRouter(prefix="/api/market", tags=["market"])

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"


class BenchmarkMetric(BaseModel):
    metric: str
    metric_label: str
    your_value: float
    industry_avg: float
    industry_top: float
    percentile: int
    status: str


class MarketTrend(BaseModel):
    keyword: str
    trend: str
    change_pct: float
    relevance: str


class MarketInsight(BaseModel):
    type: str
    title: str
    description: str
    action: str


class MarketOverview(BaseModel):
    industry: str
    season: str
    season_label: str
    benchmarks: list[BenchmarkMetric]
    trends: list[MarketTrend]
    insights: list[MarketInsight]
    summary: str
    generated_by: str = "claude"


class LocationData(BaseModel):
    city: str
    region: str
    country: str
    lat: float
    lng: float
    local_market_size: str
    competitors_nearby: int
    catchment_radius_km: int


INDUSTRY_BENCHMARKS = {
    "ecommerce": {
        "conversion_rate": {"avg": 0.032, "top": 0.065},
        "traffic_growth": {"avg": 0.08, "top": 0.25},
        "revenue_growth": {"avg": 0.12, "top": 0.35},
        "new_customers": {"avg": 2.5, "top": 6.0},
    },
    "saas": {
        "conversion_rate": {"avg": 0.025, "top": 0.055},
        "traffic_growth": {"avg": 0.10, "top": 0.30},
        "revenue_growth": {"avg": 0.15, "top": 0.40},
        "new_customers": {"avg": 1.8, "top": 5.0},
    },
    "retail": {
        "conversion_rate": {"avg": 0.028, "top": 0.058},
        "traffic_growth": {"avg": 0.05, "top": 0.18},
        "revenue_growth": {"avg": 0.08, "top": 0.25},
        "new_customers": {"avg": 2.0, "top": 5.5},
    },
    "gastro": {
        "conversion_rate": {"avg": 0.040, "top": 0.080},
        "traffic_growth": {"avg": 0.06, "top": 0.20},
        "revenue_growth": {"avg": 0.07, "top": 0.22},
        "new_customers": {"avg": 3.0, "top": 7.0},
    },
    "manufacturing": {
        "conversion_rate": {"avg": 0.018, "top": 0.040},
        "traffic_growth": {"avg": 0.04, "top": 0.12},
        "revenue_growth": {"avg": 0.10, "top": 0.28},
        "new_customers": {"avg": 1.4, "top": 4.0},
    },
    "finance": {
        "conversion_rate": {"avg": 0.020, "top": 0.050},
        "traffic_growth": {"avg": 0.06, "top": 0.18},
        "revenue_growth": {"avg": 0.09, "top": 0.25},
        "new_customers": {"avg": 1.2, "top": 3.5},
    },
    "healthcare": {
        "conversion_rate": {"avg": 0.018, "top": 0.040},
        "traffic_growth": {"avg": 0.05, "top": 0.15},
        "revenue_growth": {"avg": 0.08, "top": 0.22},
        "new_customers": {"avg": 1.0, "top": 3.0},
    },
    "public": {
        "conversion_rate": {"avg": 0.015, "top": 0.035},
        "traffic_growth": {"avg": 0.03, "top": 0.10},
        "revenue_growth": {"avg": 0.05, "top": 0.15},
        "new_customers": {"avg": 0.8, "top": 2.5},
    },
}

METRIC_LABELS = {
    "conversion_rate": "Conversion Rate",
    "traffic_growth": "Traffic-Wachstum",
    "revenue_growth": "Umsatz-Wachstum",
    "new_customers": "Neue Kunden/Tag",
}

SEASON_DATA = {
    1: ("low", "Nachsaison Januar"),
    2: ("low", "Ruhige Wintermonate"),
    3: ("normal", "Fruehjahrsbelebung"),
    4: ("normal", "Ostergeschaeft"),
    5: ("normal", "Fruehlingsaufschwung"),
    6: ("normal", "Sommerbeginn"),
    7: ("high", "Hochsommer"),
    8: ("high", "Hochsommer"),
    9: ("normal", "Herbstbelebung"),
    10: ("normal", "Pre-Weihnachtszeit"),
    11: ("high", "Black Friday / Advent"),
    12: ("high", "Weihnachtsgeschaeft"),
}


def get_your_metrics(db: Session, workspace_id: int) -> dict:
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.workspace_id == workspace_id, DailyMetrics.period == "daily")
        .order_by(DailyMetrics.date)
        .all()
    )
    if not rows:
        return {}

    half = len(rows) // 2
    recent = rows[half:] if half > 0 else rows
    older = rows[:half] if half > 0 else rows

    avg_conv = sum(row.conversion_rate for row in rows) / len(rows)
    avg_new = sum(row.new_customers for row in rows) / len(rows)

    recent_rev = sum(row.revenue for row in recent) / len(recent)
    older_rev = sum(row.revenue for row in older) / len(older)
    recent_tr = sum(row.traffic for row in recent) / len(recent)
    older_tr = sum(row.traffic for row in older) / len(older)

    return {
        "conversion_rate": round(avg_conv, 4),
        "revenue_growth": round((recent_rev - older_rev) / older_rev, 4) if older_rev else 0,
        "traffic_growth": round((recent_tr - older_tr) / older_tr, 4) if older_tr else 0,
        "new_customers": round(avg_new, 2),
    }


def calculate_percentile(your_val: float, avg: float, top: float) -> int:
    if your_val >= top:
        return 95
    if your_val >= avg:
        ratio = (your_val - avg) / (top - avg) if top > avg else 1.0
        return int(50 + ratio * 45)
    ratio = your_val / avg if avg > 0 else 0
    return int(ratio * 50)


async def call_claude_market(
    industry: str,
    benchmarks: list[BenchmarkMetric],
    season: str,
) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return {
            "trends": [],
            "insights": [],
            "summary": "API Key fehlt - Marktanalyse nicht verfuegbar.",
        }

    bench_text = "\n".join(
        f"- {b.metric_label}: du {b.your_value} vs. Branche Avg {b.industry_avg} (Perzentile: {b.percentile})"
        for b in benchmarks
    )

    prompt = f"""Du analysierst die Marktlage fuer ein Unternehmen in der Branche: {industry}
Aktuelle Saison: {season}

Branchenvergleich:
{bench_text}

Erstelle eine Marktanalyse. Antworte NUR mit diesem JSON (kein Markdown):
{{
  "trends": [
    {{
      "keyword": "Keyword oder Thema",
      "trend": "up|down|stable",
      "change_pct": 12.5,
      "relevance": "high|medium|low"
    }}
  ],
  "insights": [
    {{
      "type": "opportunity|warning|info",
      "title": "Kurzer Titel",
      "description": "2 Saetze Erklaerung",
      "action": "Konkrete Massnahme"
    }}
  ],
  "summary": "2-3 Saetze: aktuelle Marktlage und was das fuer dieses Unternehmen bedeutet"
}}

Erstelle 3-4 Trends und 3-4 Insights. Sei konkret und branchenspezifisch."""

    async with httpx.AsyncClient(timeout=25) as client:
        res = await client.post(
            CLAUDE_API_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 1000,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if res.status_code != 200:
        return {"trends": [], "insights": [], "summary": f"API Fehler: {res.status_code}"}

    raw = res.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {"trends": [], "insights": [], "summary": "Antwort konnte nicht geparst werden."}


@router.get("/overview", response_model=MarketOverview)
async def get_market_overview(
    industry: str = "ecommerce",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    valid = list(INDUSTRY_BENCHMARKS.keys())
    if industry not in valid:
        raise HTTPException(status_code=400, detail=f"Branche muss eine von {valid} sein.")

    your_metrics = get_your_metrics(db, workspace_id)
    bench_data = INDUSTRY_BENCHMARKS[industry]
    season, season_label = SEASON_DATA.get(date.today().month, ("normal", "Normalsaison"))

    benchmarks: list[BenchmarkMetric] = []
    for metric, values in bench_data.items():
        your_val = your_metrics.get(metric, 0.0)
        avg = values["avg"]
        top = values["top"]
        percentile = calculate_percentile(your_val, avg, top)
        status = "above" if your_val >= avg * 1.1 else "below" if your_val < avg * 0.9 else "average"

        is_pct = "rate" in metric or "growth" in metric
        factor = 100 if is_pct else 1
        benchmarks.append(
            BenchmarkMetric(
                metric=metric,
                metric_label=METRIC_LABELS[metric],
                your_value=round(your_val * factor, 2),
                industry_avg=round(avg * factor, 2),
                industry_top=round(top * factor, 2),
                percentile=percentile,
                status=status,
            )
        )

    ai_data = await call_claude_market(industry, benchmarks, season_label)

    trends = []
    for trend in ai_data.get("trends", []):
        try:
            trends.append(MarketTrend(**trend))
        except Exception:
            continue

    insights = []
    for insight in ai_data.get("insights", []):
        try:
            insights.append(MarketInsight(**insight))
        except Exception:
            continue

    return MarketOverview(
        industry=industry,
        season=season,
        season_label=season_label,
        benchmarks=benchmarks,
        trends=trends,
        insights=insights,
        summary=ai_data.get("summary", ""),
    )


@router.get("/location", response_model=LocationData)
async def get_location_data(
    city: str = "Muenchen",
    industry: str = "ecommerce",
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Gibt simulierte Standortdaten zurueck - spaeter mit Google Maps API erweiterbar."""
    _ = industry
    city_data = {
        "muenchen": {"lat": 48.1351, "lng": 11.5820, "size": "Gross (1.5M+ Einwohner)", "comp": 12, "radius": 15},
        "berlin": {"lat": 52.5200, "lng": 13.4050, "size": "Gross (3.5M+ Einwohner)", "comp": 18, "radius": 20},
        "hamburg": {"lat": 53.5511, "lng": 9.9937, "size": "Gross (1.8M+ Einwohner)", "comp": 14, "radius": 18},
        "koeln": {"lat": 50.9333, "lng": 6.9500, "size": "Mittel (1M+ Einwohner)", "comp": 10, "radius": 12},
        "frankfurt": {"lat": 50.1109, "lng": 8.6821, "size": "Mittel (750k Einwohner)", "comp": 9, "radius": 12},
    }

    city_key = city.lower().strip()
    data = city_data.get(
        city_key,
        {"lat": 51.1657, "lng": 10.4515, "size": "Mittel", "comp": 8, "radius": 10},
    )

    return LocationData(
        city=city,
        region="Deutschland",
        country="DE",
        lat=data["lat"],
        lng=data["lng"],
        local_market_size=data["size"],
        competitors_nearby=data["comp"],
        catchment_radius_km=data["radius"],
    )


@router.get("/industries")
def get_industries(current_user: User = Depends(get_current_user)):
    return {
        "industries": [
            {"value": "ecommerce", "label": "E-Commerce"},
            {"value": "saas", "label": "SaaS / Software"},
            {"value": "retail", "label": "Einzelhandel"},
            {"value": "gastro", "label": "Gastronomie"},
            {"value": "manufacturing", "label": "Fertigung / Operations"},
            {"value": "finance", "label": "Finanzen / Banking"},
            {"value": "healthcare", "label": "Healthcare"},
            {"value": "public", "label": "Public Sector / Smart City"},
        ]
    }
