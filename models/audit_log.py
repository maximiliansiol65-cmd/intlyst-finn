from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(Integer, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Extended audit fields
    actor_role = Column(String, nullable=True, index=True)   # workspace role at time of action
    context_json = Column(Text, nullable=True)               # snapshot of KPIs/tasks/goals at time of action
