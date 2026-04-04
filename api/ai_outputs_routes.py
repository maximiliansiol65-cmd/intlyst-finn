"""
ai_outputs_routes.py
REST API for AI team output records.
GET  /api/ai-outputs          – List outputs (filter by role, type, status)
GET  /api/ai-outputs/{id}     – Detail view
POST /api/ai-outputs/{id}/acknowledge – Mark as acknowledged
POST /api/ai-outputs/{id}/feedback    – Submit rating + comment
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import get_current_user, User
from api.role_guards import require_strategist_or_above, require_manager_or_above
from models.ai_output import AIOutput
from services.tenant_guard import require_workspace_context, assert_owns_resource

router = APIRouter(prefix="/api/ai-outputs", tags=["ai-outputs"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AIOutputOut(BaseModel):
    id: int
    workspace_id: int
    agent_role: str
    output_type: str
    content: str
    structured_data: Optional[str] = None
    linked_kpi_id: Optional[int] = None
    linked_task_id: Optional[int] = None
    linked_goal_id: Optional[int] = None
    linked_insight_id: Optional[int] = None
    priority: str
    confidence_score: Optional[float] = None
    impact_score: Optional[float] = None
    status: str
    feedback_rating: Optional[int] = None
    feedback_comment: Optional[str] = None
    feedback_at: Optional[str] = None
    generated_at: str

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_clean(cls, obj: AIOutput) -> "AIOutputOut":
        return cls(
            id=obj.id,
            workspace_id=obj.workspace_id,
            agent_role=obj.agent_role,
            output_type=obj.output_type,
            content=obj.content,
            structured_data=obj.structured_data,
            linked_kpi_id=obj.linked_kpi_id,
            linked_task_id=obj.linked_task_id,
            linked_goal_id=obj.linked_goal_id,
            linked_insight_id=obj.linked_insight_id,
            priority=obj.priority,
            confidence_score=obj.confidence_score,
            impact_score=obj.impact_score,
            status=obj.status,
            feedback_rating=obj.feedback_rating,
            feedback_comment=obj.feedback_comment,
            feedback_at=str(obj.feedback_at) if obj.feedback_at else None,
            generated_at=str(obj.generated_at),
        )


class FeedbackIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[AIOutputOut])
def list_ai_outputs(
    role: Optional[str] = Query(None, description="Filter by agent_role: ceo|coo|cmo|cfo|strategist|assistant"),
    output_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="new|acknowledged|acted_upon|dismissed"),
    priority: Optional[str] = Query(None, description="critical|high|medium|low"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    q = db.query(AIOutput).filter(AIOutput.workspace_id == workspace_id)
    if role:
        q = q.filter(AIOutput.agent_role == role)
    if output_type:
        q = q.filter(AIOutput.output_type == output_type)
    if status:
        q = q.filter(AIOutput.status == status)
    if priority:
        q = q.filter(AIOutput.priority == priority)
    outputs = q.order_by(AIOutput.generated_at.desc()).limit(limit).all()
    return [AIOutputOut.from_orm_clean(o) for o in outputs]


@router.get("/{output_id}", response_model=AIOutputOut)
def get_ai_output(
    output_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    obj = db.query(AIOutput).filter(
        AIOutput.workspace_id == workspace_id,
        AIOutput.id == output_id,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="AI output not found")
    assert_owns_resource(obj.workspace_id, workspace_id)
    return AIOutputOut.from_orm_clean(obj)


@router.post("/{output_id}/acknowledge", response_model=AIOutputOut)
def acknowledge_output(
    output_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    obj = db.query(AIOutput).filter(
        AIOutput.workspace_id == workspace_id,
        AIOutput.id == output_id,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="AI output not found")
    obj.status = "acknowledged"
    db.commit()
    db.refresh(obj)
    return AIOutputOut.from_orm_clean(obj)


@router.post("/{output_id}/feedback", response_model=AIOutputOut)
def give_feedback(
    output_id: int,
    body: FeedbackIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    obj = db.query(AIOutput).filter(
        AIOutput.workspace_id == workspace_id,
        AIOutput.id == output_id,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="AI output not found")
    obj.feedback_rating = body.rating
    obj.feedback_comment = body.comment
    obj.feedback_at = datetime.utcnow()
    if obj.status == "new":
        obj.status = "acknowledged"
    db.commit()
    db.refresh(obj)
    return AIOutputOut.from_orm_clean(obj)
