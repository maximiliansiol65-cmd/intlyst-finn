from datetime import datetime

from sqlalchemy import Column, DateTime, Date, Integer, String, Text, Index

from models.base import Base


class Report(Base):
    __tablename__ = "reports"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, nullable=False, default=1, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    type         = Column(String(20), nullable=False)          # daily | weekly | custom
    period_start = Column(Date, nullable=False)
    period_end   = Column(Date, nullable=False)
    title        = Column(String(200), nullable=False)
    status       = Column(String(20), nullable=False, default="pending")  # pending|generating|done|error
    summary      = Column(Text, nullable=True)                 # KI-Executive-Summary
    html_content = Column(Text, nullable=True)                 # Vollständiger HTML-Report
    error_msg    = Column(String(500), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_reports_user_type", "user_id", "type"),
        Index("ix_reports_user_created", "user_id", "created_at"),
        Index("ix_reports_workspace_type", "workspace_id", "type"),
        Index("ix_reports_workspace_created", "workspace_id", "created_at"),
    )
