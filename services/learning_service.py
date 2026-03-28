from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from models.recommendation_outcome import RecommendationOutcome
from services.self_learning_service import record_feedback, policy_lookup


def record_outcome_placeholder(
    db: Session,
    action_request_id: int,
    recommendation_id: Optional[str],
    event_id: Optional[str],
    title: str,
    category: str,
    predicted_impact_pct: Optional[float],
    predicted_roi_score: Optional[float],
    confidence_score: Optional[float],
) -> RecommendationOutcome:
    outcome = RecommendationOutcome(
        action_request_id=action_request_id,
        recommendation_id=recommendation_id,
        event_id=event_id,
        title=title,
        category=category,
        predicted_impact_pct=predicted_impact_pct,
        predicted_roi_score=predicted_roi_score,
        confidence_score=confidence_score,
        status="tracking",
    )
    db.add(outcome)
    db.flush()
    return outcome


def summarize_learning(db: Session) -> dict[str, Any]:
    rows = db.query(RecommendationOutcome).order_by(RecommendationOutcome.created_at.desc()).limit(300).all()
    if not rows:
        return {
            "overall_accuracy": 0.0,
            "tracked_recommendations": 0,
            "implemented_count": 0,
            "avg_predicted_impact": 0.0,
            "avg_actual_impact": 0.0,
            "by_category": {},
            "message": "Noch keine Outcomes vorhanden.",
            "policies": {},
        }

    completed = [row for row in rows if row.actual_impact_pct is not None]
    implemented_count = len(rows)
    avg_predicted = sum((row.predicted_impact_pct or 0.0) for row in rows) / max(len(rows), 1)
    avg_actual = sum((row.actual_impact_pct or 0.0) for row in completed) / max(len(completed), 1) if completed else 0.0

    accuracies = []
    by_category: dict[str, dict[str, Any]] = {}
    for row in rows:
        bucket = by_category.setdefault(row.category, {
            "tracked": 0,
            "completed": 0,
            "avg_predicted_impact": 0.0,
            "avg_actual_impact": 0.0,
            "accuracy_rate": 0.0,
        })
        bucket["tracked"] += 1
        bucket["avg_predicted_impact"] += row.predicted_impact_pct or 0.0
        if row.actual_impact_pct is not None:
            bucket["completed"] += 1
            bucket["avg_actual_impact"] += row.actual_impact_pct or 0.0
            predicted = row.predicted_impact_pct or 0.0
            if predicted == 0 and row.actual_impact_pct == 0:
                accuracies.append(1.0)
            elif predicted > 0:
                accuracies.append(max(0.0, 1 - abs((row.actual_impact_pct or 0.0) - predicted) / predicted))

    for category, bucket in by_category.items():
        tracked = bucket["tracked"]
        completed_count = bucket["completed"]
        bucket["avg_predicted_impact"] = round(bucket["avg_predicted_impact"] / max(tracked, 1), 1)
        bucket["avg_actual_impact"] = round(bucket["avg_actual_impact"] / max(completed_count, 1), 1) if completed_count else 0.0

        cat_rows = [row for row in rows if row.category == category and row.actual_impact_pct is not None]
        cat_acc = []
        for row in cat_rows:
            predicted = row.predicted_impact_pct or 0.0
            actual = row.actual_impact_pct or 0.0
            if predicted == 0 and actual == 0:
                cat_acc.append(1.0)
            elif predicted > 0:
                cat_acc.append(max(0.0, 1 - abs(actual - predicted) / predicted))
        bucket["accuracy_rate"] = round((sum(cat_acc) / max(len(cat_acc), 1)) * 100, 1) if cat_acc else 0.0

    overall_accuracy = round((sum(accuracies) / max(len(accuracies), 1)) * 100, 1) if accuracies else 0.0
    policies = {
        arm: {
            "weight": pol.weight,
            "avg_reward": pol.avg_reward,
            "completed": pol.completed_count,
            "last_reward": pol.last_reward,
        }
        for arm, pol in policy_lookup(db).items()
    }

    return {
        "overall_accuracy": overall_accuracy,
        "tracked_recommendations": len(rows),
        "implemented_count": implemented_count,
        "avg_predicted_impact": round(avg_predicted, 1),
        "avg_actual_impact": round(avg_actual, 1),
        "by_category": by_category,
        "message": "Lernprofil aus bisherigen Empfehlungen.",
        "policies": policies,
    }


def reward_from_outcome(row: RecommendationOutcome) -> float:
    """
    Ableitung eines Rewards:
    - realer Impact (positiv/negativ)
    - fallback: predicted_impact_pct * confidence
    """
    if row.actual_impact_pct is not None:
        return float(row.actual_impact_pct)
    if row.predicted_impact_pct:
        confidence = (row.confidence_score or 60) / 100
        return float(row.predicted_impact_pct * confidence * 0.4)
    return 0.0


def update_policy_for_outcome(db: Session, row: RecommendationOutcome) -> None:
    reward = reward_from_outcome(row)
    if reward == 0.0:
        return
    record_feedback(
        db,
        arm=row.category or "operations",
        reward=reward,
        outcome_timestamp=row.updated_at,
        workspace_id=getattr(row, "workspace_id", None) or 1,
    )
