from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from models.base import Base


class WorkSchedule(Base):
    __tablename__ = "work_schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True, index=True)
    timezone = Column(String, nullable=True, default="Europe/Berlin")
    weekly_hours_json = Column(Text, nullable=True)
    exceptions_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
