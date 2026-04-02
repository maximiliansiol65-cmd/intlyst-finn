from datetime import datetime, date

from sqlalchemy import Column, Integer, Float, Date, String, DateTime

from models.base import Base


class ActionLog(Base):
    __tablename__ = "action_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    date = Column(Date, nullable=False, default=date.today)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, nullable=False)  # marketing | product | sales | operations
    impact_pct = Column(Float, nullable=True)
    status = Column(String, nullable=False, default="done")  # done | pending
    created_at = Column(DateTime, default=datetime.utcnow)