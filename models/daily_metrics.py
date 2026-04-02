from sqlalchemy import Column, Integer, Float, Date, String, DateTime, Index, UniqueConstraint
from datetime import datetime
from models.base import Base

class DailyMetrics(Base):
    __tablename__ = "daily_metrics"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    date = Column(Date, nullable=False)
    period = Column(String, nullable=False, default="daily")  # "daily" or "weekly"

    revenue = Column(Float, default=0.0)
    cost = Column(Float, default=0.0)  # Gesamtkosten
    profit = Column(Float, default=0.0)  # Gewinn (revenue - cost)
    gross_margin = Column(Float, default=0.0)  # Bruttomarge in %
    cashflow = Column(Float, default=0.0)  # Operativer Cashflow
    liquidity = Column(Float, default=0.0)  # Liquidität (z.B. Kontostand)
    traffic = Column(Integer, default=0)
    conversions = Column(Integer, default=0)
    conversion_rate = Column(Float, default=0.0)
    new_customers = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "date", "period", name="uq_workspace_date_period"),
        Index("ix_daily_metrics_date_period", "date", "period"),
        Index("ix_daily_metrics_date", "date"),
        Index("ix_daily_metrics_workspace_date", "workspace_id", "date"),
    )