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
