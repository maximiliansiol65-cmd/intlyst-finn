from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, Index

from models.base import Base


class CustomKPI(Base):
    """
    Nutzerdefinierte KPI mit Formel-Engine.

    formula_type:
      - simple      → avg oder sum einer Metric
      - ratio       → numerator_metric / denominator_metric × multiplier
      - difference  → metric_a − metric_b
      - growth      → (Ø letzte N Tage − Ø vorherige N Tage) / Ø vorherige × 100
      - compound    → gewichtete Summe mehrerer Metriken

    formula_config (JSON):
      simple:     {"metric": "revenue", "aggregation": "avg"}
      ratio:      {"numerator": "revenue", "denominator": "traffic", "multiplier": 1.0}
      difference: {"metric_a": "revenue", "metric_b": "conversions", "multiplier": 1.0}
      growth:     {"metric": "revenue", "window_days": 30}
      compound:   {"components": [{"metric": "revenue", "weight": 0.6},
                                  {"metric": "new_customers", "weight": 0.4}]}
    """
    __tablename__ = "custom_kpis"

    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(200), nullable=False)
    description     = Column(String(500), nullable=True)
    formula_type    = Column(String(30),  nullable=False)
    formula_config  = Column(Text,        nullable=False)   # JSON
    unit            = Column(String(20),  default="")       # €, %, # usw.
    target          = Column(Float,       nullable=True)     # Zielwert
    alert_below     = Column(Float,       nullable=True)     # Alert wenn Wert darunter fällt
    alert_above     = Column(Float,       nullable=True)     # Alert wenn Wert darüber steigt
    window_days     = Column(Integer,     default=30)        # Berechnungszeitraum
    is_active       = Column(Boolean,     default=True)
    sort_order      = Column(Integer,     default=0)
    created_at      = Column(DateTime,    default=datetime.utcnow)
    updated_at      = Column(DateTime,    default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_custom_kpis_active", "is_active"),
    )
