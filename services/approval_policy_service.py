from __future__ import annotations

from typing import Any, Optional, Tuple

from sqlalchemy.orm import Session

from api.auth_routes import User, WorkspaceMembership
from models.approval_policy_setting import ApprovalPolicySetting


ROLE_ORDER = {
    "member": 0,
    "manager": 1,
    "admin": 2,
    "owner": 3,
}

DEFAULT_POLICY_SETTINGS = {
    "low_risk_max": 35.0,
    "medium_risk_max": 60.0,
    "high_impact_threshold": 28.0,
    "critical_impact_threshold": 40.0,
    "low_risk_required_role": "manager",
    "medium_risk_required_role": "admin",
    "high_risk_required_role": "owner",
    "require_dual_review": True,
    "auto_execute_on_approval": True,
}


def get_workspace_role(db: Session, user: User, workspace_id: Optional[int]) -> str:
    if not workspace_id:
        return str(getattr(user, "role", "member") or "member")
    membership = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.user_id == user.id,
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.is_active == True,  # noqa: E712
        )
        .first()
    )
    if membership and getattr(membership, "role", None):
        return str(membership.role)
    return str(getattr(user, "role", "member") or "member")


def get_policy_settings(db: Session, workspace_id: Optional[int]) -> dict[str, Any]:
    if not workspace_id:
        return dict(DEFAULT_POLICY_SETTINGS)
    row = db.query(ApprovalPolicySetting).filter(ApprovalPolicySetting.workspace_id == workspace_id).first()
    if not row:
        row = ApprovalPolicySetting(workspace_id=workspace_id)
        db.add(row)
        db.flush()
    return {
        **DEFAULT_POLICY_SETTINGS,
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


def build_policy_snapshot(role: str, risk_score: Optional[float], impact_score: Optional[float], settings: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    settings = settings or dict(DEFAULT_POLICY_SETTINGS)
    risk = risk_score or 0.0
    impact = impact_score or 0.0
    min_role = (
        settings["low_risk_required_role"] if risk <= settings["low_risk_max"] and impact <= settings["high_impact_threshold"]
        else settings["medium_risk_required_role"] if risk <= settings["medium_risk_max"]
        else settings["high_risk_required_role"]
    )
    return {
        "requested_role": role,
        "required_role": min_role,
        "risk_score": risk,
        "impact_score": impact,
        "high_risk": risk > 60,
        "requires_dual_review": bool(settings["require_dual_review"] and (risk > settings["medium_risk_max"] or impact > settings["critical_impact_threshold"])),
        "auto_execute_on_approval": bool(settings["auto_execute_on_approval"]),
    }


def can_approve_action(role: str, risk_score: Optional[float], impact_score: Optional[float], settings: Optional[dict[str, Any]] = None) -> Tuple[bool, dict[str, Any]]:
    policy = build_policy_snapshot(role, risk_score, impact_score, settings=settings)
    return ROLE_ORDER.get(role, 0) >= ROLE_ORDER.get(policy["required_role"], 99), policy
