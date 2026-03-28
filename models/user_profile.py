from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint, Index

from models.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    user_id = Column(Integer, nullable=False, index=True)

    priority_focus = Column(String(64), nullable=True)
    preferred_task_size = Column(String(32), nullable=True)
    preferred_dashboard = Column(String(64), nullable=True)
    working_time = Column(String(32), nullable=True)
    content_style = Column(String(64), nullable=True)
    behavior_type = Column(String(64), nullable=True)

    kpi_focus_json = Column(Text, nullable=True)
    scores_json = Column(Text, nullable=True)
    profile_json = Column(Text, nullable=True)

    last_event_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_user_profiles_user"),
        Index("ix_user_profiles_workspace_user", "workspace_id", "user_id"),
    )
