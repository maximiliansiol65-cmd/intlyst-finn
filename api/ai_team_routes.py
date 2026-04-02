"""
ai_team_routes.py
REST API for AI Team agents and their outputs.
GET  /api/ai-team                          – List all agents for workspace
GET  /api/ai-team/{role}/outputs           – Outputs for a role
POST /api/ai-team/{role}/generate          – Generate new output for role
POST /api/ai-team/outputs/{output_id}/feedback – Submit feedback on an output
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import get_current_user, User
from models.ai_agent import AIAgent
from models.ai_output import AIOutput
from services.ai_team_service import (
    get_or_init_agents,
    get_agents,
    generate_role_output,
    get_outputs_by_role,
    submit_output_feedback,
)
from services.analysis_service import get_daily_rows

router = APIRouter(prefix="/api/ai-team", tags=["ai-team"])

_VALID_ROLES = {"ceo", "coo", "cmo", "cfo", "strategist", "assistant"}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AIAgentOut(BaseModel):
    id: int
    workspace_id: int
    role: str
    display_name: Optional[str] = None
    focus_areas: Optional[str] = None
    output_types: Optional[str] = None
    is_active: bool
    last_triggered_at: Optional[str] = None

    @classmethod
    def from_orm_clean(cls, obj: Any) -> "AIAgentOut":
        return cls(
            id=int(getattr(obj, "id")),
            workspace_id=int(getattr(obj, "workspace_id")),
            role=str(getattr(obj, "role")),
            display_name=getattr(obj, "display_name", None),
            focus_areas=getattr(obj, "focus_areas", None),
            output_types=getattr(obj, "output_types", None),
            is_active=bool(getattr(obj, "is_active", False)),
            last_triggered_at=(str(getattr(obj, "last_triggered_at")) if getattr(obj, "last_triggered_at", None) is not None else None),
        )


class AIOutputOut(BaseModel):
    id: int
    workspace_id: int
    agent_role: str
    output_type: str
    content: str
    priority: str
    confidence_score: Optional[float] = None
    impact_score: Optional[float] = None
    status: str
    feedback_rating: Optional[int] = None
    feedback_comment: Optional[str] = None
    generated_at: Optional[str] = None
    linked_kpi_id: Optional[int] = None
    linked_task_id: Optional[int] = None
    linked_goal_id: Optional[int] = None
    linked_insight_id: Optional[int] = None

    @classmethod
    def from_orm_clean(cls, obj: Any) -> "AIOutputOut":
        return cls(
            id=int(getattr(obj, "id")),
            workspace_id=int(getattr(obj, "workspace_id")),
            agent_role=str(getattr(obj, "agent_role")),
            output_type=str(getattr(obj, "output_type")),
            content=str(getattr(obj, "content")),
            priority=str(getattr(obj, "priority")),
            confidence_score=(float(getattr(obj, "confidence_score")) if getattr(obj, "confidence_score", None) is not None else None),
            impact_score=(float(getattr(obj, "impact_score")) if getattr(obj, "impact_score", None) is not None else None),
            status=str(getattr(obj, "status")),
            feedback_rating=(int(getattr(obj, "feedback_rating")) if getattr(obj, "feedback_rating", None) is not None else None),
            feedback_comment=getattr(obj, "feedback_comment", None),
            generated_at=(str(getattr(obj, "generated_at")) if getattr(obj, "generated_at", None) is not None else None),
            linked_kpi_id=(int(getattr(obj, "linked_kpi_id")) if getattr(obj, "linked_kpi_id", None) is not None else None),
            linked_task_id=(int(getattr(obj, "linked_task_id")) if getattr(obj, "linked_task_id", None) is not None else None),
            linked_goal_id=(int(getattr(obj, "linked_goal_id")) if getattr(obj, "linked_goal_id", None) is not None else None),
            linked_insight_id=(int(getattr(obj, "linked_insight_id")) if getattr(obj, "linked_insight_id", None) is not None else None),
        )


class GenerateRequest(BaseModel):
    context_override: Optional[Dict[str, Any]] = Field(
        None,
        description="Optional extra context to pass to the AI (merges with auto-built context)"
    )


class FeedbackIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[AIAgentOut])
def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = get_current_workspace_id() or 1
    agents = get_or_init_agents(db, workspace_id)
    return [AIAgentOut.from_orm_clean(a) for a in agents]


@router.get("/{role}/outputs", response_model=List[AIOutputOut])
def list_role_outputs(
    role: str,
    status: Optional[str] = Query(None, description="new|acknowledged|acted_upon|dismissed"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {sorted(_VALID_ROLES)}")
    workspace_id = get_current_workspace_id() or 1
    outputs = get_outputs_by_role(db, workspace_id, role, limit=limit, status=status)
    return [AIOutputOut.from_orm_clean(o) for o in outputs]


@router.post("/{role}/generate", response_model=AIOutputOut, status_code=201)
def trigger_role_output(
    role: str,
    body: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if role not in _VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role. Valid: {sorted(_VALID_ROLES)}")
    workspace_id = get_current_workspace_id() or 1
    actor_user_id_raw = getattr(current_user, "id", None)
    actor_user_id = actor_user_id_raw if isinstance(actor_user_id_raw, int) else None

    # Build basic context from last 30 days of metrics
    try:
        rows = get_daily_rows(db, days=30)
        context: Dict[str, Any] = {
            "recent_metrics_count": len(rows),
            "workspace_id": workspace_id,
            "role": role,
        }
        if rows:
            latest = rows[-1]
            context["latest_metrics"] = {
                "date": str(getattr(latest, "date", "")),
                "revenue": getattr(latest, "revenue", 0),
                "traffic": getattr(latest, "traffic", 0),
                "conversions": getattr(latest, "conversions", 0),
                "conversion_rate": getattr(latest, "conversion_rate", 0),
                "new_customers": getattr(latest, "new_customers", 0),
                "profit": getattr(latest, "profit", 0),
            }
    except Exception:
        context = {"workspace_id": workspace_id, "role": role}

    # Merge user-provided context override
    if body.context_override:
        context.update(body.context_override)

    output = generate_role_output(
        db, workspace_id, role, context, actor_user_id=actor_user_id
    )
    return AIOutputOut.from_orm_clean(output)


@router.post("/outputs/{output_id}/feedback", response_model=AIOutputOut)
def give_feedback(
    output_id: int,
    body: FeedbackIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = get_current_workspace_id() or 1
    actor_user_id_raw = getattr(current_user, "id", None)
    actor_user_id = actor_user_id_raw if isinstance(actor_user_id_raw, int) else None
    output = submit_output_feedback(
        db, workspace_id, output_id,
        rating=body.rating, comment=body.comment,
        user_id=actor_user_id,
    )
    if not output:
        raise HTTPException(status_code=404, detail="AI output not found")
    return AIOutputOut.from_orm_clean(output)
