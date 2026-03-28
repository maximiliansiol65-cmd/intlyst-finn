from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.daily_metrics import DailyMetrics
from services.external_signal_service import get_external_signals

CORE_METRICS = ["revenue", "traffic", "conversion_rate", "new_customers", "conversions"]

KPI_MAPPING = {
    "revenue": "Umsatz",
    "traffic": "Traffic",
    "conversion_rate": "Conversion",
    "new_customers": "Kunden",
    "conversions": "Bestellungen",
}


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


def _safe_pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0
    return ((current - previous) / previous) * 100.0


def _trend_label(change_pct: float) -> str:
    if change_pct > 0.5:
        return "up"
    if change_pct < -0.5:
        return "down"
    return "stable"


def get_rows(db: Session, workspace_id: int, days: int = 400) -> list[DailyMetrics]:
    since = date.today() - timedelta(days=max(7, min(days, 800)))
    return (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= since,
        )
        .order_by(DailyMetrics.date.asc())
        .all()
    )


def validate_rows(rows: list[DailyMetrics]) -> dict[str, Any]:
    if not rows:
        return {"quality_score": 0, "issues": ["no_rows"], "coverage_days": 0}
    issues: list[str] = []
    expected_days = max((rows[-1].date - rows[0].date).days + 1, 1)
    coverage = len(rows) / expected_days
    if coverage < 0.85:
        issues.append("missing_days")

    invalid = 0
    for row in rows:
        for metric in CORE_METRICS:
            value = _to_float(getattr(row, metric, 0.0))
            if metric in {"revenue", "traffic", "new_customers", "conversions"} and value < 0:
                invalid += 1
            if metric == "conversion_rate" and (value < 0 or value > 1.5):
                invalid += 1
    if invalid > 0:
        issues.append("invalid_values")

    score = 100
    score -= int(max(0, 1 - coverage) * 100 * 0.55)
    score -= min(35, invalid)
    score = max(0, min(100, score))
    return {"quality_score": score, "issues": issues, "coverage_days": expected_days}


def latest_kpi_snapshot(db: Session, workspace_id: int) -> dict[str, Any]:
    rows = get_rows(db, workspace_id=workspace_id, days=45)
    quality = validate_rows(rows)
    if not rows:
        return {"kpis": {}, "quality": quality, "generated_at": date.today().isoformat()}

    latest = rows[-1]
    prev = rows[-2] if len(rows) >= 2 else latest

    kpis = {}
    for metric in CORE_METRICS:
        current = _to_float(getattr(latest, metric, 0.0))
        previous = _to_float(getattr(prev, metric, 0.0))
        change = _safe_pct_change(current, previous)
        kpis[metric] = {
            "label": KPI_MAPPING.get(metric, metric),
            "current": round(current, 4),
            "previous": round(previous, 4),
            "change_pct": round(change, 2),
            "trend": _trend_label(change),
        }
    return {"kpis": kpis, "quality": quality, "generated_at": latest.date.isoformat()}


def historical_patterns(db: Session, workspace_id: int) -> dict[str, Any]:
    rows = get_rows(db, workspace_id=workspace_id, days=730)
    if len(rows) < 14:
        return {"seasonality": [], "long_trends": [], "message": "insufficient_history"}

    monthly: dict[str, list[float]] = {}
    weekday: dict[int, list[float]] = {}
    for row in rows:
        mkey = row.date.strftime("%Y-%m")
        monthly.setdefault(mkey, []).append(_to_float(row.revenue))
        wkey = row.date.weekday()
        weekday.setdefault(wkey, []).append(_to_float(row.revenue))

    long_trends = []
    sorted_months = sorted(monthly.keys())
    for mkey in sorted_months[-18:]:
        values = monthly[mkey]
        long_trends.append(
            {"period": mkey, "revenue_avg": round(sum(values) / max(len(values), 1), 2), "days": len(values)}
        )

    seasonality = []
    for wkey in sorted(weekday.keys()):
        values = weekday[wkey]
        seasonality.append({"weekday": wkey, "revenue_avg": round(sum(values) / max(len(values), 1), 2)})

    return {"seasonality": seasonality, "long_trends": long_trends, "message": "ok"}


def predictive_overview(db: Session, workspace_id: int, horizon_days: int = 14) -> dict[str, Any]:
    rows = get_rows(db, workspace_id=workspace_id, days=120)
    if len(rows) < 12:
        return {"status": "insufficient_data", "predictions": {}}

    horizon = max(7, min(horizon_days, 60))
    predictions: dict[str, Any] = {}
    for metric in CORE_METRICS:
        values = [_to_float(getattr(row, metric, 0.0)) for row in rows][-30:]
        if len(values) < 8:
            continue
        recent = sum(values[-7:]) / 7
        previous = sum(values[-14:-7]) / 7 if len(values) >= 14 else values[0]
        slope = (recent - previous) / max(7, 1)
        forecast = max(0.0, recent + slope * horizon)
        growth_pct = _safe_pct_change(forecast, recent)
        predictions[metric] = {
            "current_avg_7d": round(recent, 4),
            "forecast_avg": round(forecast, 4),
            "horizon_days": horizon,
            "expected_change_pct": round(growth_pct, 2),
            "risk": "high" if growth_pct <= -8 else "medium" if growth_pct < -3 else "low",
        }
    return {"status": "ok", "predictions": predictions}


def root_cause_analysis(db: Session, workspace_id: int) -> dict[str, Any]:
    snapshot = latest_kpi_snapshot(db, workspace_id=workspace_id)
    kpis = snapshot.get("kpis") or {}
    revenue_change = _to_float((kpis.get("revenue") or {}).get("change_pct"))
    traffic_change = _to_float((kpis.get("traffic") or {}).get("change_pct"))
    conversion_change = _to_float((kpis.get("conversion_rate") or {}).get("change_pct"))
    social_proxy_change = traffic_change

    candidates = [
        {"cause": "traffic", "score": abs(min(traffic_change, 0.0)) * 1.2, "evidence": f"Traffic {traffic_change:+.2f}%"},
        {
            "cause": "conversion",
            "score": abs(min(conversion_change, 0.0)) * 1.35,
            "evidence": f"Conversion {conversion_change:+.2f}%",
        },
        {
            "cause": "social_media",
            "score": abs(min(social_proxy_change, 0.0)) * 0.9,
            "evidence": f"Social Proxy {social_proxy_change:+.2f}%",
        },
        {"cause": "revenue_direct", "score": abs(min(revenue_change, 0.0)), "evidence": f"Revenue {revenue_change:+.2f}%"},
    ]
    candidates.sort(key=lambda item: item["score"], reverse=True)
    top = candidates[0] if candidates else {"cause": "unknown", "score": 0.0, "evidence": ""}

    return {
        "status": "ok",
        "primary_cause": top["cause"],
        "confidence_pct": round(min(92.0, max(45.0, top["score"] * 3.5)), 1),
        "links": {
            "revenue_change_pct": round(revenue_change, 2),
            "traffic_change_pct": round(traffic_change, 2),
            "conversion_change_pct": round(conversion_change, 2),
        },
        "evidence": [item["evidence"] for item in candidates[:3]],
    }


def deep_insight_report(db: Session, workspace_id: int, industry: str = "ecommerce") -> dict[str, Any]:
    snapshot = latest_kpi_snapshot(db, workspace_id=workspace_id)
    patterns = historical_patterns(db, workspace_id=workspace_id)
    prediction = predictive_overview(db, workspace_id=workspace_id, horizon_days=14)
    root_cause = root_cause_analysis(db, workspace_id=workspace_id)
    external = get_external_signals(industry)

    insights = []
    pred_revenue = ((prediction.get("predictions") or {}).get("revenue") or {}).get("expected_change_pct")
    if pred_revenue is not None and pred_revenue <= -8:
        insights.append(
            {
                "type": "warning",
                "title": "Umsatz-Risiko in den nächsten 14 Tagen",
                "description": f"Modell erwartet {pred_revenue:+.1f}% Veränderung. Frühzeitige Gegenmaßnahmen einplanen.",
            }
        )
    if root_cause.get("primary_cause") == "traffic":
        insights.append(
            {
                "type": "action",
                "title": "Traffic ist wahrscheinlich Haupttreiber",
                "description": "Kampagnen und Content-Frequenz kurzfristig erhöhen; Landingpage prüfen.",
            }
        )
    if not insights:
        insights.append(
            {
                "type": "info",
                "title": "KPIs aktuell stabil",
                "description": "Keine kritischen Frühwarnsignale erkannt. Fokus auf inkrementelle Optimierung.",
            }
        )

    return {
        "status": "ok",
        "realtime_snapshot": snapshot,
        "external_signals": external[:6],
        "historical_patterns": patterns,
        "predictive": prediction,
        "root_cause": root_cause,
        "insights": insights,
    }
