from datetime import datetime, date

from sqlalchemy import Column, Index, Integer, Float, Date, String, DateTime, Text

from models.base import Base


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    metric = Column(String, nullable=False)  # revenue | traffic | conversions | conversion_rate | new_customers
    target_value = Column(Float, nullable=False)
    period = Column(String, nullable=False, default="monthly")  # monthly | weekly
    start_date = Column(Date, nullable=False, default=date.today)
    end_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Extended fields for Decision Intelligence
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    # goal_type: weekly|monthly|yearly|strategic|operative
    goal_type = Column(String, nullable=False, default="monthly")
    linked_kpi_ids = Column(Text, nullable=True)       # JSON array of KPI IDs
    current_value = Column(Float, nullable=True)
    progress_pct = Column(Float, nullable=True, default=0.0)
    # priority: critical|high|medium|low
    priority = Column(String, nullable=False, default="medium")
    # status: on_track|at_risk|behind|achieved|paused
    status = Column(String, nullable=False, default="on_track")
    responsible_role = Column(String, nullable=True)   # ceo|coo|cmo|cfo|strategist|team_member
    last_review_at = Column(DateTime, nullable=True)
    next_review_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_goals_end_date", "end_date"),
        Index("ix_goals_metric", "metric"),
        Index("ix_goals_workspace_metric", "workspace_id", "metric"),
    )


class GoalReview(Base):
    __tablename__ = "goal_reviews"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    goal_id = Column(Integer, nullable=False, index=True)
    reviewer_user_id = Column(Integer, nullable=True)
    # status: on_track|at_risk|behind|achieved|paused
    status = Column(String, nullable=False, default="on_track")
    score = Column(Float, nullable=True)               # 0–100
    comment = Column(Text, nullable=True)
    kpi_snapshot = Column(Text, nullable=True)         # JSON snapshot of KPI values at review time
    created_at = Column(DateTime, default=datetime.utcnow)