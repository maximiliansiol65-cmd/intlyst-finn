"""
scenarios_routes.py
REST API for Scenario records (what-if analysis).
GET  /api/scenarios          – List scenarios
POST /api/scenarios          – Create scenario
GET  /api/scenarios/{id}     – Detail
PATCH /api/scenarios/{id}    – Update scenario
DELETE /api/scenarios/{id}   – Delete
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import get_current_user, User
from api.role_guards import require_strategist_or_above, require_manager_or_above
from models.scenario import Scenario
from services.tenant_guard import require_workspace_context, assert_owns_resource

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ScenarioOut(BaseModel):
    id: int
    workspace_id: int
    forecast_id: Optional[int] = None
    name: str
    baseline_description: Optional[str] = None
    change_description: Optional[str] = None
    assumptions: Optional[str] = None
    expected_effect: Optional[str] = None
    risk_level: str
    probability_pct: Optional[float] = None
    outcome_description: Optional[str] = None
    period_reference: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @classmethod
    def from_orm_clean(cls, obj: Scenario) -> "ScenarioOut":
        return cls(
            id=obj.id,
            workspace_id=obj.workspace_id,
            forecast_id=obj.forecast_id,
            name=obj.name,
            baseline_description=obj.baseline_description,
            change_description=obj.change_description,
            assumptions=obj.assumptions,
            expected_effect=obj.expected_effect,
            risk_level=obj.risk_level,
            probability_pct=obj.probability_pct,
            outcome_description=obj.outcome_description,
            period_reference=obj.period_reference,
            status=obj.status,
            created_at=str(obj.created_at) if obj.created_at else None,
            updated_at=str(obj.updated_at) if obj.updated_at else None,
        )


class ScenarioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    forecast_id: Optional[int] = None
    baseline_description: Optional[str] = None
    change_description: Optional[str] = None
    assumptions: Optional[str] = None
    expected_effect: Optional[str] = None
    risk_level: str = Field("medium", pattern="^(low|medium|high|critical)$")
    probability_pct: Optional[float] = Field(None, ge=0, le=100)
    period_reference: Optional[str] = None


class ScenarioPatch(BaseModel):
    name: Optional[str] = None
    baseline_description: Optional[str] = None
    change_description: Optional[str] = None
    assumptions: Optional[str] = None
    expected_effect: Optional[str] = None
    risk_level: Optional[str] = None
    probability_pct: Optional[float] = Field(None, ge=0, le=100)
    outcome_description: Optional[str] = None
    period_reference: Optional[str] = None
    status: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ScenarioOut])
def list_scenarios(
    forecast_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    q = db.query(Scenario).filter(Scenario.workspace_id == workspace_id)
    if forecast_id:
        q = q.filter(Scenario.forecast_id == forecast_id)
    if status:
        q = q.filter(Scenario.status == status)
    return [ScenarioOut.from_orm_clean(s) for s in q.order_by(Scenario.created_at.desc()).limit(limit).all()]


@router.post("/", response_model=ScenarioOut, status_code=201)
def create_scenario(
    body: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_above),
):
    workspace_id = require_workspace_context()
    scenario = Scenario(
        workspace_id=workspace_id,
        **body.model_dump(exclude_none=True),
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)
    return ScenarioOut.from_orm_clean(scenario)


@router.get("/{scenario_id}", response_model=ScenarioOut)
def get_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_strategist_or_above),
):
    workspace_id = require_workspace_context()
    sc = db.query(Scenario).filter(Scenario.workspace_id == workspace_id, Scenario.id == scenario_id).first()
    if not sc:
        raise HTTPException(status_code=404, detail="Scenario not found")
    assert_owns_resource(sc.workspace_id, workspace_id)
    return ScenarioOut.from_orm_clean(sc)


@router.patch("/{scenario_id}", response_model=ScenarioOut)
def update_scenario(
    scenario_id: int,
    body: ScenarioPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_above),
):
    workspace_id = require_workspace_context()
    sc = db.query(Scenario).filter(Scenario.workspace_id == workspace_id, Scenario.id == scenario_id).first()
    if not sc:
        raise HTTPException(status_code=404, detail="Scenario not found")
    assert_owns_resource(sc.workspace_id, workspace_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(sc, field, value)
    from datetime import datetime
    sc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(sc)
    return ScenarioOut.from_orm_clean(sc)


@router.delete("/{scenario_id}", status_code=204)
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_above),
):
    workspace_id = require_workspace_context()
    sc = db.query(Scenario).filter(Scenario.workspace_id == workspace_id, Scenario.id == scenario_id).first()
    if not sc:
        raise HTTPException(status_code=404, detail="Scenario not found")
    assert_owns_resource(sc.workspace_id, workspace_id)
    db.delete(sc)
    db.commit()
