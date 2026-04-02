"""
Google Analytics + HubSpot CRM Basis-Integration.
"""
import os
from datetime import date, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from models.daily_metrics import DailyMetrics

router = APIRouter(prefix="/api/integrations/connect", tags=["integrations-connect"])


class GAMetrics(BaseModel):
    sessions: int
    users: int
    new_users: int
    pageviews: int
    bounce_rate: float
    avg_session_duration: float
    period_start: str
    period_end: str
    source: str = "google_analytics"


class HubSpotContact(BaseModel):
    id: str
    name: str
    email: Optional[str]
    company: Optional[str]
    deal_value: Optional[float]
    last_activity: Optional[str]
    lifecycle_stage: str


class HubSpotSummary(BaseModel):
    total_contacts: int
    total_deals: int
    total_deal_value: float
    contacts: list[HubSpotContact]


@router.get("/google-analytics", response_model=GAMetrics)
async def get_google_analytics(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    property_id = os.getenv("GOOGLE_ANALYTICS_PROPERTY_ID", "")
    key = os.getenv("GOOGLE_ANALYTICS_KEY", "")

    if not property_id or not key:
        since = date.today() - timedelta(days=days)
        rows = (
            db.query(DailyMetrics)
            .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
            .all()
        )
        total_traffic = sum(row.traffic for row in rows)
        return GAMetrics(
            sessions=total_traffic,
            users=int(total_traffic * 0.8),
            new_users=int(total_traffic * 0.35),
            pageviews=total_traffic * 3,
            bounce_rate=42.5,
            avg_session_duration=148.0,
            period_start=str(since),
            period_end=str(date.today()),
            source="demo_data",
        )

    end_date = date.today().strftime("%Y-%m-%d")
    start_date = (date.today() - timedelta(days=days)).strftime("%Y-%m-%d")

    payload = {
        "dateRanges": [{"startDate": start_date, "endDate": end_date}],
        "metrics": [
            {"name": "sessions"},
            {"name": "totalUsers"},
            {"name": "newUsers"},
            {"name": "screenPageViews"},
            {"name": "bounceRate"},
            {"name": "averageSessionDuration"},
        ],
    }

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Google Analytics Fehler: {res.text[:200]}")

    data = res.json()
    vals = data.get("rows", [{}])[0].get("metricValues", [{}] * 6)

    def safe(index, default=0):
        try:
            return float(vals[index].get("value", default))
        except Exception:
            return float(default)

    return GAMetrics(
        sessions=int(safe(0)),
        users=int(safe(1)),
        new_users=int(safe(2)),
        pageviews=int(safe(3)),
        bounce_rate=round(safe(4) * 100, 1),
        avg_session_duration=round(safe(5), 1),
        period_start=start_date,
        period_end=end_date,
    )


@router.get("/hubspot", response_model=HubSpotSummary)
async def get_hubspot_data(limit: int = 20, current_user: User = Depends(get_current_user)):
    key = os.getenv("HUBSPOT_API_KEY", "")

    if not key:
        return HubSpotSummary(
            total_contacts=47,
            total_deals=12,
            total_deal_value=28500.0,
            contacts=[
                HubSpotContact(id="1", name="Anna Mayer", email="anna@example.com", company="Mayer GmbH", deal_value=4500.0, last_activity="2024-01-15", lifecycle_stage="customer"),
                HubSpotContact(id="2", name="Ben Koch", email="ben@example.com", company="Koch AG", deal_value=2800.0, last_activity="2024-01-12", lifecycle_stage="lead"),
                HubSpotContact(id="3", name="Clara Weber", email="clara@example.com", company="Weber KG", deal_value=6200.0, last_activity="2024-01-10", lifecycle_stage="customer"),
                HubSpotContact(id="4", name="David Braun", email="david@example.com", company="Braun & Co", deal_value=1800.0, last_activity="2024-01-08", lifecycle_stage="opportunity"),
                HubSpotContact(id="5", name="Eva Fischer", email="eva@example.com", company="Fischer GmbH", deal_value=3200.0, last_activity="2024-01-05", lifecycle_stage="lead"),
            ],
        )

    async with httpx.AsyncClient(timeout=15) as client:
        contacts_res = await client.get(
            "https://api.hubapi.com/crm/v3/objects/contacts",
            headers={"Authorization": f"Bearer {key}"},
            params={"limit": limit, "properties": "firstname,lastname,email,company,hs_lead_status,lifecyclestage"},
        )
        deals_res = await client.get(
            "https://api.hubapi.com/crm/v3/objects/deals",
            headers={"Authorization": f"Bearer {key}"},
            params={"limit": 100, "properties": "dealname,amount,dealstage"},
        )

    if contacts_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"HubSpot Fehler: {contacts_res.text[:200]}")

    contacts_data = contacts_res.json().get("results", [])
    deals_data = deals_res.json().get("results", []) if deals_res.status_code == 200 else []
    total_deal_value = sum(float(item.get("properties", {}).get("amount", 0) or 0) for item in deals_data)

    contacts = []
    for contact in contacts_data:
        props = contact.get("properties", {})
        name = f"{props.get('firstname', '')} {props.get('lastname', '')}".strip() or "Unbekannt"
        contacts.append(
            HubSpotContact(
                id=contact.get("id", ""),
                name=name,
                email=props.get("email"),
                company=props.get("company"),
                deal_value=None,
                last_activity=props.get("lastmodifieddate", "")[:10] if props.get("lastmodifieddate") else None,
                lifecycle_stage=props.get("lifecyclestage", "lead"),
            )
        )

    return HubSpotSummary(
        total_contacts=len(contacts_data),
        total_deals=len(deals_data),
        total_deal_value=total_deal_value,
        contacts=contacts,
    )


@router.get("/export/csv")
async def export_csv(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )

    lines = ["date,revenue,traffic,conversions,conversion_rate,new_customers"]
    for row in rows:
        lines.append(
            f"{row.date},{row.revenue},{row.traffic},{row.conversions},{round(row.conversion_rate, 4)},{row.new_customers}"
        )

    return Response(
        content="\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=bizlytics_export_{date.today()}.csv"},
    )


@router.get("/export/json")
async def export_json(days: int = 30, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )

    data = [
        {
            "date": str(row.date),
            "revenue": row.revenue,
            "traffic": row.traffic,
            "conversions": row.conversions,
            "conversion_rate": round(row.conversion_rate, 4),
            "new_customers": row.new_customers,
        }
        for row in rows
    ]

    return JSONResponse(
        content={"exported_at": str(date.today()), "days": days, "rows": len(data), "data": data},
        headers={"Content-Disposition": f"attachment; filename=bizlytics_export_{date.today()}.json"},
    )