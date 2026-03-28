from __future__ import annotations

import math
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Sequence

import numpy as np
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from models.action_request import ActionRequest
from models.daily_metrics import DailyMetrics
from models.recommendation_outcome import RecommendationOutcome
from models.recommendation_policy import RecommendationPolicy

# Standard-Arme die immer existieren sollen
DEFAULT_ARMS = ["marketing", "sales", "product", "retention", "social", "operations"]


# ── Utilities ────────────────────────────────────────────────────────────────
def _clamp(value: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, value))


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value or 0.0)
    except Exception:
        return default


# ── Policy (Bandit-ähnliche Gewichtung) ──────────────────────────────────────
def _arm_weight(avg_reward: float, acceptance_rate: float, volume: int) -> float:
    """
    Berechnet einen stabilen Multiplikator für eine Empfehlungs-Kategorie.
    - avg_reward: Ø realer Impact in %
    - acceptance_rate: Quote implementierter Outcomes
    - volume: Beobachtete Anzahl
    """
    base = 1.0
    base += _clamp(avg_reward / 30.0, -0.3, 0.8)
    base += _clamp((acceptance_rate - 0.5) * 0.8, -0.4, 0.4)
    base += _clamp(math.log1p(volume) * 0.05, 0.0, 0.35)
    return _clamp(base, 0.55, 1.75)


def rebuild_policies(db: Session, workspace_id: int | None = None) -> list[RecommendationPolicy]:
    """
    Aggregiert alle RecommendationOutcomes und schreibt deterministische Policy-Gewichte.
    Kann gefahrlos regelmäßig (Cron) ausgeführt werden.
    """
    # Aggregation nach Kategorie
    agg_rows = (
        db.query(
            RecommendationOutcome.category.label("cat"),
            func.count(RecommendationOutcome.id).label("cnt"),
            func.sum(case((RecommendationOutcome.actual_impact_pct.isnot(None), 1), else_=0)).label("completed"),
            func.avg(func.nullif(RecommendationOutcome.actual_impact_pct, 0)).label("avg_actual"),
            func.max(RecommendationOutcome.updated_at).label("last_ts"),
        )
        .group_by(RecommendationOutcome.category)
        .all()
    )

    policies: list[RecommendationPolicy] = []
    existing = {
        (row.workspace_id, row.arm): row
        for row in db.query(RecommendationPolicy).all()
    }

    # Baue Menge aller Arme
    arms = set(DEFAULT_ARMS)
    arms.update(row[0] for row in agg_rows if row[0])

    for arm in arms:
        key = (workspace_id or 1, arm)
        policy = existing.get(key)
        if not policy:
            policy = RecommendationPolicy(workspace_id=workspace_id or 1, arm=arm)
            db.add(policy)
            db.flush()

        stats = next((row for row in agg_rows if row.cat == arm), None)
        shown = int(stats.cnt) if stats else 0
        completed = int(stats.completed) if stats else 0
        avg_actual = _safe_float(stats.avg_actual) if stats else 0.0
        acceptance_rate = (completed / shown) if shown else 0.0

        policy.shown_count = shown
        policy.completed_count = completed
        policy.accepted_count = completed  # aktuell kein feineres Feedback vorhanden
        policy.avg_reward = round(avg_actual, 3)
        policy.reward_sum = round(avg_actual * max(completed, 1), 3)
        policy.last_outcome_at = stats.last_ts if stats else None
        policy.weight = round(_arm_weight(avg_actual, acceptance_rate, shown), 3)
        policies.append(policy)

    db.commit()
    return policies


def record_feedback(
    db: Session,
    *,
    arm: str,
    reward: float,
    workspace_id: int | None = None,
    outcome_timestamp: datetime | None = None,
) -> RecommendationPolicy:
    """
    Leichtgewichtiger Online-Update: passt Gewicht auf Basis eines Rewards an.
    Wird z.B. beim Aktualisieren eines Outcomes aufgerufen.
    """
    workspace = workspace_id or 1
    policy = (
        db.query(RecommendationPolicy)
        .filter(RecommendationPolicy.workspace_id == workspace, RecommendationPolicy.arm == arm)
        .first()
    )
    if not policy:
        policy = RecommendationPolicy(workspace_id=workspace, arm=arm)
        db.add(policy)
        db.flush()

    alpha = 0.25  # starker Lernfaktor für frühe Samples
    policy.last_reward = reward
    policy.avg_reward = round((1 - alpha) * policy.avg_reward + alpha * reward, 4)
    policy.reward_sum = round(policy.reward_sum + reward, 3)
    policy.completed_count += 1
    policy.shown_count = max(policy.shown_count, policy.completed_count)
    policy.weight = round(_arm_weight(policy.avg_reward, policy.completed_count / max(policy.shown_count, 1), policy.shown_count), 3)
    policy.last_outcome_at = outcome_timestamp or datetime.utcnow()
    db.commit()
    db.refresh(policy)
    return policy


def policy_lookup(db: Session) -> dict[str, RecommendationPolicy]:
    rows = db.query(RecommendationPolicy).all()
    return {row.arm: row for row in rows}


# ── Signale aus historischen Daten ───────────────────────────────────────────
def _linear_slope(values: Sequence[float]) -> float:
    if len(values) < 6:
        return 0.0
    x = np.arange(len(values))
    y = np.array(values, dtype=float)
    slope = np.polyfit(x, y, 1)[0]
    mean_y = float(np.mean(y)) or 1.0
    return float((slope / mean_y) * 100)  # Prozent pro Schritt


def _lag_correlation(values: Sequence[float], lag: int = 7) -> float:
    if len(values) <= lag:
        return 0.0
    a = np.array(values[:-lag])
    b = np.array(values[lag:])
    if a.std() == 0 or b.std() == 0:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def collect_metric_signals(db: Session, days: int = 56) -> dict[str, Any]:
    """Analysiert Zeitreihen für Muster, Drift und Saisonalität."""
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )
    if not rows:
        return {"status": "empty", "signals": []}

    metrics = {
        "revenue": [float(r.revenue or 0) for r in rows],
        "traffic": [float(r.traffic or 0) for r in rows],
        "conversion_rate": [float(r.conversion_rate or 0) * 100 for r in rows],
        "new_customers": [float(r.new_customers or 0) for r in rows],
    }

    signals: list[dict[str, Any]] = []

    for name, series in metrics.items():
        if len(series) < 7:
            continue
        slope_pct = _linear_slope(series[-28:])  # letzter Monat
        trend_4w = (series[-1] - series[max(-8, -len(series))]) / (series[max(-8, -len(series))] or 1) * 100 if len(series) >= 8 else 0
        season_corr = _lag_correlation(series, lag=7)

        if slope_pct < -0.6:
            signals.append({
                "metric": name,
                "type": "subtle_decline",
                "severity": "medium" if slope_pct > -1.5 else "high",
                "detail": f"Leicht fallender Trend (-{abs(slope_pct):.2f}% pro Tag) über 4 Wochen.",
                "evidence": {"slope_pct_per_day": round(slope_pct, 3), "trend_4w_pct": round(trend_4w, 2)},
            })
        if season_corr > 0.35:
            signals.append({
                "metric": name,
                "type": "seasonality",
                "severity": "low",
                "detail": "Wöchentliche Saisonalität erkannt (lag-7 Korrelation).",
                "evidence": {"lag7_corr": round(season_corr, 3)},
            })
        if trend_4w > 8:
            signals.append({
                "metric": name,
                "type": "positive_momentum",
                "severity": "info",
                "detail": f"Aufwärtstrend erkannt (+{trend_4w:.1f}% in 4 Wochen).",
                "evidence": {"trend_4w_pct": round(trend_4w, 2)},
            })

    # Risikoabschätzung: Umsatz < Vorperiode + Traffic Rückgang
    if metrics.get("revenue") and metrics.get("traffic"):
        last7_rev = np.mean(metrics["revenue"][-7:])
        prev7_rev = np.mean(metrics["revenue"][-14:-7]) if len(metrics["revenue"]) >= 14 else last7_rev
        last7_tr = np.mean(metrics["traffic"][-7:])
        prev7_tr = np.mean(metrics["traffic"][-14:-7]) if len(metrics["traffic"]) >= 14 else last7_tr
        drop_rev = (last7_rev - prev7_rev) / (prev7_rev or 1) * 100
        drop_tr = (last7_tr - prev7_tr) / (prev7_tr or 1) * 100
        if drop_rev < -5 and drop_tr < -3:
            signals.append({
                "metric": "revenue",
                "type": "early_warning",
                "severity": "high",
                "detail": "Früher Hinweis: Umsatz und Traffic fallen parallel.",
                "evidence": {"rev_change_pct": round(drop_rev, 2), "traffic_change_pct": round(drop_tr, 2)},
            })

    return {"status": "ok", "signals": signals}


def signal_bias(signals: dict[str, Any]) -> dict[str, float]:
    """
    Mappt erkannte Muster auf Kategorie-Biases für Empfehlungen.
    """
    bias: dict[str, float] = {}
    for sig in signals.get("signals", []):
        if sig["type"] in {"subtle_decline", "early_warning"}:
            if sig["metric"] in {"traffic", "revenue"}:
                bias["marketing"] = bias.get("marketing", 0.0) + 0.18
            if sig["metric"] == "conversion_rate":
                bias["product"] = bias.get("product", 0.0) + 0.16
        if sig["type"] == "positive_momentum":
            bias["growth"] = bias.get("growth", 0.0) + 0.08
        if sig["type"] == "seasonality":
            bias["operations"] = bias.get("operations", 0.0) + 0.05
    return bias


# ── Priorisierung von Empfehlungen & Aufgaben ────────────────────────────────
def rank_recommendations(
    recommendations: list[dict[str, Any]],
    policies: dict[str, RecommendationPolicy],
    biases: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    biases = biases or {}
    priority_factor = {"high": 1.15, "medium": 1.0, "low": 0.85}

    scored: list[tuple[float, dict[str, Any]]] = []
    for rec in recommendations:
        cat = str(rec.get("category") or "operations")
        impact = _safe_float(rec.get("impact_pct"), 0.0)
        weight = policies.get(cat).weight if cat in policies else 1.0
        bias = 1.0 + biases.get(cat, 0.0)
        pf = priority_factor.get(str(rec.get("priority", "medium")).lower(), 1.0)
        score = impact * weight * bias * pf
        enriched = dict(rec)
        enriched["_score"] = round(score, 3)
        scored.append((score, enriched))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored]


def autoprioritize_actions(db: Session, policies: dict[str, RecommendationPolicy]) -> None:
    """
    Passt offene ActionRequests basierend auf Policy-Gewichten an.
    """
    open_actions = (
        db.query(ActionRequest)
        .filter(ActionRequest.status.in_(["pending_approval", "approved", "draft"]))
        .all()
    )
    for action in open_actions:
        cat = str(action.category or "operations")
        weight = policies.get(cat).weight if cat in policies else 1.0
        impact = _safe_float(action.impact_score, 10.0)
        risk = _safe_float(action.risk_score, 40.0)
        score = impact * weight - 0.4 * risk
        if score >= 55:
            action.priority = "high"
        elif score >= 32:
            action.priority = "medium"
        else:
            action.priority = "low"
    db.commit()


# ── Scheduled Cycle ──────────────────────────────────────────────────────────
def run_learning_cycle(db: Session, workspace_id: int | None = None) -> dict[str, Any]:
    """
    Führt einen vollständigen Lernzyklus aus:
    - Policies aus Outcomes neu berechnen
    - Muster-/Risiko-Signale holen
    - Aktionen automatisch priorisieren
    """
    policies = rebuild_policies(db, workspace_id=workspace_id)
    sigs = collect_metric_signals(db)
    autoprioritize_actions(db, {p.arm: p for p in policies})
    return {
        "status": "ok",
        "policies": {p.arm: {"weight": p.weight, "avg_reward": p.avg_reward} for p in policies},
        "signals": sigs,
    }
