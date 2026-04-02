from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Index, Integer, String, Text

from models.base import Base


class Scenario(Base):
    """
    What-if scenario linked to a ForecastRecord.
    Enables the app to show not just current state but alternative future paths.

    risk_level: low|medium|high|critical
    status: draft|active|evaluated
    """

    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    forecast_id = Column(Integer, nullable=True)         # FK to forecast_records
    name = Column(String(300), nullable=False)           # e.g. "More marketing budget"
    baseline_description = Column(Text, nullable=True)   # Current situation
    change_description = Column(Text, nullable=True)     # What changes in this scenario
    assumptions = Column(Text, nullable=True)            # JSON list of key assumptions
    expected_effect = Column(Text, nullable=True)        # Projected business impact
    # risk_level: low|medium|high|critical
    risk_level = Column(String(20), nullable=False, default="medium")
    probability_pct = Column(Float, nullable=True, default=50.0)  # 0–100
    outcome_description = Column(Text, nullable=True)    # Actual outcome (filled retroactively)
    period_reference = Column(String(100), nullable=True)  # e.g. "Q2 2026"
    # status: draft|active|evaluated
    status = Column(String(20), nullable=False, default="draft")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_scenarios_workspace_status", "workspace_id", "status"),
    )
