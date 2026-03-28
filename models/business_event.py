"""
Business Events — Ereignisse die das Unternehmen beeinflussen.

Beispiele: Preiserhöhung, Kampagnenstart, Produktlaunch, Presseartikel,
           Umzug, Mitarbeiterausfall, externe Marktveränderung.

Der BusinessEvent wird in der Kausalitätsanalyse (Schicht 4) verwendet
um anomale Metriken zu erklären.
"""

from datetime import datetime

from sqlalchemy import Column, DateTime, Index, Integer, String

from models.base import Base


class BusinessEvent(Base):
    __tablename__ = "business_events"

    id          = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)

    event_date  = Column(String, nullable=False)   # ISO-Datum "YYYY-MM-DD"
    title       = Column(String(200), nullable=False)
    description = Column(String(1000), nullable=True)

    # Kategorie: marketing | pricing | product | operations | external | other
    category    = Column(String(50), nullable=False, default="other")

    # Erwarteter Impact: positive | negative | neutral | unknown
    expected_impact = Column(String(20), nullable=True, default="unknown")

    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_business_events_workspace_date", "workspace_id", "event_date"),
    )
