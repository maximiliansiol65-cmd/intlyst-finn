from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from models.base import Base

class EmailPreferences(Base):
    __tablename__ = "email_preferences"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    # Welche E-Mails sollen gesendet werden
    enabled           = Column(Boolean, default=True)   # Master-Switch
    alerts            = Column(Boolean, default=True)   # Kritische Alerts
    goals             = Column(Boolean, default=True)   # Ziel-Fortschritt
    recommendations   = Column(Boolean, default=True)   # Empfehlungen
    reports           = Column(Boolean, default=False)  # Tägliche Reports
    weekly_summary    = Column(Boolean, default=True)   # Wöchentliche Zusammenfassung
    anomalies         = Column(Boolean, default=True)   # Anomalie-Erkennungen

    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String, nullable=False, index=True)
    code       = Column(String(6), nullable=False)
    used       = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
