from datetime import datetime, date

from sqlalchemy import Column, Index, Integer, Float, Date, String, DateTime

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

    __table_args__ = (
        Index("ix_goals_end_date", "end_date"),
        Index("ix_goals_metric", "metric"),
        Index("ix_goals_workspace_metric", "workspace_id", "metric"),
    )