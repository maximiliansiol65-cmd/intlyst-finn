"""
Integrationen - Stripe + Google Analytics + generischer Webhook
"""

from datetime import date, datetime, timedelta
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from security_config import is_configured_secret
from api.auth_routes import User, get_current_user

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class IntegrationStatus(BaseModel):
    name: str
    connected: bool
    last_sync: Optional[str]
    records_synced: Optional[int]


class StripeSync(BaseModel):
    revenue: float
    transactions: int
    new_customers: int
    period_start: str
    period_end: str


class AnalyticsSync(BaseModel):
    sessions: int
    users: int
    pageviews: int
    bounce_rate: float
    period_start: str
    period_end: str


@router.get("/status", response_model=list[IntegrationStatus])
def get_integration_status(current_user: User = Depends(get_current_user)):
    stripe_key = os.getenv("STRIPE_SECRET_KEY", "")
    ga_key = os.getenv("GOOGLE_ANALYTICS_KEY", "")

    return [
        IntegrationStatus(
            name="Stripe",
            connected=is_configured_secret(stripe_key, prefixes=("sk_",), min_length=12),
            last_sync=None,
            records_synced=None,
        ),
        IntegrationStatus(
            name="Google Analytics",
            connected=bool(ga_key),
            last_sync=None,
            records_synced=None,
        ),
        IntegrationStatus(
            name="CSV Upload",
            connected=True,
            last_sync=str(date.today()),
            records_synced=None,
        ),
        IntegrationStatus(
            name="HubSpot CRM",
            connected=False,
            last_sync=None,
            records_synced=None,
        ),
    ]


@router.post("/stripe/sync", response_model=StripeSync)
async def sync_stripe(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not is_configured_secret(key, prefixes=("sk_",), min_length=12):
        raise HTTPException(
            status_code=400,
            detail="STRIPE_SECRET_KEY fehlt oder ungueltig. In .env setzen: STRIPE_SECRET_KEY=sk_live_...",
        )

    period_start = date.today() - timedelta(days=days)
    period_end = date.today()
    created_gte = int(datetime.combine(period_start, datetime.min.time()).timestamp())

    async with httpx.AsyncClient(timeout=15) as client:
        charges_res = await client.get(
            "https://api.stripe.com/v1/charges",
            auth=(key, ""),
            params={
                "created[gte]": created_gte,
                "limit": 100,
            },
        )

        if charges_res.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Stripe Fehler: {charges_res.text[:200]}")

        charges = charges_res.json().get("data", [])

    revenue = sum(c.get("amount", 0) for c in charges if c.get("paid")) / 100
    transactions = len([c for c in charges if c.get("paid")])
    new_customers = len(set(c.get("customer") for c in charges if c.get("customer")))

    today = date.today()
    today_row = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.date == today, DailyMetrics.period == "daily")
        .first()
    )

    if today_row:
        today_row.revenue = revenue
        today_row.conversions = transactions
        today_row.new_customers = new_customers
        today_row.conversion_rate = (
            round(transactions / max(float(today_row.traffic), 1.0), 4) if today_row.traffic else 0.0
        )
    else:
        db.add(
            DailyMetrics(
                date=today,
                period="daily",
                revenue=revenue,
                traffic=0,
                conversions=transactions,
                conversion_rate=0.0,
                new_customers=new_customers,
            )
        )

    db.commit()

    return StripeSync(
        revenue=round(float(revenue), 2),
        transactions=transactions,
        new_customers=new_customers,
        period_start=str(period_start),
        period_end=str(period_end),
    )


class CsvRow(BaseModel):
    date: str
    revenue: float
    traffic: int
    conversions: int
    new_customers: Optional[int] = 0


class CsvUploadRequest(BaseModel):
    rows: list[CsvRow]


class CsvUploadResponse(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


@router.post("/csv/import", response_model=CsvUploadResponse)
def import_csv(body: CsvUploadRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    imported = 0
    skipped = 0
    errors: list[str] = []

    for row in body.rows:
        try:
            day = date.fromisoformat(row.date)
            conv_rate = round(row.conversions / row.traffic, 4) if row.traffic > 0 else 0.0

            existing = (
                db.query(DailyMetrics)
                .filter(DailyMetrics.date == day, DailyMetrics.period == "daily")
                .first()
            )

            if existing:
                existing.revenue = row.revenue
                existing.traffic = row.traffic
                existing.conversions = row.conversions
                existing.conversion_rate = conv_rate
                existing.new_customers = row.new_customers or 0
                skipped += 1
            else:
                db.add(
                    DailyMetrics(
                        date=day,
                        period="daily",
                        revenue=row.revenue,
                        traffic=row.traffic,
                        conversions=row.conversions,
                        conversion_rate=conv_rate,
                        new_customers=row.new_customers or 0,
                    )
                )
                imported += 1
        except Exception as exc:
            errors.append(f"Zeile {row.date}: {str(exc)}")

    db.commit()
    return CsvUploadResponse(imported=imported, skipped=skipped, errors=errors)


class WebhookPayload(BaseModel):
    source: str
    event: str
    data: dict


@router.post("/webhook")
async def receive_webhook(
    payload: WebhookPayload,
    x_webhook_secret: Optional[str] = Header(None),
    current_user: User = Depends(get_current_user),
):
    expected = os.getenv("WEBHOOK_SECRET", "")
    if not is_configured_secret(expected, min_length=24):
        raise HTTPException(status_code=503, detail="Webhook-Secret ist nicht sicher konfiguriert.")
    if x_webhook_secret != expected:
        raise HTTPException(status_code=401, detail="Ungueltiger Webhook-Secret.")

    return {
        "status": "received",
        "source": payload.source,
        "event": payload.event,
    }
