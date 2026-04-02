from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from models.base import Base


class ApprovalPolicySetting(Base):
    __tablename__ = "approval_policy_settings"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True, unique=True)
    low_risk_max = Column(Float, nullable=False, default=35.0)
    medium_risk_max = Column(Float, nullable=False, default=60.0)
    high_impact_threshold = Column(Float, nullable=False, default=28.0)
    critical_impact_threshold = Column(Float, nullable=False, default=40.0)
    low_risk_required_role = Column(String, nullable=False, default="manager")
    medium_risk_required_role = Column(String, nullable=False, default="admin")
    high_risk_required_role = Column(String, nullable=False, default="owner")
    require_dual_review = Column(Boolean, nullable=False, default=True)
    auto_execute_on_approval = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
