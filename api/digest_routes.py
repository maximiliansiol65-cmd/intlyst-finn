"""
Taegliche KI-Zusammenfassung - fasst alle Daten des Tages zusammen
und speichert sie als Notification.
"""

import json
import os
from datetime import date, timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from models.notification import Notification
from security_config import is_configured_secret

router = APIRouter(prefix="/api/digest", tags=["digest"])

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"


class DigestResponse(BaseModel):
    date: str
    summary: str
    top_insight: str
    top_action: str
    mood: str
    generated_by: str = "claude"


def build_daily_context(db: Session) -> str:
    today = date.today()
    since = today - timedelta(days=7)

    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )

    if not rows:
        return "Keine Daten verfuegbar."

    yesterday = rows[-1]
    avg_rev = sum(row.revenue for row in rows) / len(rows)
    avg_tr = sum(row.traffic for row in rows) / len(rows)

    goals = db.query(Goal).all()
    goal_text = ""
    for goal in goals:
        if goal.metric == "revenue":
            progress = round(yesterday.revenue / goal.target_value * 100, 1) if goal.target_value else 0
            goal_text = (
                f"Umsatzziel: {goal.target_value} EUR - "
                f"Tagesfortschritt {yesterday.revenue} EUR ({progress}%)"
            )

    return (
        f"Datum: {today}\n"
        f"Gestern: Umsatz {yesterday.revenue} EUR (7-Tage-Avg: {round(avg_rev, 1)} EUR), "
        f"Traffic {yesterday.traffic} (Avg: {round(avg_tr, 1)})\n"
        f"Conversions: {yesterday.conversions}, Conv.-Rate: {round(yesterday.conversion_rate * 100, 1)}%, "
        f"Neue Kunden: {yesterday.new_customers}\n"
        f"{goal_text}"
    )


async def generate_digest(context: str) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return {
            "summary": "API Key fehlt.",
            "top_insight": "",
            "top_action": "",
            "mood": "neutral",
        }

    prompt = f"""Erstelle eine taegliche Business-Zusammenfassung basierend auf diesen Daten:

{context}

Antworte NUR mit diesem JSON (kein Markdown):
{{
  "summary": "2-3 Saetze: Was war heute wichtig, wie laeuft das Business?",
  "top_insight": "1 Satz: wichtigste Erkenntnis des Tages",
  "top_action": "1 konkreter Handlungsvorschlag fuer morgen",
  "mood": "great|good|neutral|concerning|critical"
}}"""

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            CLAUDE_API_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 400,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if response.status_code != 200:
        return {
            "summary": f"API Fehler: {response.status_code}",
            "top_insight": "",
            "top_action": "",
            "mood": "neutral",
        }

    raw = response.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {
            "summary": "Antwort konnte nicht geparst werden.",
            "top_insight": "",
            "top_action": "",
            "mood": "neutral",
        }


async def save_digest_notification(data: dict, db: Session):
    mood_tag = {
        "great": "[GREAT]",
        "good": "[GOOD]",
        "neutral": "[NEUTRAL]",
        "concerning": "[WARN]",
        "critical": "[CRITICAL]",
    }.get(data.get("mood", "neutral"), "[NEUTRAL]")

    title = f"{mood_tag} Taegliche Zusammenfassung"
    existing = db.query(Notification).filter(Notification.title == title).first()
    if not existing:
        db.add(
            Notification(
                title=title,
                message=data.get("summary", ""),
                type="recommendation",
            )
        )
        db.commit()


@router.get("", response_model=DigestResponse)
async def get_digest(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    context = build_daily_context(db)
    data = await generate_digest(context)

    background_tasks.add_task(save_digest_notification, data, db)

    return DigestResponse(
        date=str(date.today()),
        summary=data.get("summary", ""),
        top_insight=data.get("top_insight", ""),
        top_action=data.get("top_action", ""),
        mood=data.get("mood", "neutral"),
    )


@router.post("/trigger")
async def trigger_digest(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Manuell ausloesen - z.B. fuer Tests oder Cron-Job."""
    context = build_daily_context(db)
    data = await generate_digest(context)
    await save_digest_notification(data, db)
    return {
        "status": "ok",
        "mood": data.get("mood"),
        "summary": data.get("summary", "")[:100],
    }
