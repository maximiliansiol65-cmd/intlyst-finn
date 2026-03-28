from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional
from datetime import timedelta, date

from sqlalchemy.orm import Session

from models.daily_metrics import DailyMetrics
from services.analysis_service import pct_change
from services.enterprise_ai_service import _safe_aggregate_data


@dataclass
class ChangeItem:
    metric: str
    label: str
    current_value: float
    previous_value: float
    delta_abs: float
    delta_pct: float
    direction: str
    severity: str
    period: str
    sparkline: list[float]
    insight: str
    source: str = "internal"
    confidence: int = 70

    def to_dict(self) -> dict[str, Any]:
        return {
            "metric": self.metric,
            "label": self.label,
            "current_value": self.current_value,
            "previous_value": self.previous_value,
            "delta_abs": self.delta_abs,
            "delta_pct": self.delta_pct,
            "direction": self.direction,
            "severity": self.severity,
            "period": self.period,
            "sparkline": self.sparkline,
            "insight": self.insight,
            "source": self.source,
            "confidence": self.confidence,
            "impact_score": self.impact_score(),
        }

    def impact_score(self) -> int:
        base = min(100, int(abs(self.delta_pct)))
        if self.severity == "high":
            base += 12
        elif self.severity == "medium":
            base += 6
        return min(100, base)


def _fetch_series(db: Session, field: str, days: int) -> list[tuple[date, float]]:
    """Pulls last 2*days values for a metric."""
    rows = (
        db.query(DailyMetrics.date, getattr(DailyMetrics, field))
        .filter(DailyMetrics.period == "daily")
        .order_by(DailyMetrics.date.desc())
        .limit(days * 2)
        .all()
    )
    # keep chronological order
    return list(reversed([(r[0], float(r[1] or 0)) for r in rows]))


def _window_avg(series: list[tuple[date, float]], days: int, recent: bool) -> float:
    if not series:
        return 0.0
    if recent:
        values = [val for _, val in series[-days:]]
    else:
        values = [val for _, val in series[-2 * days:-days]]
    if not values:
        return 0.0
    return sum(values) / len(values)


def _severity(delta_pct: float) -> str:
    abs_val = abs(delta_pct)
    if abs_val >= 30:
        return "high"
    if abs_val >= 12:
        return "medium"
    return "low"


def _direction(delta_pct: float) -> str:
    if delta_pct > 1e-3:
        return "up"
    if delta_pct < -1e-3:
        return "down"
    return "flat"


def _social_engagement(db: Session) -> float:
    """Average engagement from aggregated social data."""
    aggregated = _safe_aggregate_data(db, 30)
    if aggregated and getattr(aggregated, "instagram", None):
        return float(getattr(aggregated.instagram, "avg_engagement_rate_pct", 0.0) or 0.0)
    if aggregated and getattr(aggregated, "tiktok", None):
        return float(getattr(aggregated.tiktok, "avg_completion_rate_pct", 0.0) or 0.0)
    return 0.0


def detect_changes(db: Session, days: int = 7) -> List[dict[str, Any]]:
    """Compute period-over-period changes for core KPIs."""
    metrics = [
        ("revenue", "Umsatz"),
        ("new_customers", "Kundenanzahl"),
        ("traffic", "Traffic"),
        ("conversion_rate", "Conversion Rate"),
    ]

    changes: list[ChangeItem] = []

    for field, label in metrics:
        series = _fetch_series(db, field, days)
        curr = _window_avg(series, days, recent=True)
        prev = _window_avg(series, days, recent=False)
        delta_pct = round(pct_change(curr, prev), 2)
        delta_abs = round(curr - prev, 2)
        item = ChangeItem(
            metric=field,
            label=label,
            current_value=round(curr, 2),
            previous_value=round(prev, 2),
            delta_abs=delta_abs,
            delta_pct=delta_pct,
            direction=_direction(delta_pct),
            severity=_severity(delta_pct),
            period=f"letzte {days} Tage vs. davor",
            sparkline=[v for _, v in series[-days:]],
            insight=f"{label}: {delta_pct:+.2f}% gegenueber Vorperiode.",
        )
        changes.append(item)

    # Social engagement as separate metric (fallback to aggregated social data)
    social_current = _social_engagement(db)
    if social_current is not None:
        prev = 0.0  # if no history available
        delta_pct = round(pct_change(social_current, prev), 2) if prev else 0.0
        item = ChangeItem(
            metric="social_engagement",
            label="Social Engagement",
            current_value=round(social_current, 2),
            previous_value=round(prev, 2),
            delta_abs=round(social_current - prev, 2),
            delta_pct=delta_pct,
            direction=_direction(delta_pct),
            severity=_severity(delta_pct),
            period=f"letzte {days} Tage vs. davor",
            sparkline=[],
            insight="Social Engagement aktueller Durchschnitt (letzte 30 Tage).",
            source="social",
            confidence=60,
        )
        changes.append(item)

    # Prioritize by impact score descending
    return [c.to_dict() for c in sorted(changes, key=lambda x: x.impact_score(), reverse=True)]
