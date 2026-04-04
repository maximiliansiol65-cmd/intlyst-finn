"""
priority_service.py
Computes a priority score (critical/high/medium/low) for tasks, insights, goals, and forecasts.
Based on: KPI deviation, business impact, urgency, risk, goal alignment, and resource need.
"""
from __future__ import annotations

import logging
from typing import Literal

logger = logging.getLogger(__name__)

Priority = Literal["critical", "high", "medium", "low"]

# Score ranges → priority
_THRESHOLDS: list[tuple[float, Priority]] = [
    (80.0, "critical"),
    (55.0, "high"),
    (30.0, "medium"),
    (0.0,  "low"),
]


def score_to_priority(score: float) -> Priority:
    for threshold, label in _THRESHOLDS:
        if score >= threshold:
            return label
    return "low"


def compute_priority(
    kpi_deviation_pct: float = 0.0,      # % deviation from target (0–100+)
    business_impact_score: float = 50.0, # 0–100 (from Claude / analysis)
    urgency_days: int | None = None,     # Days until deadline (None = no deadline)
    risk_score: float = 0.0,             # 0–100
    has_goal_link: bool = False,         # Is linked to an active goal?
    resource_requirement: str = "low",   # low|medium|high
) -> Priority:
    """
    Combines multiple signals into a single priority label.
    Returns: critical | high | medium | low
    """
    score = 0.0

    # KPI deviation (max 30 points)
    kpi_points = min(kpi_deviation_pct, 100) * 0.30
    score += kpi_points

    # Business impact (max 25 points)
    score += business_impact_score * 0.25

    # Urgency (max 20 points)
    if urgency_days is not None:
        if urgency_days <= 1:
            score += 20.0
        elif urgency_days <= 3:
            score += 15.0
        elif urgency_days <= 7:
            score += 10.0
        elif urgency_days <= 14:
            score += 5.0

    # Risk (max 15 points)
    score += risk_score * 0.15

    # Goal link bonus (max 5 points)
    if has_goal_link:
        score += 5.0

    # Resource requirement penalty (subtracts from score – low resource = easier to act)
    resource_penalty = {"high": 0.0, "medium": 2.0, "low": 5.0}
    score += resource_penalty.get(resource_requirement, 0.0)

    return score_to_priority(score)


def compute_insight_priority(
    confidence_score: float,
    impact_score: float,
    kpi_deviation_pct: float = 0.0,
) -> Priority:
    combined = impact_score * 0.6 + kpi_deviation_pct * 0.25 + confidence_score * 0.15
    return score_to_priority(combined)


def compute_goal_priority(
    progress_pct: float,
    days_remaining: int | None,
    target_value: float,
    current_value: float,
) -> Priority:
    if target_value <= 0:
        return "low"
    gap_pct = max(0, (target_value - (current_value or 0)) / target_value * 100)
    score = gap_pct * 0.5
    if days_remaining is not None:
        if days_remaining <= 3:
            score += 40
        elif days_remaining <= 7:
            score += 25
        elif days_remaining <= 30:
            score += 10
    return score_to_priority(score)


# ── DB-driven task priority (Phase 8: KPI + Goal + Forecast + Outcome) ────────

def compute_task_priority_from_db(
    db: "Session",
    workspace_id: int,
    task: "Task",
) -> tuple[float, Priority, str]:
    """
    Full DB-driven priority for a task. Returns (score, priority_label, reason).

    Weights:
      kpi_deviation  40% — how far linked KPIs are from target
      goal_risk      25% — linked goals that are at_risk or behind
      forecast_risk  20% — worst-case scenario deviation
      outcome        10% — historical feedback on linked insight
      deadline        5% — due_date proximity
    """
    import json
    from datetime import date as _date
    from sqlalchemy import func as _func
    from models.kpi_data_point import KPIDataPoint
    from models.goals import Goal
    from models.forecast_record import ForecastRecord
    from models.junction_tables import TaskGoal

    # ── KPI deviation ────────────────────────────────────────────────────────
    kpi_score = 0.0
    kpi_ids: list[int] = []
    kpi_names: set[str] = set()

    def _normalize_kpi_ref(value: object) -> tuple[int | None, str | None]:
        raw = str(value or "").strip()
        if not raw:
            return None, None
        if raw.isdigit():
            return int(raw), None
        normalized = raw.lower().replace("-", "_").replace(" ", "_")
        return None, normalized

    def _collect_kpi_refs(values: list[object]) -> None:
        for value in values:
            kpi_id, kpi_name = _normalize_kpi_ref(value)
            if kpi_id is not None:
                kpi_ids.append(kpi_id)
            if kpi_name:
                kpi_names.add(kpi_name)

    if getattr(task, "kpis_json", None):
        try:
            raw_kpis = json.loads(task.kpis_json)
            if isinstance(raw_kpis, list):
                _collect_kpi_refs(raw_kpis)
        except Exception:
            pass
    if getattr(task, "linked_insight_id", None):
        try:
            from models.insight import Insight
            ins = db.query(Insight).filter(
                Insight.workspace_id == workspace_id,
                Insight.id == task.linked_insight_id,
            ).first()
            if ins and ins.affected_kpi_ids:
                raw_kpis = json.loads(ins.affected_kpi_ids)
                if isinstance(raw_kpis, list):
                    _collect_kpi_refs(raw_kpis)
        except Exception:
            pass

    deviations: list[float] = []
    if kpi_ids:
        latest_ids = (
            db.query(_func.max(KPIDataPoint.id))
            .filter(KPIDataPoint.workspace_id == workspace_id, KPIDataPoint.kpi_id.in_(kpi_ids))
            .group_by(KPIDataPoint.kpi_id)
            .subquery()
        )
        pts = db.query(KPIDataPoint).filter(KPIDataPoint.id.in_(latest_ids)).all()
        for p in pts:
            if p.trend_direction == "down" and p.change_pct is not None:
                deviations.append(min(100.0, abs(p.change_pct) * 2))
            elif p.trend_direction == "up":
                deviations.append(5.0)
            else:
                deviations.append(20.0)

    if kpi_names:
        named_points = (
            db.query(KPIDataPoint)
            .filter(
                KPIDataPoint.workspace_id == workspace_id,
                _func.lower(KPIDataPoint.kpi_name).in_(list(kpi_names)),
            )
            .order_by(KPIDataPoint.recorded_at.desc(), KPIDataPoint.id.desc())
            .all()
        )
        seen_names: set[str] = set()
        for point in named_points:
            normalized_name = str(point.kpi_name or "").strip().lower().replace("-", "_").replace(" ", "_")
            if not normalized_name or normalized_name in seen_names:
                continue
            seen_names.add(normalized_name)
            if point.trend_direction == "down" and point.change_pct is not None:
                deviations.append(min(100.0, abs(point.change_pct) * 2))
            elif point.trend_direction == "up":
                deviations.append(5.0)
            else:
                deviations.append(20.0)

        # Built-in KPI fallback: tasks often store semantic metric keys like "revenue"
        # before a numeric KPIDataPoint relation exists. Use DailyMetrics so the score still
        # reflects real business pressure instead of dropping to a neutral default.
        from models.daily_metrics import DailyMetrics

        builtin_fields = {
            "revenue": "revenue",
            "traffic": "traffic",
            "conversions": "conversions",
            "conversion_rate": "conversion_rate",
            "new_customers": "new_customers",
            "profit": "profit",
            "cashflow": "cashflow",
            "cost": "cost",
            "gross_margin": "gross_margin",
            "liquidity": "liquidity",
        }
        metric_rows = (
            db.query(DailyMetrics)
            .filter(
                DailyMetrics.workspace_id == workspace_id,
                DailyMetrics.period == "daily",
            )
            .order_by(DailyMetrics.date.asc())
            .limit(45)
            .all()
        )
        if metric_rows:
            recent_rows = metric_rows[-14:]
            previous_rows = metric_rows[-28:-14]
            for metric_name in kpi_names:
                if len(previous_rows) < 3:
                    continue
                field_name = builtin_fields.get(metric_name)
                if not field_name:
                    continue
                recent_values = [float(getattr(row, field_name, 0.0) or 0.0) for row in recent_rows]
                previous_values = [float(getattr(row, field_name, 0.0) or 0.0) for row in previous_rows]
                current = sum(recent_values) / len(recent_values) if recent_values else 0.0
                baseline = sum(previous_values) / len(previous_values) if previous_values else 0.0
                if baseline <= 0:
                    continue
                delta_pct = ((current - baseline) / baseline) * 100
                if delta_pct < 0:
                    deviations.append(min(100.0, abs(delta_pct) * 2))
                elif delta_pct > 0:
                    deviations.append(5.0)
                else:
                    deviations.append(20.0)

    if deviations:
        kpi_score = sum(deviations) / len(deviations)

    # ── Goal risk ────────────────────────────────────────────────────────────
    goal_score = 0.0
    goal_ids = [
        r.goal_id for r in db.query(TaskGoal.goal_id).filter(
            TaskGoal.workspace_id == workspace_id,
            TaskGoal.task_id == task.id,
        ).all()
    ]
    if goal_ids:
        goals = db.query(Goal).filter(Goal.workspace_id == workspace_id, Goal.id.in_(goal_ids)).all()
        STATUS_RISK = {"behind": 90.0, "at_risk": 70.0, "paused": 30.0, "on_track": 10.0, "achieved": 0.0}
        risks = [STATUS_RISK.get(g.status or "on_track", 20.0) for g in goals]
        base = max(risks) if risks else 0.0
        has_crit = any(g.priority == "critical" and (g.status or "") in ("behind", "at_risk") for g in goals)
        goal_score = min(100.0, base * 1.2 if has_crit else base)

    # ── Forecast risk ────────────────────────────────────────────────────────
    forecast_score = 0.0
    if getattr(task, "linked_scenario_id", None):
        forecast = (
            db.query(ForecastRecord)
            .filter(
                ForecastRecord.workspace_id == workspace_id,
                ForecastRecord.worst_case.isnot(None),
                ForecastRecord.baseline_value.isnot(None),
            )
            .order_by(ForecastRecord.generated_at.desc())
            .first()
        )
        if forecast and forecast.baseline_value and forecast.baseline_value != 0:
            dev = (forecast.baseline_value - (forecast.worst_case or 0)) / abs(forecast.baseline_value)
            forecast_score = min(100.0, max(0.0, dev * 200))

    # ── Outcome (historical feedback) ────────────────────────────────────────
    outcome_score = 50.0  # neutral fallback
    if getattr(task, "linked_insight_id", None):
        try:
            from models.insight import Insight
            ins = db.query(Insight).filter(
                Insight.workspace_id == workspace_id,
                Insight.id == task.linked_insight_id,
            ).first()
            if ins and ins.feedback_rating is not None:
                outcome_score = (ins.feedback_rating / 5) * 100
        except Exception:
            pass

    # ── Deadline ─────────────────────────────────────────────────────────────
    dl_score = 20.0
    due = getattr(task, "due_date", None)
    if due:
        days_left = (due - _date.today()).days
        dl_score = (100.0 if days_left < 0 else 90.0 if days_left == 0
                    else 75.0 if days_left <= 2 else 50.0 if days_left <= 7
                    else 30.0 if days_left <= 14 else 10.0)

    manual_priority_bonus = {"high": 12.0, "medium": 6.0, "low": 0.0}.get(getattr(task, "priority", "medium"), 0.0)
    status_bonus = 4.0 if getattr(task, "status", "open") == "in_progress" else 0.0

    total = round(
        kpi_score * 0.40
        + goal_score * 0.25
        + forecast_score * 0.20
        + outcome_score * 0.10
        + dl_score * 0.05
        + manual_priority_bonus
        + status_bonus,
        1,
    )

    drivers = []
    if kpi_score >= 45:
        drivers.append(f"KPI-Abweichung {kpi_score:.0f}pt")
    if goal_score >= 60:
        drivers.append(f"Ziel gefährdet {goal_score:.0f}pt")
    if forecast_score >= 60:
        drivers.append(f"Prognose-Risiko {forecast_score:.0f}pt")
    if manual_priority_bonus >= 10:
        drivers.append("manuell hoch priorisiert")
    if dl_score >= 75:
        drivers.append("Deadline überschritten/morgen")
    reason = " · ".join(drivers) if drivers else "Standardpriorisierung"

    return total, score_to_priority(total), reason
