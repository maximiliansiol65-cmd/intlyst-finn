"""
Google Trends Integration - Suchvolumen-Trends fuer Keywords + Branche
"""

from datetime import date, timedelta
import json
import os

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from security_config import is_configured_secret
from api.auth_routes import User, get_current_user

router = APIRouter(prefix="/api/trends", tags=["trends"])

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"


class TrendPoint(BaseModel):
    date: str
    value: int


class KeywordTrend(BaseModel):
    keyword: str
    current_value: int
    avg_value: float
    trend: str
    change_pct: float
    peak_date: str
    data: list[TrendPoint]


class SeasonalityPoint(BaseModel):
    month: int
    month_label: str
    index: float
    label: str


class TrendsResponse(BaseModel):
    keywords: list[KeywordTrend]
    seasonality: list[SeasonalityPoint]
    industry: str
    summary: str
    best_months: list[str]
    worst_months: list[str]
    generated_by: str = "claude"


INDUSTRY_KEYWORDS = {
    "ecommerce": ["online shop", "online kaufen", "versandkostenfrei", "guenstig bestellen"],
    "saas": ["software vergleich", "CRM kostenlos", "projektmanagement tool", "SaaS"],
    "retail": ["einzelhandel", "ladengeschaeft", "lokal kaufen", "stadthandel"],
    "gastro": ["restaurant reservierung", "essen bestellen", "lieferservice", "take away"],
}

MONTH_LABELS = [
    "",
    "Januar",
    "Februar",
    "Maerz",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
]

SEASONALITY_DATA = {
    "ecommerce": [0.75, 0.72, 0.80, 0.85, 0.90, 0.88, 0.85, 0.88, 0.95, 1.05, 1.40, 1.60],
    "saas": [0.90, 0.95, 1.05, 1.10, 1.10, 1.05, 0.85, 0.80, 1.10, 1.15, 1.05, 0.85],
    "retail": [0.70, 0.68, 0.78, 0.85, 0.92, 0.90, 0.88, 0.90, 0.95, 1.00, 1.25, 1.50],
    "gastro": [0.75, 0.78, 0.88, 1.00, 1.15, 1.25, 1.35, 1.35, 1.10, 0.95, 0.90, 0.95],
}


def simulate_trend_data(keyword: str, industry: str, weeks: int = 12) -> list[TrendPoint]:
    """
    Simuliert Google Trends Daten.
    In Produktion: pytrends Bibliothek oder SerpAPI verwenden.
    """
    import hashlib

    _ = industry
    seed = int(hashlib.md5(keyword.encode()).hexdigest()[:8], 16)
    base = 30 + (seed % 40)
    points: list[TrendPoint] = []

    today = date.today()
    for i in range(weeks):
        day = today - timedelta(weeks=weeks - i - 1)
        noise = ((seed * (i + 1)) % 20) - 10
        growth = i * 0.5
        value = max(0, min(100, int(base + growth + noise)))
        points.append(TrendPoint(date=str(day), value=value))

    return points


def analyze_trend(data: list[TrendPoint]) -> tuple[str, float, str]:
    if not data:
        return "stable", 0.0, ""

    values = [p.value for p in data]
    half = len(values) // 2
    recent = sum(values[half:]) / len(values[half:])
    older = sum(values[:half]) / len(values[:half])

    change = round((recent - older) / older * 100, 1) if older else 0.0
    trend = "up" if change > 5 else "down" if change < -5 else "stable"

    peak_val = max(p.value for p in data)
    peak_date = next(p.date for p in data if p.value == peak_val)

    return trend, change, peak_date


async def call_claude_trends(
    industry: str,
    keywords: list[KeywordTrend],
    seasonality: list[SeasonalityPoint],
) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return {
            "summary": "API Key fehlt.",
            "best_months": [],
            "worst_months": [],
        }

    kw_text = "\n".join(
        f"- '{k.keyword}': aktuell {k.current_value}/100, Trend {k.trend} ({k.change_pct:+.1f}%)"
        for k in keywords
    )

    season_text = "\n".join(
        f"- {s.month_label}: Index {s.index:.2f} ({s.label})"
        for s in seasonality
    )

    prompt = f"""Analysiere Google Trends Daten fuer die Branche: {industry}

Keyword-Trends:
{kw_text}

Saisonalitaet (Index: 1.0 = normal, >1 = Hochsaison):
{season_text}

Antworte NUR mit diesem JSON (kein Markdown):
{{
  "summary": "2-3 Saetze: Was zeigen die Trends? Was bedeutet das fuer dieses Unternehmen jetzt?",
  "best_months": ["Maerz", "April"],
  "worst_months": ["Januar", "Februar"]
}}"""

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 400,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
    except Exception:
        return {"summary": "KI-Analyse nicht erreichbar (Offline-Mode).", "best_months": [], "worst_months": []}

    if res.status_code != 200:
        return {"summary": "KI-Analyse fehlgeschlagen.", "best_months": [], "worst_months": []}

    raw = res.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {"summary": "KI-Antwort konnte nicht geparst werden.", "best_months": [], "worst_months": []}


@router.get("", response_model=TrendsResponse)
async def get_trends(
    industry: str = Query("ecommerce", enum=["ecommerce", "saas", "retail", "gastro"]),
    weeks: int = Query(12, ge=4, le=52),
    current_user: User = Depends(get_current_user),
):
    keywords_raw = INDUSTRY_KEYWORDS.get(industry, INDUSTRY_KEYWORDS["ecommerce"])

    keyword_trends: list[KeywordTrend] = []
    for keyword in keywords_raw:
        data = simulate_trend_data(keyword, industry, weeks)
        trend, change, peak = analyze_trend(data)
        avg = round(sum(p.value for p in data) / len(data), 1)
        current = data[-1].value if data else 0

        keyword_trends.append(
            KeywordTrend(
                keyword=keyword,
                current_value=current,
                avg_value=avg,
                trend=trend,
                change_pct=change,
                peak_date=peak,
                data=data,
            )
        )

    season_raw = SEASONALITY_DATA.get(industry, SEASONALITY_DATA["ecommerce"])
    seasonality: list[SeasonalityPoint] = []
    for i, idx in enumerate(season_raw):
        month = i + 1
        label = (
            "Hochsaison"
            if idx >= 1.20
            else "Gute Saison"
            if idx >= 1.05
            else "Nebensaison"
            if idx < 0.85
            else "Normal"
        )
        seasonality.append(
            SeasonalityPoint(
                month=month,
                month_label=MONTH_LABELS[month],
                index=round(idx, 2),
                label=label,
            )
        )

    ai = await call_claude_trends(industry, keyword_trends, seasonality)

    return TrendsResponse(
        keywords=keyword_trends,
        seasonality=seasonality,
        industry=industry,
        summary=ai.get("summary", ""),
        best_months=ai.get("best_months", []),
        worst_months=ai.get("worst_months", []),
    )


@router.get("/keywords")
def get_industry_keywords(
    industry: str = Query("ecommerce", enum=["ecommerce", "saas", "retail", "gastro"]),
    current_user: User = Depends(get_current_user),
):
    return {
        "industry": industry,
        "keywords": INDUSTRY_KEYWORDS.get(industry, []),
    }
