from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Index, Integer, String

from models.base import Base


class DecisionProblem(Base):
    __tablename__ = "decision_problems"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)

    metric_key = Column(String(64), nullable=False, index=True)
    problem_name = Column(String(255), nullable=False)
    category = Column(String(64), nullable=False)
    strength_pct = Column(Float, nullable=False, default=0.0)
    importance = Column(Integer, nullable=False, default=5)
    problem_score = Column(Float, nullable=False, default=0.0)
    severity = Column(String(32), nullable=False, default="none")
    priority = Column(String(16), nullable=False, default="low")
    likely_cause = Column(String(128), nullable=True)
    cause_confidence_pct = Column(Float, nullable=False, default=0.0)
    detected_at = Column(DateTime, default=datetime.utcnow, index=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_decision_problems_workspace_detected", "workspace_id", "detected_at"),
        Index("ix_decision_problems_workspace_metric", "workspace_id", "metric_key"),
    )

