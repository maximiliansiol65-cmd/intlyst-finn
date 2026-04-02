"""
UserSession model — tracks active JWT sessions for revocation + session-duration control.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from models.base import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    workspace_id = Column(Integer, nullable=True, index=True)
    token_jti = Column(String, nullable=False, unique=True, index=True)   # JWT ID for revocation
    expires_at = Column(DateTime, nullable=False)
    session_duration_hours = Column(Integer, nullable=False, default=168)  # 24 or 168
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
