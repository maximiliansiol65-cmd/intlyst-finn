from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from models.base import Base


class StrategyCycle(Base):
    __tablename__ = "strategy_cycles"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    triggered_by = Column(String(255), nullable=True)
    mode = Column(String(32), nullable=False, default="manual")  # manual | background
    status = Column(String(32), nullable=False, default="ok")

    problem_name = Column(String(255), nullable=True)
    cause_name = Column(String(128), nullable=True)
    conflict_count = Column(Integer, nullable=False, default=0)
    requires_confirmation = Column(Boolean, nullable=False, default=True)

    kpi_snapshot_json = Column(Text, nullable=True)
    top_actions_json = Column(Text, nullable=True)
    simulations_json = Column(Text, nullable=True)
    strategy_changes_json = Column(Text, nullable=True)
    prepared_request_ids_json = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

