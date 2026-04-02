"""
MFA routes — TOTP setup, verification and disable.

POST /api/auth/mfa/setup   → generate TOTP secret + QR URI
POST /api/auth/mfa/verify  → confirm TOTP code (enables MFA)
POST /api/auth/mfa/disable → disable MFA (requires CEO/manager or own account)
POST /api/auth/mfa/confirm → verify a TOTP code during login
"""
import hashlib
import json
import os
import secrets
from datetime import datetime

import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from models.mfa_secret import MfaSecret, decrypt_secret, encrypt_secret

router = APIRouter(prefix="/api/auth/mfa", tags=["mfa"])

_BACKUP_CODE_COUNT = 10


def _hash_backup(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


# ── Schemas ──────────────────────────────────────────────────────────────────

class MfaVerifyBody(BaseModel):
    totp_code: str


class MfaConfirmBody(BaseModel):
    totp_code: str


class MfaDisableBody(BaseModel):
    totp_code: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_none(db: Session, user_id: int) -> MfaSecret | None:
    return db.query(MfaSecret).filter(MfaSecret.user_id == user_id).first()


def is_mfa_enabled(db: Session, user_id: int) -> bool:
    row = _get_or_none(db, user_id)
    return bool(row and row.is_enabled)


def verify_totp_or_backup(db: Session, user_id: int, code: str) -> bool:
    """Returns True if the code is a valid TOTP token OR an unused backup code."""
    row = _get_or_none(db, user_id)
    if not row or not row.is_enabled:
        return False
    secret = decrypt_secret(row.totp_secret_enc)
    totp = pyotp.TOTP(secret)
    if totp.verify(code, valid_window=1):
        return True
    # Check backup codes
    if row.backup_codes_json:
        codes: list[str] = json.loads(row.backup_codes_json)
        hashed = _hash_backup(code)
        if hashed in codes:
            # Consume the backup code
            codes.remove(hashed)
            row.backup_codes_json = json.dumps(codes)
            row.updated_at = datetime.utcnow()
            db.commit()
            return True
    return False


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/setup")
def setup_mfa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a TOTP secret. Does NOT enable MFA yet — user must verify first."""
    existing = _get_or_none(db, current_user.id)
    if existing and existing.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA ist bereits aktiviert. Erst deaktivieren.",
        )

    raw_secret = pyotp.random_base32()
    enc_secret = encrypt_secret(raw_secret)

    if existing:
        existing.totp_secret_enc = enc_secret
        existing.is_enabled = False
        existing.updated_at = datetime.utcnow()
    else:
        db.add(MfaSecret(user_id=current_user.id, totp_secret_enc=enc_secret, is_enabled=False))
    db.commit()

    app_name = os.getenv("APP_NAME", "Intlyst")
    totp = pyotp.TOTP(raw_secret)
    provisioning_uri = totp.provisioning_uri(name=current_user.email, issuer_name=app_name)

    return {
        "provisioning_uri": provisioning_uri,
        "secret": raw_secret,  # shown once so user can enter manually into authenticator
        "message": "Scanne den QR-Code und bestätige mit /api/auth/mfa/verify.",
    }


@router.post("/verify")
def verify_and_enable_mfa(
    body: MfaVerifyBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify the TOTP code and permanently enable MFA for this user."""
    row = _get_or_none(db, current_user.id)
    if not row:
        raise HTTPException(status_code=400, detail="MFA-Setup noch nicht initialisiert.")
    if row.is_enabled:
        raise HTTPException(status_code=400, detail="MFA ist bereits aktiv.")

    secret = decrypt_secret(row.totp_secret_enc)
    totp = pyotp.TOTP(secret)
    if not totp.verify(body.totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Ungültiger TOTP-Code.")

    backup_codes_plain = [secrets.token_hex(5).upper() for _ in range(_BACKUP_CODE_COUNT)]
    row.is_enabled = True
    row.backup_codes_json = json.dumps([_hash_backup(c) for c in backup_codes_plain])
    row.updated_at = datetime.utcnow()
    db.commit()

    return {
        "message": "MFA erfolgreich aktiviert.",
        "backup_codes": backup_codes_plain,  # shown only once — user must save these
    }


@router.post("/confirm")
def confirm_mfa(
    body: MfaConfirmBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify a TOTP code mid-login (second factor)."""
    if not verify_totp_or_backup(db, current_user.id, body.totp_code):
        raise HTTPException(status_code=401, detail="Ungültiger oder abgelaufener MFA-Code.")
    return {"message": "MFA bestätigt.", "verified": True}


@router.post("/disable")
def disable_mfa(
    body: MfaDisableBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable MFA — requires a valid TOTP code as confirmation."""
    row = _get_or_none(db, current_user.id)
    if not row or not row.is_enabled:
        raise HTTPException(status_code=400, detail="MFA ist nicht aktiv.")

    secret = decrypt_secret(row.totp_secret_enc)
    totp = pyotp.TOTP(secret)
    if not totp.verify(body.totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Ungültiger TOTP-Code — MFA nicht deaktiviert.")

    row.is_enabled = False
    row.backup_codes_json = None
    row.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "MFA wurde deaktiviert."}


@router.get("/status")
def mfa_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check whether MFA is enabled for the current user."""
    row = _get_or_none(db, current_user.id)
    return {"mfa_enabled": bool(row and row.is_enabled)}
