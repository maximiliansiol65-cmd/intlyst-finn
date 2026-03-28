from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import engine, get_db
from models.approval_policy_setting import ApprovalPolicySetting
from models.base import Base

router = APIRouter(prefix="/api/approval-policy", tags=["approval-policy"])

Base.metadata.create_all(bind=engine)


class ApprovalPolicyBody(BaseModel):
    low_risk_max: float = 35.0
    medium_risk_max: float = 60.0
    high_impact_threshold: float = 28.0
    critical_impact_threshold: float = 40.0
    low_risk_required_role: str = "manager"
    medium_risk_required_role: str = "admin"
    high_risk_required_role: str = "owner"
    require_dual_review: bool = True
    auto_execute_on_approval: bool = True


def _payload(row: ApprovalPolicySetting) -> dict:
    return {
        "low_risk_max": row.low_risk_max,
        "medium_risk_max": row.medium_risk_max,
        "high_impact_threshold": row.high_impact_threshold,
        "critical_impact_threshold": row.critical_impact_threshold,
        "low_risk_required_role": row.low_risk_required_role,
        "medium_risk_required_role": row.medium_risk_required_role,
        "high_risk_required_role": row.high_risk_required_role,
        "require_dual_review": row.require_dual_review,
        "auto_execute_on_approval": row.auto_execute_on_approval,
    }


@router.get("")
def get_policy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(ApprovalPolicySetting).filter(ApprovalPolicySetting.workspace_id == workspace_id).first()
    if not row:
        row = ApprovalPolicySetting(workspace_id=workspace_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return _payload(row)


@router.put("")
def update_policy(
    body: ApprovalPolicyBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    del current_user
    row = db.query(ApprovalPolicySetting).filter(ApprovalPolicySetting.workspace_id == workspace_id).first()
    if not row:
        row = ApprovalPolicySetting(workspace_id=workspace_id)
        db.add(row)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return _payload(row)
