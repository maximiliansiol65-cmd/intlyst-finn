"""
User-Integrations: Verbinde externe Dienste (Shopify, Stripe, Google Analytics, etc.)
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from models.user_integration import UserIntegration

router = APIRouter(prefix="/api/user-integrations", tags=["user-integrations"])
logger = logging.getLogger("integrations")

# ── Supported integration types ───────────────────────────────────────────────
VALID_TYPES = {
    "google_analytics",
    "shopify",
    "stripe",
    "instagram",
    "meta_ads",
    "woocommerce",
    "mailchimp",
    "hubspot",
    "webhook",
    "slack",
    "notion",
    "trello",
    "csv",
}


# ── Schemas ───────────────────────────────────────────────────────────────────
class IntegrationCredentials(BaseModel):
    credentials: dict


class IntegrationOut(BaseModel):
    integration_type: str
    is_active: bool
    last_synced_at: Optional[str]
    error_message: Optional[str]
    # Return only non-sensitive field keys (not values) so frontend knows what's configured
    configured_fields: list[str]

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────
def _mask_credentials(creds: dict) -> list[str]:
    """Return list of field names that are set (not empty)."""
    return [k for k, v in creds.items() if v]


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("", response_model=list[IntegrationOut])
def list_integrations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.query(UserIntegration).filter(UserIntegration.user_id == current_user.id).all()
    result = []
    for row in rows:
        creds = row.get_credentials()
        result.append(IntegrationOut(
            integration_type=row.integration_type,
            is_active=row.is_active,
            last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
            error_message=row.error_message,
            configured_fields=_mask_credentials(creds),
        ))
    return result


@router.post("/{integration_type}")
def save_integration(
    integration_type: str,
    body: IntegrationCredentials,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if integration_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Unbekannter Integrationstyp: {integration_type}")

    # Sanitise: remove empty strings
    creds = {k: v for k, v in body.credentials.items() if v and str(v).strip()}
    if not creds:
        raise HTTPException(status_code=400, detail="Keine Zugangsdaten angegeben.")

    row = db.query(UserIntegration).filter(
        UserIntegration.user_id == current_user.id,
        UserIntegration.integration_type == integration_type,
    ).first()

    if row:
        row.set_credentials(creds)
        row.is_active = True
        row.error_message = None
        row.updated_at = datetime.utcnow()
    else:
        row = UserIntegration(
            user_id=current_user.id,
            integration_type=integration_type,
            is_active=True,
        )
        row.set_credentials(creds)
        db.add(row)

    db.commit()
    logger.info("Integration gespeichert: user=%s type=%s", current_user.id, integration_type)
    return {"status": "ok", "integration_type": integration_type, "is_active": True}


@router.delete("/{integration_type}")
def disconnect_integration(
    integration_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(UserIntegration).filter(
        UserIntegration.user_id == current_user.id,
        UserIntegration.integration_type == integration_type,
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Integration nicht gefunden.")

    db.delete(row)
    db.commit()
    logger.info("Integration getrennt: user=%s type=%s", current_user.id, integration_type)
    return {"status": "ok", "integration_type": integration_type, "is_active": False}


@router.get("/{integration_type}/status")
def get_integration_status(
    integration_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.query(UserIntegration).filter(
        UserIntegration.user_id == current_user.id,
        UserIntegration.integration_type == integration_type,
    ).first()

    if not row:
        return {"integration_type": integration_type, "is_active": False, "configured_fields": []}

    creds = row.get_credentials()
    return IntegrationOut(
        integration_type=row.integration_type,
        is_active=row.is_active,
        last_synced_at=row.last_synced_at.isoformat() if row.last_synced_at else None,
        error_message=row.error_message,
        configured_fields=_mask_credentials(creds),
    )
