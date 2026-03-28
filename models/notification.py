from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String

from models.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    type = Column(String, nullable=False, default="alert")
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_notification_is_read", "is_read"),
        Index("ix_notification_created_at", "created_at"),
        Index("ix_notification_workspace_created", "workspace_id", "created_at"),
    )
