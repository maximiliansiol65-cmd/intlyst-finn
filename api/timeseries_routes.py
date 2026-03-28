from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc
from sqlalchemy.orm import Session

from database import get_db
from models.daily_metrics import DailyMetrics
from api.auth_routes import User, get_current_user

router = APIRouter(prefix="/api/timeseries", tags=["timeseries"])


def moving_average(values: list[float], window: int = 7) -> list[Optional[float]]:
    result: list[Optional[float]] = []
    for i in range(len(values)):
        if i < window - 1:
            result.append(None)
        else:
            window_vals = values[i - window + 1 : i + 1]
            result.append(round(sum(window_vals) / window, 4))
    return result


def to_float(value, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def calculate_trend(values: list[float]) -> str:
    if len(values) < 14:
        return "stable"
    first_half = sum(values[:7]) / 7
    last_half = sum(values[-7:]) / 7
    if first_half == 0:
        return "stable"
    change = (last_half - first_half) / first_half
    if change > 0.03:
        return "up"
    if change < -0.03:
        return "down"
    return "stable"


def get_metric_value(row: DailyMetrics, metric: str) -> float:
    mapping = {
        "revenue": to_float(getattr(row, "revenue", 0.0)),
        "traffic": to_float(getattr(row, "traffic", 0)),
        "conversions": to_float(getattr(row, "conversions", 0)),
        "conversion_rate": to_float(getattr(row, "conversion_rate", 0.0)),
        "new_customers": to_float(getattr(row, "new_customers", 0)),
    }
    return mapping.get(metric, 0.0)


@router.get("")
def get_timeseries(
    period: Literal["daily", "weekly"] = Query("daily"),
    days: int = Query(30, ge=1, le=90),
    metric: Literal[
        "revenue", "traffic", "conversions", "conversion_rate", "new_customers", "all"
    ] = Query("revenue"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_date = date.today() - timedelta(days=days)

    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == period, DailyMetrics.date >= start_date)
        .order_by(asc(DailyMetrics.date))
        .all()
    )

    if not rows:
        raise HTTPException(status_code=404, detail="Keine Daten verfuegbar.")

    metrics_to_return = (
        ["revenue", "traffic", "conversions", "conversion_rate", "new_customers"]
        if metric == "all"
        else [metric]
    )

    result = {}

    for current_metric in metrics_to_return:
        values = [get_metric_value(row, current_metric) for row in rows]
        ma7 = moving_average(values, window=7)
        data_points = []

        for index, row in enumerate(rows):
            prev = values[index - 1] if index > 0 else values[index]
            change_pct = round((values[index] - prev) / prev * 100, 2) if prev != 0 else 0.0
            data_points.append(
                {
                    "date": str(row.date),
                    "value": round(values[index], 4),
                    "change_pct": change_pct,
                    "ma7": ma7[index],
                }
            )

        total = round(sum(values), 2)
        avg = round(total / len(values), 2) if values else 0.0
        trend = calculate_trend(values)
        first_val = values[0] if values[0] != 0 else 1
        growth_pct = round((values[-1] - values[0]) / first_val * 100, 2)
        min_val = round(min(values), 4) if values else 0.0
        max_val = round(max(values), 4) if values else 0.0

        result[current_metric] = {
            "data": data_points,
            "summary": {
                "total": total,
                "avg": avg,
                "trend": trend,
                "growth_pct": growth_pct,
                "min": min_val,
                "max": max_val,
            },
        }

    return {
        "period": period,
        "days": days,
        "metric": metric,
        **(result[metric] if metric != "all" else result),
    }


@router.get("/compare", summary="Periodenvergleich: aktuelle vs. vorherige Periode")
def compare_periods(
    period: Literal["daily", "weekly"] = Query("daily"),
    days: int = Query(30, ge=7, le=90),
    metric: Literal[
        "revenue", "traffic", "conversions", "conversion_rate", "new_customers"
    ] = Query("revenue"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vergleicht aktuelle Periode mit der gleich langen vorherigen Periode."""
    today = date.today()
    current_start = today - timedelta(days=days)
    previous_start = current_start - timedelta(days=days)

    current_rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == period, DailyMetrics.date >= current_start)
        .order_by(asc(DailyMetrics.date))
        .all()
    )
    previous_rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.period == period,
            DailyMetrics.date >= previous_start,
            DailyMetrics.date < current_start,
        )
        .order_by(asc(DailyMetrics.date))
        .all()
    )

    def _summarize(rows):
        vals = [get_metric_value(r, metric) for r in rows]
        if not vals:
            return {"total": 0.0, "avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}
        return {
            "total": round(sum(vals), 2),
            "avg":   round(sum(vals) / len(vals), 4),
            "min":   round(min(vals), 4),
            "max":   round(max(vals), 4),
            "count": len(vals),
        }

    curr = _summarize(current_rows)
    prev = _summarize(previous_rows)

    delta_total = round(curr["total"] - prev["total"], 2)
    delta_pct   = (
        round(delta_total / prev["total"] * 100, 2) if prev["total"] else 0.0
    )

    trend = "up" if delta_pct > 3 else ("down" if delta_pct < -3 else "stable")

    return {
        "metric": metric,
        "days": days,
        "current_period": {"start": str(current_start), "end": str(today), **curr},
        "previous_period": {"start": str(previous_start), "end": str(current_start), **prev},
        "delta": {"absolute": delta_total, "pct": delta_pct, "trend": trend},
    }
