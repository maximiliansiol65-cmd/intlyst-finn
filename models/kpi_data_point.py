from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Index, Integer, String

from models.base import Base


class KPIDataPoint(Base):
    """Time-series storage for KPI values. Powers dashboards, trend analysis, and forecasting."""

    __tablename__ = "kpi_data_points"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    kpi_id = Column(Integer, nullable=False, index=True)          # FK to custom_kpis or built-in KPI key
    kpi_name = Column(String(200), nullable=True)                 # Denormalized name for quick reads
    recorded_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    value = Column(Float, nullable=False)
    source = Column(String(100), nullable=True)                   # manual|ga4|shopify|api|calculated
    comparison_value = Column(Float, nullable=True)               # Value from prior comparable period
    change_pct = Column(Float, nullable=True)                     # % change vs comparison_value
    # trend_direction: up|down|stable
    trend_direction = Column(String(10), nullable=True, default="stable")
    # quality_score: 0–100 (confidence in data quality)
    quality_score = Column(Float, nullable=True, default=100.0)

    __table_args__ = (
        Index("ix_kpi_data_points_workspace_kpi_date", "workspace_id", "kpi_id", "recorded_at"),
    )
