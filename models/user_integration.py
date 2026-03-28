import json
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, ForeignKey, UniqueConstraint
from models.base import Base


class UserIntegration(Base):
    __tablename__ = "user_integrations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    integration_type = Column(String, nullable=False)   # "google_analytics", "shopify", ...
    is_active = Column(Boolean, default=False)
    credentials_json = Column(Text, nullable=True)      # JSON string, field names vary per type
    last_synced_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "integration_type", name="uq_user_integration"),
    )

    def get_credentials(self) -> dict:
        if not self.credentials_json:
            return {}
        try:
            return json.loads(self.credentials_json)
        except Exception:
            return {}

    def set_credentials(self, data: dict):
        self.credentials_json = json.dumps(data)
