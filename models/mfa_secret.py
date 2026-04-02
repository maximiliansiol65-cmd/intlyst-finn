"""
MFA Secret model — stores TOTP secrets per user.
"""
import os
from datetime import datetime

from cryptography.fernet import Fernet
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from models.base import Base

# Encryption key for TOTP secrets. Must be set in production.
_FERNET_KEY = os.getenv("MFA_ENCRYPTION_KEY", "").encode()
_fernet: "Fernet | None" = None


def _get_fernet() -> "Fernet":
    global _fernet
    if _fernet is None:
        key = _FERNET_KEY
        if not key or len(key) < 32:
            # Generate a deterministic dev key derived from JWT_SECRET to avoid empty-key errors.
            import base64
            import hashlib
            jwt_secret = os.getenv("JWT_SECRET", "dev-fallback-not-secure").encode()
            derived = hashlib.sha256(jwt_secret).digest()
            key = base64.urlsafe_b64encode(derived)
        _fernet = Fernet(key)
    return _fernet


def encrypt_secret(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_secret(cipher: str) -> str:
    return _get_fernet().decrypt(cipher.encode()).decode()


class MfaSecret(Base):
    __tablename__ = "mfa_secrets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    totp_secret_enc = Column(String, nullable=False)   # Fernet-encrypted TOTP secret
    is_enabled = Column(Boolean, default=False, nullable=False)
    backup_codes_json = Column(Text, nullable=True)    # JSON list of hashed backup codes
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
