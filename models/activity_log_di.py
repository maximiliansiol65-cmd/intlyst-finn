from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text

from models.base import Base


class ActivityLog(Base):
    """
    Full audit trail for all business-relevant changes.
    Complements ErrorTrace (technical) with a fachliches (business-level) change log.

    action_type examples: create|update|delete|approve|reject|generate|complete|review
    entity_type examples: task|goal|insight|forecast|ai_output|action_request|kpi|user
    """

    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    ai_agent_role = Column(String(30), nullable=True)            # AI actor role, if AI-triggered
    action_type = Column(String(50), nullable=False)             # create|update|delete|approve|generate...
    entity_type = Column(String(50), nullable=False, index=True) # task|goal|insight|forecast|user...
    entity_id = Column(String(50), nullable=True)                # ID of the affected entity
    field_changed = Column(String(100), nullable=True)           # Which field was changed (for updates)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    reason = Column(Text, nullable=True)                         # Why was this action taken?
    consequence = Column(Text, nullable=True)                    # What happened as a result?
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_activity_logs_workspace_entity", "workspace_id", "entity_type"),
        Index("ix_activity_logs_workspace_user", "workspace_id", "user_id"),
        Index("ix_activity_logs_workspace_date", "workspace_id", "created_at"),
    )
