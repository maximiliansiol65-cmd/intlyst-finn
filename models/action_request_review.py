from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from models.base import Base


class ActionRequestReview(Base):
    __tablename__ = "action_request_reviews"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    action_request_id = Column(Integer, nullable=False, index=True)
    reviewer_email = Column(String, nullable=False)
    reviewer_role = Column(String, nullable=False)
    decision = Column(String, nullable=False)  # approved | rejected
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
