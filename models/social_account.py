"""
Social Media Accounts — Verbundene Instagram/TikTok-Konten pro Workspace.

Speichert Access-Tokens und Account-Metadaten.
Tokens liegen im Klartext (gleiche Konvention wie GA4-Keys).
Die social_accounts Tabelle wird per Base.metadata.create_all() erstellt.
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String

from models.base import Base


class SocialAccount(Base):
    __tablename__ = "social_accounts"

    id           = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)

    # "instagram" | "tiktok"
    platform     = Column(String(20), nullable=False)

    account_id   = Column(String(100), nullable=True)   # Instagram Business ID / TikTok open_id
    username     = Column(String(100), nullable=True)
    display_name = Column(String(200), nullable=True)

    # Long-lived access token (Instagram: 60-day token; TikTok: refresh token)
    access_token  = Column(String(512), nullable=True)
    refresh_token = Column(String(512), nullable=True)   # TikTok only
    token_expires = Column(DateTime, nullable=True)

    is_active    = Column(Boolean, default=True)
    last_sync_at = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_social_accounts_workspace_platform", "workspace_id", "platform"),
    )
