from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Index, Integer, String, Text

from models.base import Base


class ForecastRecord(Base):
    """
    Persistent forecast storage. Wraps the output of analytics/forecasting.py
    so forecasts can be versioned, compared against actuals, and used for AI learning.
    """

    __tablename__ = "forecast_records"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    kpi_id = Column(Integer, nullable=True)              # FK to custom_kpis (nullable for built-in KPIs)
    kpi_name = Column(String(200), nullable=False)       # e.g. "revenue", "traffic", custom KPI name
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    baseline_value = Column(Float, nullable=True)        # Current / last known value
    forecast_value = Column(Float, nullable=True)        # Expected value at period_end
    best_case = Column(Float, nullable=True)
    worst_case = Column(Float, nullable=True)
    confidence_range = Column(Text, nullable=True)       # JSON {"lower": x, "upper": y}
    model_version = Column(String(50), nullable=True)    # e.g. "ets_v1", "sarimax_v2"
    model_weights = Column(Text, nullable=True)          # JSON model ensemble weights
    trend = Column(String(20), nullable=True)            # up|down|stable
    growth_pct = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True, default=70.0)  # 0–100
    linked_insight_id = Column(Integer, nullable=True)   # FK to insights
    linked_scenario_ids = Column(Text, nullable=True)    # JSON array of scenario IDs
    # actual_value filled in later when real data arrives
    actual_value = Column(Float, nullable=True)
    accuracy_pct = Column(Float, nullable=True)          # Filled after period_end passes
    generated_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_forecast_records_workspace_kpi", "workspace_id", "kpi_name"),
        Index("ix_forecast_records_workspace_period", "workspace_id", "period_end"),
    )
