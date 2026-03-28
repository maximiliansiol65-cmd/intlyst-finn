"""Stripe Billing backend with checkout, portal, invoices, webhook, and dev activation."""
import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Optional, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String
from sqlalchemy.orm import Session

from database import get_db
from models.base import Base
from security_config import is_configured_secret, is_production_environment
from api.auth_routes import User, get_current_user, get_current_workspace_id

router = APIRouter(prefix="/api/billing", tags=["billing"])
logger = logging.getLogger("audit")

STRIPE_API = "https://api.stripe.com/v1"

# Webhook-Timestamps dürfen maximal 5 Minuten alt sein
WEBHOOK_TOLERANCE_SECONDS = 300


PLANS = {
    "standard": {
        "name": "Standard",
        "price": 29.0,
        "currency": "eur",
        "interval": "month",
        "description": "Fuer Einzelunternehmer und Freelancer",
        "features": [
            "KI-Dashboard & Insights",
            "Alerts & Anomalie-Erkennung",
            "5 Integrationen",
            "CSV Import/Export",
            "Prognosen (30 Tage)",
        ],
        "max_users": 1,
        "highlight": False,
        "stripe_price": os.getenv("STRIPE_PRICE_STANDARD", ""),
    },
    "team_standard": {
        "name": "Team Standard",
        "price": 79.0,
        "currency": "eur",
        "interval": "month",
        "description": "Fuer kleine Teams bis 5 Personen",
        "features": [
            "Alles in Standard",
            "5 Team-Mitglieder",
            "Task-Board & Zuweisung",
            "Branchenvergleich",
            "Standortanalyse",
            "Prognosen (60 Tage)",
        ],
        "max_users": 5,
        "highlight": True,
        "stripe_price": os.getenv("STRIPE_PRICE_TEAM_STANDARD", ""),
    },
    "team_pro": {
        "name": "Team Pro",
        "price": 129.0,
        "currency": "eur",
        "interval": "month",
        "description": "Fuer wachsende Unternehmen",
        "features": [
            "Alles in Team Standard",
            "Unbegrenzte Mitglieder",
            "Kundenanalyse (RFM)",
            "Google Maps Integration",
            "HubSpot CRM",
            "Prognosen (90 Tage)",
            "API-Zugang",
            "Priority Support",
        ],
        "max_users": -1,
        "highlight": False,
        "stripe_price": os.getenv("STRIPE_PRICE_TEAM_PRO", ""),
    },
}


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, default=1)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    plan = Column(String, nullable=False, default="trial")
    status = Column(String, nullable=False, default="trialing")
    stripe_customer_id = Column(String, nullable=True, unique=True)
    stripe_sub_id = Column(String, nullable=True, unique=True)
    stripe_price_id = Column(String, nullable=True)
    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)
    amount_paid = Column(Float, default=0.0)
    currency = Column(String, default="eur")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlanFeature(BaseModel):
    key: str
    name: str
    price: float
    currency: str
    interval: str
    description: str
    features: list[str]
    max_users: int
    highlight: bool
    stripe_price: str
    available: bool


class SubscriptionStatus(BaseModel):
    plan: str
    plan_name: str
    plan_price: float
    status: str
    is_active: bool
    stripe_customer_id: Optional[str]
    stripe_sub_id: Optional[str]
    current_period_end: Optional[str]
    cancel_at_period_end: bool
    features: list[str]
    max_users: int
    days_remaining: Optional[int]


class CheckoutRequest(BaseModel):
    plan: str
    success_url: str
    cancel_url: str
    customer_email: Optional[str] = None


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


def _as_text(value: object) -> Optional[str]:
    if value is None:
        return None
    return str(cast(Any, value))


def _as_bool(value: object) -> bool:
    return bool(cast(Any, value))


def _as_datetime(value: object) -> Optional[datetime]:
    coerced = cast(Any, value)
    return coerced if isinstance(coerced, datetime) else None


def _set_attr(instance: Subscription, attribute: str, value: object) -> None:
    setattr(instance, attribute, value)


def get_stripe_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not is_configured_secret(key, prefixes=("sk_",), min_length=12):
        raise HTTPException(
            status_code=400,
            detail="STRIPE_SECRET_KEY nicht konfiguriert.",
        )
    return key


async def stripe_post(path: str, data: dict) -> dict:
    key = get_stripe_key()
    encoded: dict[str, str] = {k: str(v) for k, v in data.items()}

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{STRIPE_API}{path}",
            auth=(key, ""),
            data=encoded,
        )

    if response.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Zahlungsanbieter nicht erreichbar.")
    return response.json()


async def stripe_get(path: str, params: Optional[dict] = None) -> dict:
    key = get_stripe_key()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{STRIPE_API}{path}",
            auth=(key, ""),
            params=params or {},
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Zahlungsanbieter nicht erreichbar.")
    return response.json()


def verify_stripe_signature(payload: bytes, sig_header: str, secret: str) -> bool:
    """Verifiziert Stripe Webhook Signatur inkl. Timestamp-Prüfung gegen Replay-Angriffe."""
    if not is_configured_secret(secret, prefixes=("whsec_",), min_length=12):
        logger.warning("WEBHOOK_INVALID_SECRET: kein gueltiges whsec_ konfiguriert")
        return False

    try:
        elements: dict[str, str] = {}
        v1_signatures: list[str] = []
        for part in sig_header.split(","):
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            if k == "v1":
                v1_signatures.append(v)
            else:
                elements[k] = v

        timestamp_str = elements.get("t", "")
        if not timestamp_str:
            logger.warning("WEBHOOK_MISSING_TIMESTAMP")
            return False

        timestamp = int(timestamp_str)
        age = int(time.time()) - timestamp
        if abs(age) > WEBHOOK_TOLERANCE_SECONDS:
            logger.warning("WEBHOOK_REPLAY_ATTACK: timestamp=%s age=%ss", timestamp, age)
            return False

        signed_payload = f"{timestamp_str}.{payload.decode()}"
        expected = hmac.new(
            secret.encode(),
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()

        return any(hmac.compare_digest(expected, sig) for sig in v1_signatures)
    except Exception as exc:
        logger.error("WEBHOOK_VERIFY_ERROR: %s", exc)
        return False


def get_or_create_subscription(db: Session, user_id: int = 1, workspace_id: Optional[int] = None) -> Subscription:
    query = db.query(Subscription).filter(Subscription.user_id == user_id)
    if workspace_id is not None:
        query = query.filter(Subscription.workspace_id == workspace_id)
    subscription = query.first()
    if not subscription:
        subscription = Subscription(
            user_id=user_id,
            workspace_id=workspace_id or 1,
            plan="trial",
            status="trialing",
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
    return subscription


# ── Öffentlicher Endpunkt: Pläne auflisten ────────────────────────────────────

@router.get("/plans", response_model=list[PlanFeature])
def get_plans():
    """Pläne sind öffentlich sichtbar – kein Auth nötig."""
    return [
        PlanFeature(
            key=plan_key,
            available=bool(plan_data["stripe_price"]),
            **{k: plan_data[k] for k in ["name", "price", "currency", "interval",
                                          "description", "features", "max_users",
                                          "highlight", "stripe_price"]},
        )
        for plan_key, plan_data in PLANS.items()
    ]


# ── Geschützte Endpunkte ──────────────────────────────────────────────────────

@router.get("/status", response_model=SubscriptionStatus)
def get_billing_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)
    current_plan = _as_text(subscription.plan) or "standard"
    plan_data = PLANS.get(current_plan, PLANS["standard"])

    subscription_status = _as_text(subscription.status) or "trialing"
    current_period_end = _as_datetime(subscription.current_period_end)
    stripe_customer_id = _as_text(subscription.stripe_customer_id)
    stripe_sub_id = _as_text(subscription.stripe_sub_id)
    cancel_at_period_end = _as_bool(subscription.cancel_at_period_end)
    is_active = subscription_status in ("active", "trialing")

    days_remaining = None
    if current_period_end is not None:
        delta = current_period_end - datetime.utcnow()
        days_remaining = max(0, delta.days)

    return SubscriptionStatus(
        plan=current_plan,
        plan_name=plan_data["name"] if current_plan != "trial" else "Trial",
        plan_price=plan_data["price"] if current_plan != "trial" else 0.0,
        status=subscription_status,
        is_active=is_active,
        stripe_customer_id=stripe_customer_id,
        stripe_sub_id=stripe_sub_id,
        current_period_end=str(current_period_end) if current_period_end is not None else None,
        cancel_at_period_end=cancel_at_period_end,
        features=plan_data.get("features", []),
        max_users=plan_data.get("max_users", 1),
        days_remaining=days_remaining,
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    if body.plan not in PLANS:
        raise HTTPException(
            status_code=400,
            detail=f"Plan ungueltig. Erlaubt: {list(PLANS.keys())}",
        )

    # URLs dürfen nur https:// oder localhost enthalten
    for url_field in (body.success_url, body.cancel_url):
        if not (url_field.startswith("https://") or url_field.startswith("http://localhost")):
            raise HTTPException(status_code=400, detail="Ungültige Redirect-URL.")

    plan_data = PLANS[body.plan]
    price_id = plan_data["stripe_price"]

    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"STRIPE_PRICE_{body.plan.upper()} nicht konfiguriert.",
        )

    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)

    checkout_data = {
        "mode": "subscription",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "success_url": body.success_url,
        "cancel_url": body.cancel_url,
        "payment_method_types[0]": "card",
        "billing_address_collection": "auto",
        "allow_promotion_codes": "true",
    }

    customer_email = body.customer_email or current_user.email
    checkout_data["customer_email"] = customer_email

    stripe_customer_id = _as_text(subscription.stripe_customer_id)
    if stripe_customer_id:
        checkout_data["customer"] = stripe_customer_id
        del checkout_data["customer_email"]

    session = await stripe_post("/checkout/sessions", checkout_data)
    logger.info("CHECKOUT_CREATED user_id=%s plan=%s", current_user.id, body.plan)

    return CheckoutResponse(
        checkout_url=session["url"],
        session_id=session["id"],
    )


@router.post("/portal")
async def create_portal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)

    stripe_customer_id = _as_text(subscription.stripe_customer_id)
    if not stripe_customer_id:
        raise HTTPException(
            status_code=404,
            detail="Kein Stripe-Kunde gefunden. Bitte erst ein Abo abschliessen.",
        )

    return_url = os.getenv("FRONTEND_URL", "http://localhost:5173") + "/settings"
    session = await stripe_post(
        "/billing_portal/sessions",
        {"customer": stripe_customer_id, "return_url": return_url},
    )

    return {"portal_url": session["url"]}


@router.post("/cancel")
async def cancel_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)

    stripe_sub_id = _as_text(subscription.stripe_sub_id)
    if not stripe_sub_id:
        raise HTTPException(status_code=404, detail="Kein aktives Abo gefunden.")

    await stripe_post(
        f"/subscriptions/{stripe_sub_id}",
        {"cancel_at_period_end": "true"},
    )

    _set_attr(subscription, "cancel_at_period_end", True)
    db.commit()
    logger.info("SUBSCRIPTION_CANCEL user_id=%s", current_user.id)

    return {
        "message": "Abo wird zum Ende des Abrechnungszeitraums gekuendigt.",
        "ends_at": str(_as_datetime(subscription.current_period_end)),
    }


@router.post("/reactivate")
async def reactivate_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)

    stripe_sub_id = _as_text(subscription.stripe_sub_id)
    if not stripe_sub_id:
        raise HTTPException(status_code=404, detail="Kein Abo gefunden.")

    await stripe_post(
        f"/subscriptions/{stripe_sub_id}",
        {"cancel_at_period_end": "false"},
    )

    _set_attr(subscription, "cancel_at_period_end", False)
    db.commit()
    return {"message": "Abo reaktiviert."}


@router.get("/invoices")
async def get_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)

    stripe_customer_id = _as_text(subscription.stripe_customer_id)
    if not stripe_customer_id:
        return {"invoices": [], "message": "Kein Stripe-Kunde gefunden."}

    data = await stripe_get(
        "/invoices",
        {"customer": stripe_customer_id, "limit": "10"},
    )

    invoices = []
    for invoice in data.get("data", []):
        invoices.append({
            "id": invoice.get("id"),
            "number": invoice.get("number"),
            "amount_paid": invoice.get("amount_paid", 0) / 100,
            "currency": invoice.get("currency", "eur").upper(),
            "status": invoice.get("status"),
            "created": datetime.fromtimestamp(invoice.get("created", 0)).strftime("%d.%m.%Y"),
            "pdf_url": invoice.get("invoice_pdf"),
            "hosted_url": invoice.get("hosted_invoice_url"),
        })

    return {"invoices": invoices}


# ── Webhook (kein User-Auth, aber Stripe-Signatur) ────────────────────────────

@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    body = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    if not verify_stripe_signature(body, sig_header, secret):
        logger.warning("WEBHOOK_REJECTED ip=%s", request.client.host if request.client else "unknown")
        raise HTTPException(status_code=400, detail="Ungueltige Webhook-Signatur.")

    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Ungueltiges JSON.")

    event_type = event.get("type", "")
    obj = event.get("data", {}).get("object", {})
    logger.info("WEBHOOK_RECEIVED type=%s", event_type)

    customer_id = obj.get("customer")
    stripe_sub_id = obj.get("subscription") or obj.get("id")
    subscription = None
    if customer_id:
        subscription = db.query(Subscription).filter(Subscription.stripe_customer_id == customer_id).first()
    if not subscription and stripe_sub_id:
        subscription = db.query(Subscription).filter(Subscription.stripe_sub_id == stripe_sub_id).first()
    if not subscription:
        subscription = get_or_create_subscription(db)

    if event_type == "checkout.session.completed":
        customer_id = obj.get("customer")
        stripe_sub_id = obj.get("subscription")

        _set_attr(subscription, "stripe_customer_id", customer_id)
        _set_attr(subscription, "stripe_sub_id", stripe_sub_id)
        _set_attr(subscription, "status", "active")

        if stripe_sub_id:
            subscription_data = await stripe_get(f"/subscriptions/{stripe_sub_id}")
            price_id = (subscription_data
                        .get("items", {})
                        .get("data", [{}])[0]
                        .get("price", {})
                        .get("id", ""))

            for plan_key, plan_data in PLANS.items():
                if plan_data["stripe_price"] == price_id:
                    _set_attr(subscription, "plan", plan_key)
                    _set_attr(subscription, "stripe_price_id", price_id)
                    break

            period_end = subscription_data.get("current_period_end")
            if period_end:
                _set_attr(subscription, "current_period_end", datetime.fromtimestamp(period_end))

        db.commit()

    elif event_type == "invoice.payment_succeeded":
        _set_attr(subscription, "status", "active")
        _set_attr(subscription, "amount_paid", obj.get("amount_paid", 0) / 100)
        period_end = obj.get("lines", {}).get("data", [{}])[0].get("period", {}).get("end")
        if period_end:
            _set_attr(subscription, "current_period_end", datetime.fromtimestamp(period_end))
        db.commit()

    elif event_type == "invoice.payment_failed":
        _set_attr(subscription, "status", "past_due")
        db.commit()

    elif event_type == "customer.subscription.updated":
        stripe_status = obj.get("status")
        if stripe_status:
            _set_attr(subscription, "status", stripe_status)
        _set_attr(subscription, "cancel_at_period_end", obj.get("cancel_at_period_end", False))
        period_end = obj.get("current_period_end")
        if period_end:
            _set_attr(subscription, "current_period_end", datetime.fromtimestamp(period_end))
        db.commit()

    elif event_type == "customer.subscription.deleted":
        _set_attr(subscription, "status", "canceled")
        _set_attr(subscription, "plan", "trial")
        db.commit()

    return {"received": True, "event_type": event_type}


# ── Plan wechseln ────────────────────────────────────────────────────────────

class ChangePlanRequest(BaseModel):
    plan: str

@router.patch("/plan")
def change_plan(
    body: ChangePlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Plan direkt wechseln (ohne Stripe). In Produktion würde hier ein Checkout stattfinden."""
    if body.plan not in PLANS and body.plan != "trial":
        raise HTTPException(status_code=400, detail=f"Ungültiger Plan: {list(PLANS.keys())}")

    from datetime import timedelta
    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)
    _set_attr(subscription, "plan", body.plan)
    _set_attr(subscription, "status", "active" if body.plan != "trial" else "trialing")
    _set_attr(subscription, "current_period_start", datetime.utcnow())
    _set_attr(subscription, "current_period_end", datetime.utcnow() + timedelta(days=30))
    _set_attr(subscription, "cancel_at_period_end", False)
    db.commit()
    plan_data = PLANS.get(body.plan, {})
    return {"message": f"Plan gewechselt zu {body.plan}.", "plan": body.plan, "plan_name": plan_data.get("name", body.plan)}


# ── Dev-only Endpunkt ─────────────────────────────────────────────────────────

@router.post("/dev/activate")
def dev_activate_plan(
    plan: str = "team_standard",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Nur fuer Entwicklung – aktiviert einen Plan ohne echten Stripe-Checkout."""
    if is_production_environment():
        raise HTTPException(status_code=403, detail="In Produktion nicht verfuegbar.")

    if plan not in PLANS:
        raise HTTPException(status_code=400, detail=f"Plan ungueltig: {list(PLANS.keys())}")

    from datetime import timedelta
    subscription = get_or_create_subscription(db, user_id=current_user.id, workspace_id=workspace_id)
    _set_attr(subscription, "plan", plan)
    _set_attr(subscription, "status", "active")
    _set_attr(subscription, "current_period_start", datetime.utcnow())
    _set_attr(subscription, "current_period_end", datetime.utcnow() + timedelta(days=30))
    _set_attr(subscription, "cancel_at_period_end", False)
    db.commit()

    logger.info("DEV_ACTIVATE user_id=%s plan=%s", current_user.id, plan)
    return {
        "message": f"Plan '{PLANS[plan]['name']}' aktiviert (Dev-Modus).",
        "plan": plan,
        "status": "active",
    }
