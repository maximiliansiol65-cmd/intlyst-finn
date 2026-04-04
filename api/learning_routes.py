
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from api.auth_routes import User, get_current_user
from database import get_db
from models.action_request import ActionRequest
from models.recommendation_outcome import RecommendationOutcome
from services.learning_service import summarize_learning, update_policy_for_outcome
from services.self_learning_service import collect_metric_signals, rebuild_policies, run_learning_cycle, policy_lookup

router = APIRouter(prefix="/api/learning", tags=["learning"])


class OutcomeUpdateBody(BaseModel):
    actual_impact_pct: float
    actual_roi_score: Optional[float] = None
    learning_note: Optional[str] = None
    status: str = "completed"


@router.get("/summary")
def get_learning_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return summarize_learning(db)


@router.get("/outcomes")
def list_outcomes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    rows = db.query(RecommendationOutcome).order_by(RecommendationOutcome.created_at.desc()).limit(50).all()
    return {
        "items": [
            {
                "id": row.id,
                "action_request_id": row.action_request_id,
                "recommendation_id": row.recommendation_id,
                "event_id": row.event_id,
                "title": row.title,
                "category": row.category,
                "predicted_impact_pct": row.predicted_impact_pct,
                "actual_impact_pct": row.actual_impact_pct,
                "predicted_roi_score": row.predicted_roi_score,
                "actual_roi_score": row.actual_roi_score,
                "confidence_score": row.confidence_score,
                "status": row.status,
                "learning_note": row.learning_note,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    }


@router.post("/outcomes/{outcome_id}")
def update_outcome(
    outcome_id: int,
    body: OutcomeUpdateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    row = db.query(RecommendationOutcome).filter(RecommendationOutcome.id == outcome_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Outcome nicht gefunden.")

    row.actual_impact_pct = body.actual_impact_pct
    row.actual_roi_score = body.actual_roi_score
    row.learning_note = body.learning_note
    row.status = body.status

    action = db.query(ActionRequest).filter(ActionRequest.id == row.action_request_id).first()
    if action:
        predicted = row.predicted_impact_pct or 0.0
        actual = body.actual_impact_pct or 0.0
        if actual >= max(predicted * 0.8, 5):
            action.progress_pct = 100.0
            action.progress_stage = "completed"
            action.next_action_text = "Ziel erreicht. Nächste skalierbare Maßnahme auswählen."
        elif actual > 0:
            action.progress_pct = max(action.progress_pct or 0.0, 78.0)
            action.progress_stage = "measuring"
            action.next_action_text = "Wirkung teilweise erreicht. Folgeoptimierung prüfen."
        else:
            action.progress_pct = max(action.progress_pct or 0.0, 64.0)
            action.progress_stage = "needs_attention"
            action.next_action_text = "Kein klarer Effekt. Ursache prüfen und Strategie anpassen."

    update_policy_for_outcome(db, row)

    db.commit()
    db.refresh(row)
    return {"id": row.id, "status": row.status}


@router.get("/signals")
def get_learning_signals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return collect_metric_signals(db)


@router.get("/policies")
def get_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    rebuild_policies(db)
    items = [
        {
            "arm": pol.arm,
            "weight": pol.weight,
            "avg_reward": pol.avg_reward,
            "completed": pol.completed_count,
            "updated_at": pol.updated_at.isoformat() if pol.updated_at else None,
        }
        for pol in policy_lookup(db).values()
    ]
    return {"items": items}


@router.post("/cycle")
def run_cycle(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    return run_learning_cycle(db)
