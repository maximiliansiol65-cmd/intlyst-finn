from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String

from models.base import Base


class Funnel(Base):
    __tablename__ = "funnels"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    status      = Column(String(20),  nullable=False, default="active")   # active | archived
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FunnelStep(Base):
    __tablename__ = "funnel_steps"

    id            = Column(Integer, primary_key=True, index=True)
    funnel_id     = Column(Integer, ForeignKey("funnels.id", ondelete="CASCADE"), nullable=False, index=True)
    order         = Column(Integer, nullable=False)               # 1, 2, 3 …
    name          = Column(String(200), nullable=False)
    description   = Column(String(500), nullable=True)
    visitors      = Column(Integer, default=0)                    # Personen, die diesen Schritt erreicht haben
    conversions   = Column(Integer, default=0)                    # Personen, die den nächsten Schritt erreicht haben
    expected_rate = Column(Float, nullable=True)                  # Ziel-Conversionrate %
    created_at    = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_funnel_steps_funnel_order", "funnel_id", "order"),
    )
