from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from models.base import Base


class Suggestion(Base):
    __tablename__ = "suggestions"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    type = Column(String, nullable=True)
    title = Column(String, nullable=True)
    payload_json = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="proposed")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
