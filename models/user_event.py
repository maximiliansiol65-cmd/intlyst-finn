from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, Index

from models.base import Base


class UserEvent(Base):
    __tablename__ = "user_events"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    user_id = Column(Integer, nullable=False, index=True)

    event_type = Column(String(64), nullable=False, index=True)
    page = Column(String(128), nullable=True)
    kpi = Column(String(128), nullable=True)
    feature = Column(String(128), nullable=True)
    task_id = Column(Integer, nullable=True)
    suggestion_id = Column(String(128), nullable=True)
    content_style = Column(String(64), nullable=True)
    content_length = Column(String(32), nullable=True)
    tone = Column(String(32), nullable=True)
    outcome = Column(String(32), nullable=True)  # accepted | ignored | completed | viewed
    duration_ms = Column(Integer, nullable=True)
    extra = Column(Text, nullable=True)  # JSON-encoded metadata for flexible attributes

    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_user_events_user_type", "workspace_id", "user_id", "event_type"),
        Index("ix_user_events_created", "workspace_id", "created_at"),
    )
