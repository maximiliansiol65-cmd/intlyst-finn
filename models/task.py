from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text

from models.base import Base


class Task(Base):
    __tablename__ = "tasks"

    id                = Column(Integer, primary_key=True, index=True)
    workspace_id      = Column(Integer, nullable=False, default=1, index=True)
    title             = Column(String, nullable=False)
    description       = Column(Text, nullable=True)
    goal              = Column(Text, nullable=True)
    expected_result   = Column(Text, nullable=True)
    steps_json        = Column(Text, nullable=True)
    time_estimate_minutes = Column(Integer, nullable=True, default=0)
    kpis_json         = Column(Text, nullable=True)
    impact            = Column(String, nullable=True, default="medium")
    status            = Column(String, nullable=False, default="open")
    priority          = Column(String, nullable=False, default="medium")
    assigned_to       = Column(String, nullable=True)
    assigned_to_id    = Column(Integer, nullable=True)
    due_date          = Column(Date, nullable=True)
    recommendation_id = Column(Integer, nullable=True)
    completed_at      = Column(DateTime, nullable=True)
    created_by        = Column(String, nullable=True)
    created_at        = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at        = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Extended fields for Decision Intelligence
    # source_type: manual|analysis|goal|review|ai_suggestion
    source_type       = Column(String, nullable=False, default="manual")
    trigger_reason    = Column(Text, nullable=True)     # Why was this task created?
    risk_score        = Column(Float, nullable=True, default=0.0)   # 0–100
    expected_impact   = Column(Text, nullable=True)     # Free-text expected outcome
    linked_insight_id = Column(Integer, nullable=True)  # FK to insights
    linked_scenario_id = Column(Integer, nullable=True) # FK to scenarios


class TaskHistory(Base):
    __tablename__ = "task_history"

    id         = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    task_id    = Column(Integer, nullable=False)
    changed_by = Column(String, nullable=True)
    field      = Column(String, nullable=False)
    old_value  = Column(String, nullable=True)
    new_value  = Column(String, nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow)
