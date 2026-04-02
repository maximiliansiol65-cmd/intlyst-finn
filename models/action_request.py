from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from models.base import Base


class ActionRequest(Base):
    __tablename__ = "action_requests"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    event_id = Column(String, nullable=True, index=True)
    recommendation_id = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False, default="operations")
    priority = Column(String, nullable=False, default="medium")
    impact_score = Column(Float, nullable=True)
    risk_score = Column(Float, nullable=True)
    estimated_hours = Column(Float, nullable=True)
    execution_type = Column(String, nullable=False, default="task")
    status = Column(String, nullable=False, default="pending_approval")
    requested_by = Column(String, nullable=True)
    approved_by = Column(String, nullable=True)
    rejected_by = Column(String, nullable=True)
    execution_ref = Column(String, nullable=True)
    execution_summary = Column(Text, nullable=True)
    artifact_payload = Column(Text, nullable=True)
    execution_plan_json = Column(Text, nullable=True)
    target_systems_json = Column(Text, nullable=True)
    live_feedback_json = Column(Text, nullable=True)
    progress_pct = Column(Float, nullable=False, default=0.0)
    progress_stage = Column(String, nullable=False, default="draft")
    next_action_text = Column(String, nullable=True)
    approval_note = Column(Text, nullable=True)
    last_live_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)
