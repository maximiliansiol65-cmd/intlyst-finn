"""
ai_agents_routes.py
REST API for AI Team agent configuration.
GET   /api/ai-agents               – List all AI agents for this workspace
GET   /api/ai-agents/{role}        – Get config for a specific role
PATCH /api/ai-agents/{role}        – Update display_name, focus_areas, system_prompt_override, is_active
POST  /api/ai-agents/init          – Initialise the 6 default agents for this workspace (idempotent)
"""
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import get_current_user, User
from models.ai_agent import AIAgent, DEFAULT_AI_AGENTS

router = APIRouter(prefix="/api/ai-agents", tags=["ai-agents"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AIAgentOut(BaseModel):
    id: int
    workspace_id: int
    role: str
    display_name: Optional[str] = None
    focus_areas: Optional[str] = None   # JSON string
    output_types: Optional[str] = None  # JSON string
    is_active: bool
    system_prompt_override: Optional[str] = None
    last_triggered_at: Optional[str] = None
    created_at: str

    @classmethod
    def from_orm_clean(cls, obj: AIAgent) -> "AIAgentOut":
        return cls(
            id=obj.id,
            workspace_id=obj.workspace_id,
            role=obj.role,
            display_name=obj.display_name,
            focus_areas=obj.focus_areas,
            output_types=obj.output_types,
            is_active=obj.is_active,
            system_prompt_override=obj.system_prompt_override,
            last_triggered_at=str(obj.last_triggered_at) if obj.last_triggered_at else None,
            created_at=str(obj.created_at),
        )


class AIAgentPatch(BaseModel):
    display_name: Optional[str] = None
    focus_areas: Optional[list] = None          # Accepts list; stored as JSON
    output_types: Optional[list] = None         # Accepts list; stored as JSON
    system_prompt_override: Optional[str] = None
    is_active: Optional[bool] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/init", status_code=201)
def init_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Idempotent: create the 6 default AI agents for this workspace if not present."""
    workspace_id = get_current_workspace_id() or 1
    created = 0
    for cfg in DEFAULT_AI_AGENTS:
        exists = db.query(AIAgent).filter(
            AIAgent.workspace_id == workspace_id,
            AIAgent.role == cfg["role"],
        ).first()
        if not exists:
            agent = AIAgent(
                workspace_id=workspace_id,
                role=cfg["role"],
                display_name=cfg["display_name"],
                focus_areas=json.dumps(cfg["focus_areas"]),
                output_types=json.dumps(cfg["output_types"]),
                is_active=True,
            )
            db.add(agent)
            created += 1
    db.commit()
    return {"created": created, "message": f"{created} agent(s) initialised"}


@router.get("/", response_model=List[AIAgentOut])
def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = get_current_workspace_id() or 1
    agents = db.query(AIAgent).filter(
        AIAgent.workspace_id == workspace_id,
    ).order_by(AIAgent.role).all()
    return [AIAgentOut.from_orm_clean(a) for a in agents]


@router.get("/{role}", response_model=AIAgentOut)
def get_agent(
    role: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = get_current_workspace_id() or 1
    agent = db.query(AIAgent).filter(
        AIAgent.workspace_id == workspace_id,
        AIAgent.role == role,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"AI agent '{role}' not found")
    return AIAgentOut.from_orm_clean(agent)


@router.patch("/{role}", response_model=AIAgentOut)
def update_agent(
    role: str,
    body: AIAgentPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace_id = get_current_workspace_id() or 1
    agent = db.query(AIAgent).filter(
        AIAgent.workspace_id == workspace_id,
        AIAgent.role == role,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail=f"AI agent '{role}' not found")

    if body.display_name is not None:
        agent.display_name = body.display_name
    if body.focus_areas is not None:
        agent.focus_areas = json.dumps(body.focus_areas)
    if body.output_types is not None:
        agent.output_types = json.dumps(body.output_types)
    if body.system_prompt_override is not None:
        agent.system_prompt_override = body.system_prompt_override
    if body.is_active is not None:
        agent.is_active = body.is_active

    db.commit()
    db.refresh(agent)
    return AIAgentOut.from_orm_clean(agent)
