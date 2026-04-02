from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, UniqueConstraint, Index

from models.base import Base


class RecommendationPolicy(Base):
    """
    Speichert Lerngewichte pro Empfehlungs-Arm (z.B. Kategorie/Strategietyp).

    Die Werte werden deterministisch aus Outcomes neu berechnet (kein Double-Count),
    können aber auch inkrementell aktualisiert werden.
    """

    __tablename__ = "recommendation_policies"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    arm = Column(String, nullable=False, index=True)  # z.B. "marketing", "sales", "retention"

    shown_count = Column(Integer, nullable=False, default=0)
    accepted_count = Column(Integer, nullable=False, default=0)
    completed_count = Column(Integer, nullable=False, default=0)

    reward_sum = Column(Float, nullable=False, default=0.0)
    avg_reward = Column(Float, nullable=False, default=0.0)
    weight = Column(Float, nullable=False, default=1.0)  # Multiplikator für Ranking/Priorisierung

    last_reward = Column(Float, nullable=False, default=0.0)
    last_outcome_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "arm", name="uq_policy_workspace_arm"),
        Index("ix_policy_workspace_arm", "workspace_id", "arm"),
    )
