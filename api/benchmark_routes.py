"""
Branchenvergleich - eigene KPIs vs. Branchendurchschnitt.
KI kommentiert die Luecke und gibt konkrete Massnahmen.
"""
from datetime import date, timedelta
import json
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from models.daily_metrics import DailyMetrics
from security_config import is_configured_secret

router = APIRouter(prefix="/api/benchmarks", tags=["benchmarks"])


@router.get("")
def benchmark_overview(current_user: User = Depends(get_current_user)):
    """Simple overview endpoint so unauthenticated requests return 401 instead of 404."""
    return {"status": "ok", "datasets": ["industry", "size", "region"]}

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"


INDUSTRY_DATA = {
    "ecommerce": {
        "label": "E-Commerce",
        "metrics": {
            "conversion_rate": {"avg": 3.2, "top25": 5.5, "top10": 8.0, "unit": "%", "label": "Conversion Rate", "higher_is_better": True},
            "revenue_growth": {"avg": 12.0, "top25": 25.0, "top10": 40.0, "unit": "%", "label": "Umsatz-Wachstum", "higher_is_better": True},
            "traffic_growth": {"avg": 8.0, "top25": 18.0, "top10": 30.0, "unit": "%", "label": "Traffic-Wachstum", "higher_is_better": True},
            "new_customers_day": {"avg": 2.5, "top25": 5.0, "top10": 9.0, "unit": "", "label": "Neue Kunden/Tag", "higher_is_better": True},
            "avg_order_value": {"avg": 65.0, "top25": 95.0, "top10": 140.0, "unit": "EUR", "label": "Durchschnittlicher Bestellwert", "higher_is_better": True},
        },
    },
    "saas": {
        "label": "SaaS / Software",
        "metrics": {
            "conversion_rate": {"avg": 2.5, "top25": 4.5, "top10": 7.0, "unit": "%", "label": "Trial-Conversion", "higher_is_better": True},
            "revenue_growth": {"avg": 15.0, "top25": 30.0, "top10": 50.0, "unit": "%", "label": "MRR-Wachstum", "higher_is_better": True},
            "traffic_growth": {"avg": 10.0, "top25": 22.0, "top10": 38.0, "unit": "%", "label": "Traffic-Wachstum", "higher_is_better": True},
            "new_customers_day": {"avg": 1.8, "top25": 4.0, "top10": 7.5, "unit": "", "label": "Neue Kunden/Tag", "higher_is_better": True},
            "avg_order_value": {"avg": 120.0, "top25": 200.0, "top10": 350.0, "unit": "EUR", "label": "Durchschnittlicher MRR pro Kunde", "higher_is_better": True},
        },
    },
    "retail": {
        "label": "Einzelhandel",
        "metrics": {
            "conversion_rate": {"avg": 2.8, "top25": 5.0, "top10": 7.5, "unit": "%", "label": "Conversion Rate", "higher_is_better": True},
            "revenue_growth": {"avg": 8.0, "top25": 18.0, "top10": 30.0, "unit": "%", "label": "Umsatz-Wachstum", "higher_is_better": True},
            "traffic_growth": {"avg": 5.0, "top25": 12.0, "top10": 22.0, "unit": "%", "label": "Traffic-Wachstum", "higher_is_better": True},
            "new_customers_day": {"avg": 2.0, "top25": 4.5, "top10": 8.0, "unit": "", "label": "Neue Kunden/Tag", "higher_is_better": True},
            "avg_order_value": {"avg": 45.0, "top25": 75.0, "top10": 120.0, "unit": "EUR", "label": "Durchschnittlicher Bestellwert", "higher_is_better": True},
        },
    },
    "gastro": {
        "label": "Gastronomie",
        "metrics": {
            "conversion_rate": {"avg": 4.0, "top25": 7.0, "top10": 11.0, "unit": "%", "label": "Tisch-Conversion", "higher_is_better": True},
            "revenue_growth": {"avg": 7.0, "top25": 15.0, "top10": 25.0, "unit": "%", "label": "Umsatz-Wachstum", "higher_is_better": True},
            "traffic_growth": {"avg": 6.0, "top25": 14.0, "top10": 24.0, "unit": "%", "label": "Besucher-Wachstum", "higher_is_better": True},
            "new_customers_day": {"avg": 3.0, "top25": 6.0, "top10": 10.0, "unit": "", "label": "Neue Gaeste/Tag", "higher_is_better": True},
            "avg_order_value": {"avg": 28.0, "top25": 45.0, "top10": 70.0, "unit": "EUR", "label": "Durchschnittlicher Bon-Wert", "higher_is_better": True},
        },
    },
}


class BenchmarkResult(BaseModel):
    metric_key: str
    metric_label: str
    your_value: float
    industry_avg: float
    industry_top25: float
    industry_top10: float
    unit: str
    percentile: int
    gap_to_avg: float
    gap_to_top25: float
    status: str
    higher_is_better: bool
    ai_comment: str
    ai_action: str
    potential_impact_pct: float


class BenchmarkResponse(BaseModel):
    industry: str
    industry_label: str
    overall_percentile: int
    overall_status: str
    benchmarks: list[BenchmarkResult]
    ai_summary: str
    top_priority: str
    generated_by: str = "claude"


def get_your_metrics(db: Session) -> dict:
    today = date.today()
    since = today - timedelta(days=30)

    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )

    if not rows:
        return {}

    half = len(rows) // 2
    recent = rows[half:]
    older = rows[:half]

    avg_conv = sum(row.conversion_rate for row in rows) / len(rows)
    avg_revenue = sum(row.revenue for row in rows) / len(rows)
    avg_new_customers = sum(row.new_customers for row in rows) / len(rows)

    recent_rev = sum(row.revenue for row in recent) / len(recent) if recent else 0
    older_rev = sum(row.revenue for row in older) / len(older) if older else 1
    recent_traffic = sum(row.traffic for row in recent) / len(recent) if recent else 0
    older_traffic = sum(row.traffic for row in older) / len(older) if older else 1

    return {
        "conversion_rate": round(avg_conv * 100, 2),
        "revenue_growth": round((recent_rev - older_rev) / older_rev * 100, 2) if older_rev else 0,
        "traffic_growth": round((recent_traffic - older_traffic) / older_traffic * 100, 2) if older_traffic else 0,
        "new_customers_day": round(avg_new_customers, 2),
        "avg_order_value": round(avg_revenue, 2),
    }


def calc_percentile(your: float, avg: float, top25: float, top10: float, higher_is_better: bool) -> int:
    if not higher_is_better:
        your = -your
        avg = -avg
        top25 = -top25
        top10 = -top10

    if your >= top10:
        return 90
    if your >= top25:
        return int(75 + (your - top25) / max(top10 - top25, 0.01) * 15)
    if your >= avg:
        return int(50 + (your - avg) / max(top25 - avg, 0.01) * 25)
    if your >= avg * 0.5:
        return int(25 + (your - avg * 0.5) / max(avg * 0.5, 0.01) * 25)
    return max(5, int(your / max(avg * 0.5, 0.01) * 25))


def classify_status(your: float, avg: float, top25: float, higher_is_better: bool) -> str:
    if higher_is_better:
        if your >= top25:
            return "above_top25"
        if your >= avg:
            return "above_avg"
        if your >= avg * 0.7:
            return "below_avg"
        return "far_below"

    if your <= top25:
        return "above_top25"
    if your <= avg:
        return "above_avg"
    if your <= avg * 1.3:
        return "below_avg"
    return "far_below"


def _fallback_ai_data(benchmarks_data: list[dict]) -> dict:
    result = {}
    for benchmark in benchmarks_data:
        is_strong = benchmark["status"] in {"above_top25", "above_avg"}
        result[benchmark["metric_key"]] = {
            "comment": "Gut positioniert." if is_strong else "Hier besteht klares Verbesserungspotenzial.",
            "action": "Naechsten Optimierungsschritt priorisieren und Wirkung in 14 Tagen erneut messen.",
            "impact": 10.0,
        }
    result["summary"] = "KI-Analyse nicht verfuegbar - Fallback-Kommentare wurden erzeugt."
    result["top_priority"] = "Groesste Luecke zum Branchendurchschnitt zuerst schliessen."
    return result


async def get_ai_benchmark_comments(industry_label: str, your_metrics: dict, benchmarks_data: list[dict]) -> dict:
    del your_metrics
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return _fallback_ai_data(benchmarks_data)

    bench_text = "\n".join(
        f"- {benchmark['metric_label']}: dein Wert {benchmark['your_value']}{benchmark['unit']} vs. "
        f"Branche O {benchmark['industry_avg']}{benchmark['unit']} "
        f"(Top25: {benchmark['industry_top25']}{benchmark['unit']}, Perzentile: {benchmark['percentile']})"
        for benchmark in benchmarks_data
    )

    prompt = f"""Du analysierst ein {industry_label} Unternehmen im Branchenvergleich.

{bench_text}

Antworte NUR mit diesem JSON (kein Markdown):
{{
  "metrics": {{
    "conversion_rate":   {{"comment": "1 Satz was der Wert bedeutet", "action": "1 konkrete Massnahme", "impact": 15.0}},
    "revenue_growth":    {{"comment": "1 Satz", "action": "1 Massnahme", "impact": 12.0}},
    "traffic_growth":    {{"comment": "1 Satz", "action": "1 Massnahme", "impact": 10.0}},
    "new_customers_day": {{"comment": "1 Satz", "action": "1 Massnahme", "impact": 8.0}},
    "avg_order_value":   {{"comment": "1 Satz", "action": "1 Massnahme", "impact": 11.0}}
  }},
  "summary": "2-3 Saetze: Gesamtbild im Branchenvergleich",
  "top_priority": "1 Satz: wichtigste Massnahme die sofort den groessten Unterschied macht"
}}"""

    try:
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
                    "max_tokens": 800,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )

        if res.status_code != 200:
            return _fallback_ai_data(benchmarks_data)

        raw = res.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        return json.loads(raw.strip())
    except Exception:
        return _fallback_ai_data(benchmarks_data)


@router.get("/industries")
def get_industries(current_user: User = Depends(get_current_user)):
    return [{"value": key, "label": value["label"]} for key, value in INDUSTRY_DATA.items()]


@router.get("/analyze", response_model=BenchmarkResponse)
async def analyze_benchmark(industry: str = "ecommerce", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if industry not in INDUSTRY_DATA:
        raise HTTPException(status_code=400, detail=f"Branche muss eine von {list(INDUSTRY_DATA.keys())} sein.")

    industry_data = INDUSTRY_DATA[industry]
    your_metrics = get_your_metrics(db)

    benchmarks_raw = []
    for metric_key, benchmark in industry_data["metrics"].items():
        your_val = your_metrics.get(metric_key, 0.0)
        avg = benchmark["avg"]
        top25 = benchmark["top25"]
        top10 = benchmark["top10"]
        higher_is_better = benchmark["higher_is_better"]

        percentile = calc_percentile(your_val, avg, top25, top10, higher_is_better)
        status = classify_status(your_val, avg, top25, higher_is_better)

        benchmarks_raw.append(
            {
                "metric_key": metric_key,
                "metric_label": benchmark["label"],
                "your_value": round(your_val, 2),
                "industry_avg": avg,
                "industry_top25": top25,
                "industry_top10": top10,
                "unit": benchmark["unit"],
                "percentile": percentile,
                "gap_to_avg": round(your_val - avg, 2),
                "gap_to_top25": round(your_val - top25, 2),
                "status": status,
                "higher_is_better": higher_is_better,
            }
        )

    ai_data = await get_ai_benchmark_comments(industry_data["label"], your_metrics, benchmarks_raw)
    ai_metrics = ai_data.get("metrics", {}) if isinstance(ai_data, dict) else {}

    benchmarks = []
    for benchmark in benchmarks_raw:
        ai_metric = ai_metrics.get(benchmark["metric_key"], {}) if isinstance(ai_metrics, dict) else {}
        benchmarks.append(
            BenchmarkResult(
                **benchmark,
                ai_comment=ai_metric.get("comment", ""),
                ai_action=ai_metric.get("action", ""),
                potential_impact_pct=float(ai_metric.get("impact", 10.0)),
            )
        )

    overall_percentile = int(sum(item.percentile for item in benchmarks) / len(benchmarks)) if benchmarks else 0
    overall_status = (
        "Marktfuehrer" if overall_percentile >= 75 else
        "Ueberdurchschnittlich" if overall_percentile >= 50 else
        "Durchschnittlich" if overall_percentile >= 25 else
        "Aufholbedarf"
    )

    return BenchmarkResponse(
        industry=industry,
        industry_label=industry_data["label"],
        overall_percentile=overall_percentile,
        overall_status=overall_status,
        benchmarks=benchmarks,
        ai_summary=ai_data.get("summary", "") if isinstance(ai_data, dict) else "",
        top_priority=ai_data.get("top_priority", "") if isinstance(ai_data, dict) else "",
    )
