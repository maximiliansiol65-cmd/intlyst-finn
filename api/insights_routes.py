"""
insights_routes.py
REST API for persistent Insight records.
GET /api/insights          – List insights (filter by role, type, status, priority)
GET /api/insights/{id}     – Detail view
POST /api/insights/{id}/acknowledge – Mark as acknowledged
POST /api/insights/{id}/feedback    – Submit rating + comment
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import get_current_user, get_current_workspace_id, User
from api.role_guards import require_strategist_or_above, require_manager_or_above, get_user_workspace_role
from models.insight import Insight
from services.tenant_guard import assert_owns_resource
from services.insight_service import (
    get_insights,
    get_insight_by_id,
    acknowledge_insight,
    submit_insight_feedback,
)
from services.relationship_service import get_insight_goal_ids, get_insight_task_ids

router = APIRouter(prefix="/api/insights", tags=["insights"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class InsightOut(BaseModel):
    id: int
    workspace_id: int
    title: str
    insight_type: str
    what_happened: Optional[str] = None
    why_it_happened: Optional[str] = None
    what_it_means: Optional[str] = None
    what_to_do: Optional[str] = None
    expected_outcome: Optional[str] = None
    priority: str
    confidence_score: Optional[float] = None
    impact_score: Optional[float] = None
    relevance_score: Optional[float] = None
    target_role: Optional[str] = None
    generated_by_ai_role: Optional[str] = None
    status: str
    linked_task_ids: Optional[str] = None
    linked_goal_ids: Optional[str] = None
    affected_kpi_ids: Optional[str] = None
    linked_task_id_list: list[int] = Field(default_factory=list)
    linked_goal_id_list: list[int] = Field(default_factory=list)
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_clean(cls, obj: Insight) -> "InsightOut":
        return cls(
            id=obj.id,
            workspace_id=obj.workspace_id,
            title=obj.title,
            insight_type=obj.insight_type,
            what_happened=obj.what_happened,
            why_it_happened=obj.why_it_happened,
            what_it_means=obj.what_it_means,
            what_to_do=obj.what_to_do,
            expected_outcome=obj.expected_outcome,
            priority=obj.priority,
            confidence_score=obj.confidence_score,
            impact_score=obj.impact_score,
            relevance_score=obj.relevance_score,
            target_role=obj.target_role,
            generated_by_ai_role=obj.generated_by_ai_role,
            status=obj.status,
            linked_task_ids=obj.linked_task_ids,
            linked_goal_ids=obj.linked_goal_ids,
            affected_kpi_ids=obj.affected_kpi_ids,
            linked_task_id_list=[],
            linked_goal_id_list=[],
            created_at=str(obj.created_at),
            updated_at=str(obj.updated_at) if obj.updated_at else None,
        )


class FeedbackIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[InsightOut])
def list_insights(
    role: Optional[str] = Query(None, description="Filter by target_role: ceo|coo|cmo|cfo|strategist|assistant|all"),
    insight_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="new|acknowledged|in_progress|resolved|dismissed"),
    priority: Optional[str] = Query(None, description="critical|high|medium|low"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    from api.role_guards import MANAGER_ROLES
    user_role = get_user_workspace_role(current_user, workspace_id, db)
    # Managers+ can request any role's insights; non-managers are locked to their own role
    if role and user_role not in MANAGER_ROLES and role != user_role and role != "all":
        from fastapi import HTTPException
        raise HTTPException(
            status_code=403,
            detail=f"Zugriff auf {role}-Insights nicht erlaubt. Deine Rolle: {user_role}",
        )
    effective_role = role or user_role
    insights = get_insights(
        db, workspace_id,
        role=effective_role, insight_type=insight_type,
        status=status, priority=priority, limit=limit,
    )
    response: list[InsightOut] = []
    for insight in insights:
        item = InsightOut.from_orm_clean(insight)
        item.linked_task_id_list = get_insight_task_ids(db, workspace_id, insight.id)
        item.linked_goal_id_list = get_insight_goal_ids(db, workspace_id, insight.id)
        response.append(item)
    return response


@router.get("/{insight_id}", response_model=InsightOut)
def get_insight(
    insight_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    insight = get_insight_by_id(db, workspace_id, insight_id)
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
    assert_owns_resource(insight.workspace_id, workspace_id)
    item = InsightOut.from_orm_clean(insight)
    item.linked_task_id_list = get_insight_task_ids(db, workspace_id, insight.id)
    item.linked_goal_id_list = get_insight_goal_ids(db, workspace_id, insight.id)
    return item


@router.post("/{insight_id}/acknowledge", response_model=InsightOut)
def acknowledge(
    insight_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    insight = acknowledge_insight(db, workspace_id, insight_id, user_id=current_user.id)
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
    item = InsightOut.from_orm_clean(insight)
    item.linked_task_id_list = get_insight_task_ids(db, workspace_id, insight.id)
    item.linked_goal_id_list = get_insight_goal_ids(db, workspace_id, insight.id)
    return item


@router.post("/{insight_id}/feedback", response_model=InsightOut)
def give_feedback(
    insight_id: int,
    body: FeedbackIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    insight = submit_insight_feedback(
        db, workspace_id, insight_id,
        rating=body.rating, comment=body.comment,
        user_id=current_user.id,
    )
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
    item = InsightOut.from_orm_clean(insight)
    item.linked_task_id_list = get_insight_task_ids(db, workspace_id, insight.id)
    item.linked_goal_id_list = get_insight_goal_ids(db, workspace_id, insight.id)
    return item
