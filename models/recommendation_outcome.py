from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from models.base import Base


class RecommendationOutcome(Base):
    __tablename__ = "recommendation_outcomes"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    action_request_id = Column(Integer, nullable=False, index=True)
    recommendation_id = Column(String, nullable=True, index=True)
    event_id = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=False, default="operations")
    predicted_impact_pct = Column(Float, nullable=True)
    actual_impact_pct = Column(Float, nullable=True)
    predicted_roi_score = Column(Float, nullable=True)
    actual_roi_score = Column(Float, nullable=True)
    confidence_score = Column(Float, nullable=True)
    status = Column(String, nullable=False, default="tracking")
    learning_note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
