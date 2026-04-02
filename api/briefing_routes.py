"""
Daily Briefing API
Jeden Morgen ein vollständiges, KI-generiertes Briefing.

Das Briefing kombiniert alle Analyse-Schichten zu einer täglichen
Executive Summary: Was war gestern? Was passiert heute? Was sind die Prioritäten?

Endpunkte:
  GET  /api/briefing          — Aktuelles Morning Briefing
  GET  /api/briefing/today    — Alias für /api/briefing
  GET  /api/briefing/history  — Archiv vergangener Briefings
"""

import hashlib
import json
import os
from datetime import date, datetime, timedelta
from threading import Lock
from time import perf_counter
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from security_config import is_configured_secret
from services.analysis_service import get_daily_rows

router = APIRouter(prefix="/api/briefing", tags=["briefing"])

CLAUDE_URL   = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

# Briefing-Cache: Pro Nutzer 1 Briefing pro Tag (6h TTL)
_briefing_cache: dict[str, dict] = {}
_cache_lock = Lock()
BRIEFING_CACHE_TTL = 60 * 60 * 6  # 6 Stunden


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class BriefingSection(BaseModel):
    """Ein Abschnitt des täglichen Briefings."""

    title: str
    content: str
    priority: Optional[str] = None   # "high" | "medium" | "low"
    metric: Optional[float] = None   # Relevante Zahl (für UI)
    metric_unit: Optional[str] = None
    metric_change_pct: Optional[float] = None


class TodayForecast(BaseModel):
    revenue_forecast: float
    revenue_lower: float
    revenue_upper: float
    explanation: str


class YesterdayPerformance(BaseModel):
    revenue: float
    vs_avg_pct: float
    label: str           # "sehr gut" | "gut" | "normal" | "schwach" | "sehr schwach"
    vs_prev_week_pct: float
    anomaly: Optional[str] = None


class MonthProgress(BaseModel):
    day_of_month: int
    days_in_month: int
    progress_pct: float
    days_remaining: int
    next_holiday: Optional[str] = None     # "Pfingstmontag in 5 Tagen"
    next_event: Optional[str] = None       # "Kampagnenstart in 2 Tagen"


class DailyBriefingResponse(BaseModel):
    generated_at: str
    briefing_date: str

    # Kern-Sektionen
    greeting: str
    today_forecast: TodayForecast
    yesterday: YesterdayPerformance
    top_priority: str          # Eine konkrete Aktion
    key_insight: str           # Wichtigste Erkenntnis der letzten 24h
    week_actions: list[str]    # 3 Dinge die diese Woche zählen

    # Kontextsektionen
    month_progress: MonthProgress
    goal_status: list[dict]    # [{metric, progress_pct, on_track}]
    alerts: list[str]          # Aktive Warnungen

    # Optionale Sektionen
    competitor_update: Optional[str] = None
    event_countdown: Optional[str] = None

    source: str
    processing_ms: float


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _to_float(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _cache_key(user_id: int, briefing_date: str) -> str:
    return hashlib.sha1(f"{user_id}:{briefing_date}".encode()).hexdigest()


def _cache_get(key: str) -> Optional[dict]:
    with _cache_lock:
        entry = _briefing_cache.get(key)
        if not entry:
            return None
        if entry["expires_at"] <= datetime.utcnow().timestamp():
            _briefing_cache.pop(key, None)
            return None
        return dict(entry["payload"])


def _cache_set(key: str, payload: dict) -> None:
    with _cache_lock:
        _briefing_cache[key] = {
            "expires_at": datetime.utcnow().timestamp() + BRIEFING_CACHE_TTL,
            "payload": payload,
        }


def _label_performance(value: float, avg: float) -> str:
    if avg == 0:
        return "normal"
    ratio = value / avg
    if ratio >= 1.3:
        return "sehr gut"
    if ratio >= 1.1:
        return "gut"
    if ratio >= 0.9:
        return "normal"
    if ratio >= 0.7:
        return "schwach"
    return "sehr schwach"


# ---------------------------------------------------------------------------
# Daten für Briefing aufbauen
# ---------------------------------------------------------------------------

def _build_briefing_data(db: Session) -> dict:
    """
    Baut alle Rohdaten für das Briefing zusammen.
    Nutzt vorhandene DB-Daten ohne externe APIs (schnell).
    """
    today = date.today()
    rows_90 = get_daily_rows(db, 90)
    rows_30 = [r for r in rows_90 if (today - r.date).days <= 30]
    rows_7  = [r for r in rows_90 if (today - r.date).days <= 7]

    # Gestern
    yesterday = today - timedelta(days=1)
    yesterday_row = next((r for r in rows_90 if r.date == yesterday), None)
    yesterday_revenue = _to_float(yesterday_row.revenue) if yesterday_row else 0.0

    # Durchschnitte
    avg_30 = sum(_to_float(r.revenue) for r in rows_30) / len(rows_30) if rows_30 else 0.0
    avg_7  = sum(_to_float(r.revenue) for r in rows_7)  / len(rows_7)  if rows_7  else 0.0

    # WoW: Letzte 7 Tage vs. davor
    prev_7 = [r for r in rows_90 if 7 < (today - r.date).days <= 14]
    avg_prev_7 = sum(_to_float(r.revenue) for r in prev_7) / len(prev_7) if prev_7 else avg_7
    wow_pct = ((avg_7 - avg_prev_7) / avg_prev_7 * 100) if avg_prev_7 else 0.0

    # Ziele
    goals = db.query(Goal).all()
    goal_status = []
    for goal in goals:
        metric = str(getattr(goal, "metric", ""))
        target = _to_float(getattr(goal, "target_value", 0))
        # Aktuellen Wert schätzen
        if metric == "revenue":
            current = sum(_to_float(r.revenue) for r in rows_30)
        elif metric == "traffic":
            current = sum(_to_float(r.traffic) for r in rows_30)
        else:
            current = 0.0
        progress = round(current / target * 100, 1) if target else 0.0
        goal_status.append({"metric": metric, "target": target, "current": round(current, 2), "progress_pct": progress, "on_track": progress >= 80})

    # Monats-Fortschritt
    import calendar
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_remaining = days_in_month - today.day
    month_progress_pct = round(today.day / days_in_month * 100, 1)
    month_revenue_to_date = sum(_to_float(r.revenue) for r in rows_30 if r.date.month == today.month)

    # Nächster Feiertag (aus Cache falls vorhanden)
    next_holiday_str = None
    try:
        from analytics.data_aggregator import _fetch_external
        import asyncio
        # Synchroner Aufruf via asyncio (in FastAPI OK wenn schon im Event-Loop)
        # Für Briefing nutzen wir gespeicherte Daten falls vorhanden
        pass
    except Exception:
        pass

    # Business Events
    next_event_str = None
    try:
        from models.business_event import BusinessEvent
        upcoming = (
            db.query(BusinessEvent)
            .filter(BusinessEvent.event_date >= today.isoformat())
            .order_by(BusinessEvent.event_date)
            .first()
        )
        if upcoming:
            days_away = (date.fromisoformat(upcoming.event_date) - today).days
            next_event_str = f"'{upcoming.title}' in {days_away} {'Tag' if days_away == 1 else 'Tagen'}"
    except Exception:
        pass

    # Anomalie-Check: Ist gestern anomal?
    anomaly_note = None
    if yesterday_revenue > 0 and avg_30 > 0:
        dev = (yesterday_revenue - avg_30) / avg_30 * 100
        if abs(dev) > 30:
            direction = "über" if dev > 0 else "unter"
            anomaly_note = f"Gestern war {abs(dev):.0f}% {direction} dem 30-Tage-Durchschnitt"

    # Prognose heute (einfach, ohne schwere Modelle)
    # Wochentag-Faktor
    wd_idx = today.weekday()
    wd_revenues: dict[int, list[float]] = {i: [] for i in range(7)}
    for r in rows_90:
        wd_revenues[r.date.weekday()].append(_to_float(r.revenue))
    wd_avg = {wd: sum(vs) / len(vs) for wd, vs in wd_revenues.items() if vs}
    wd_factor = (wd_avg.get(wd_idx, avg_30) / avg_30) if avg_30 > 0 else 1.0

    # 7-Tage Momentum
    momentum = ((avg_7 - avg_prev_7) / avg_prev_7) if avg_prev_7 > 0 else 0.0
    today_forecast = round(avg_30 * wd_factor * (1 + momentum * 0.3), 2)

    # Konfidenzband: ~15% bei normalem CV
    revenues_list = [_to_float(r.revenue) for r in rows_90]
    mean_rev = sum(revenues_list) / len(revenues_list) if revenues_list else avg_30
    std_rev = (sum((v - mean_rev) ** 2 for v in revenues_list) / len(revenues_list)) ** 0.5 if revenues_list else 0.0
    cv = std_rev / mean_rev if mean_rev > 0 else 0.15
    band = max(0.08, min(0.25, cv))
    today_lower = round(max(0.0, today_forecast * (1 - band)), 2)
    today_upper = round(today_forecast * (1 + band), 2)

    # Erklärung
    wd_names = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
    wd_name = wd_names[wd_idx]
    explanation_parts = [f"{wd_name} historisch {(wd_factor-1)*100:+.0f}% vs Ø"]
    if abs(momentum * 100) > 3:
        explanation_parts.append(f"7d-Momentum {momentum*100:+.1f}%")
    explanation = ", ".join(explanation_parts) or "stabiler Trend"

    return {
        "today": today.isoformat(),
        "yesterday_revenue": yesterday_revenue,
        "avg_30": avg_30,
        "wow_pct": round(wow_pct, 1),
        "yesterday_label": _label_performance(yesterday_revenue, avg_30),
        "anomaly": anomaly_note,
        "today_forecast": today_forecast,
        "today_lower": today_lower,
        "today_upper": today_upper,
        "today_explanation": explanation,
        "goal_status": goal_status,
        "days_in_month": days_in_month,
        "days_remaining": days_remaining,
        "month_progress_pct": month_progress_pct,
        "month_revenue_to_date": month_revenue_to_date,
        "next_event": next_event_str,
        "next_holiday": next_holiday_str,
        "rows_count": len(rows_90),
        "recent_revenue_list": revenues_list[-14:],  # Letzte 14 Tage für Claude-Kontext
    }


def _build_briefing_prompt(data: dict, user_name: str = "") -> tuple[str, str]:
    """Baut System-Prompt und User-Prompt für Claude."""
    today_str = data["today"]
    name_part = f", {user_name}" if user_name else ""

    system = f"""Du bist Intlyst — der persönliche Business-Analyst von diesem Unternehmen.
Jeden Morgen erstellst du ein präzises, datenbasiertes Morning Briefing.

TONALITÄT:
- Direkt, klar, auf den Punkt. Keine Floskeln.
- Zahlen in EUR oder % — immer konkret.
- Eine Meinung haben: nicht nur beschreiben, sondern bewerten.
- Max. 2-3 Sätze pro Sektion.

FORMAT: Gib ausschließlich valides JSON zurück, kein anderer Text."""

    # Kontext aufbauen
    ctx_lines = [
        f"Datum: {today_str} (Wochentag: {['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'][date.today().weekday()]})",
        "",
        f"HEUTE PROGNOSE: EUR {data['today_forecast']:,.0f} (Spanne: {data['today_lower']:,.0f}–{data['today_upper']:,.0f})",
        f"Basis: {data['today_explanation']}",
        "",
        f"GESTERN: EUR {data['yesterday_revenue']:,.0f} ({data['yesterday_label']}, WoW: {data['wow_pct']:+.1f}%)",
        f"30-Tage-Ø: EUR {data['avg_30']:,.2f}/Tag",
    ]

    if data.get("anomaly"):
        ctx_lines.append(f"ANOMALIE: {data['anomaly']}")

    # Letzte 14 Tage Umsatz
    recent = data.get("recent_revenue_list", [])
    if recent:
        ctx_lines.append(f"\nLETZTE {len(recent)} TAGE UMSATZ: {[round(v,0) for v in recent]}")

    # Ziele
    if data.get("goal_status"):
        ctx_lines.append("\nZIELE:")
        for g in data["goal_status"][:3]:
            status = "auf Kurs" if g["on_track"] else "HINTER PLAN"
            ctx_lines.append(f"  {g['metric']}: {g['progress_pct']:.0f}% von {g['target']:.0f} ({status})")

    ctx_lines.append(f"\nMONAT: Tag {date.today().day}/{data['days_in_month']} ({data['month_progress_pct']:.0f}% durch, noch {data['days_remaining']} Tage)")

    if data.get("next_event"):
        ctx_lines.append(f"NÄCHSTES EVENT: {data['next_event']}")
    if data.get("next_holiday"):
        ctx_lines.append(f"NÄCHSTER FEIERTAG: {data['next_holiday']}")

    context = "\n".join(ctx_lines)

    prompt = f"""Erstelle das Morning Briefing für heute{name_part} basierend auf diesen Daten:

{context}

Antworte NUR als JSON:
{{
  "greeting": "Guten Morgen{name_part}! — ein Satz Lageeinschätzung",
  "top_priority": "Eine konkrete Aktion für heute mit erwarteter EUR-Wirkung",
  "key_insight": "Wichtigste Erkenntnis aus den Daten der letzten 24h — mit Zahl",
  "week_actions": [
    "Aktion 1 mit Zeitrahmen und Zahl",
    "Aktion 2 mit Zeitrahmen und Zahl",
    "Aktion 3 mit Zeitrahmen und Zahl"
  ],
  "competitor_update": null,
  "alerts": []
}}

Regeln:
- greeting: max 1 Satz, mit konkreter Lageeinschätzung aus den Zahlen
- top_priority: EINE Aktion, konkret, mit geschätztem EUR-Impact
- key_insight: Signal das der Nutzer heute wissen muss — nicht was er schon sieht
- week_actions: 3 Aktionen, jede mit Zeitangabe (heute / diese Woche / bis Freitag)
- alerts: leer wenn keine kritischen Probleme in den Daten sichtbar
- Keine generischen Empfehlungen — nur was die Zahlen belegen"""

    return system, prompt


# ---------------------------------------------------------------------------
# Fallback Briefing (ohne Claude)
# ---------------------------------------------------------------------------

def _local_briefing_fallback(data: dict, processing_ms: float) -> DailyBriefingResponse:
    """Erzeugt ein lokales Briefing ohne Claude."""
    today = date.today()
    yesterday_rev = data["yesterday_revenue"]
    avg_30 = data["avg_30"]
    wow = data["wow_pct"]

    direction = "über" if wow > 0 else "unter"
    greeting = (
        f"Guten Morgen! Gestern: EUR {yesterday_rev:,.0f} — "
        f"{abs(wow):.1f}% {direction} Vorwoche."
    )

    priority_actions = []
    if wow < -5:
        priority_actions.append(f"Umsatz-Rückgang analysieren: -EUR {abs(avg_30 - yesterday_rev):,.0f} vs Ø")
    if data.get("goal_status"):
        behind = [g for g in data["goal_status"] if not g.get("on_track")]
        if behind:
            g = behind[0]
            priority_actions.append(f"Ziel '{g['metric']}' nachziehen: {g['progress_pct']:.0f}% erreicht")

    top_priority = priority_actions[0] if priority_actions else "Traffic-Kanäle auf WoW-Beitrag prüfen"
    key_insight = f"7-Tage-Momentum: {wow:+.1f}% WoW | 30-Tage-Ø EUR {avg_30:,.2f}/Tag"

    # Monatsstatus
    prog = data["month_progress_pct"]
    remaining = data["days_remaining"]
    monthly_g = next((g for g in data.get("goal_status", []) if g.get("metric") == "revenue"), None)
    if monthly_g:
        gap = monthly_g["target"] - monthly_g["current"]
        week_actions = [
            f"Monatsziel: EUR {gap:,.0f} Lücke in {remaining} Tagen schließen ({gap/max(1,remaining):,.0f}/Tag nötig)",
            "Top-3 Umsatzquellen letzte 7 Tage prüfen und priorisieren",
            "Conversion-Rate heute messen (Ø momentan " + f"{(avg_30 / max(1, data.get('avg_30', 1))):.1f}x der Norm)",
        ]
    else:
        week_actions = [
            "Umsatz-Treiber der letzten 7 Tage identifizieren",
            "Conversion-Engpass analysieren",
            "Wochenziel für nächsten Freitag definieren",
        ]

    return DailyBriefingResponse(
        generated_at=datetime.utcnow().isoformat(),
        briefing_date=data["today"],
        greeting=greeting,
        today_forecast=TodayForecast(
            revenue_forecast=data["today_forecast"],
            revenue_lower=data["today_lower"],
            revenue_upper=data["today_upper"],
            explanation=data["today_explanation"],
        ),
        yesterday=YesterdayPerformance(
            revenue=yesterday_rev,
            vs_avg_pct=((yesterday_rev - avg_30) / avg_30 * 100) if avg_30 else 0.0,
            label=data["yesterday_label"],
            vs_prev_week_pct=wow,
            anomaly=data.get("anomaly"),
        ),
        top_priority=top_priority,
        key_insight=key_insight,
        week_actions=week_actions,
        month_progress=MonthProgress(
            day_of_month=today.day,
            days_in_month=data["days_in_month"],
            progress_pct=data["month_progress_pct"],
            days_remaining=data["days_remaining"],
            next_holiday=data.get("next_holiday"),
            next_event=data.get("next_event"),
        ),
        goal_status=data.get("goal_status", []),
        alerts=[data["anomaly"]] if data.get("anomaly") else [],
        competitor_update=None,
        event_countdown=data.get("next_event"),
        source="fallback",
        processing_ms=processing_ms,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=DailyBriefingResponse)
@router.get("/today", response_model=DailyBriefingResponse)
async def get_briefing(
    force_refresh: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyBriefingResponse:
    """
    Holt das Morning Briefing für heute.

    Wird automatisch generiert und für 6 Stunden gecacht.
    Mit force_refresh=true wird ein neues Briefing erzwungen.
    """
    started = perf_counter()
    today_str = date.today().isoformat()
    user_id = getattr(current_user, "id", 0)
    cache_key = _cache_key(user_id, today_str)

    # Cache prüfen
    if not force_refresh:
        cached = _cache_get(cache_key)
        if cached:
            return DailyBriefingResponse(**cached)

    # Daten aufbauen
    data = _build_briefing_data(db)

    if data["rows_count"] < 7:
        ms = round((perf_counter() - started) * 1000, 2)
        return DailyBriefingResponse(
            generated_at=datetime.utcnow().isoformat(),
            briefing_date=today_str,
            greeting="Noch nicht genug Daten. Mindestens 7 Tage Metriken erfassen.",
            today_forecast=TodayForecast(revenue_forecast=0, revenue_lower=0, revenue_upper=0, explanation="Keine Daten"),
            yesterday=YesterdayPerformance(revenue=0, vs_avg_pct=0, label="keine Daten", vs_prev_week_pct=0),
            top_priority="Tägliche Metriken über CSV oder Integration erfassen.",
            key_insight="Datenbasis aufbauen: Umsatz, Traffic, Conversions täglich eintragen.",
            week_actions=["KPIs täglich erfassen", "Erste Integration verbinden", "Ziel definieren"],
            month_progress=MonthProgress(
                day_of_month=date.today().day,
                days_in_month=data["days_in_month"],
                progress_pct=data["month_progress_pct"],
                days_remaining=data["days_remaining"],
            ),
            goal_status=[],
            alerts=["Zu wenig Daten für vollständiges Briefing"],
            source="local",
            processing_ms=ms,
        )

    # ANTHROPIC_API_KEY prüfen
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(api_key, prefixes=("sk-ant-",), min_length=20):
        ms = round((perf_counter() - started) * 1000, 2)
        return _local_briefing_fallback(data, ms)

    # Claude aufrufen
    system_prompt, user_prompt = _build_briefing_prompt(data, getattr(current_user, "name", "") or "")

    try:
        async with httpx.AsyncClient(timeout=35.0) as client:
            res = await client.post(
                CLAUDE_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 900,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )

        if res.status_code != 200:
            raise ValueError(f"Claude returned {res.status_code}")

        raw = res.json().get("content", [{}])[0].get("text", "")

        # JSON parsen
        text = raw.strip()
        if "```" in text:
            parts = text.split("```")
            for part in parts:
                candidate = part.strip()
                if candidate.startswith("json"):
                    candidate = candidate[4:].strip()
                try:
                    parsed = json.loads(candidate)
                    break
                except Exception:
                    continue
            else:
                parsed = {}
        else:
            try:
                parsed = json.loads(text)
            except Exception:
                start = text.find("{")
                end = text.rfind("}") + 1
                parsed = json.loads(text[start:end]) if start >= 0 else {}

    except Exception:
        ms = round((perf_counter() - started) * 1000, 2)
        return _local_briefing_fallback(data, ms)

    ms = round((perf_counter() - started) * 1000, 2)

    response = DailyBriefingResponse(
        generated_at=datetime.utcnow().isoformat(),
        briefing_date=today_str,
        greeting=str(parsed.get("greeting", "")),
        today_forecast=TodayForecast(
            revenue_forecast=data["today_forecast"],
            revenue_lower=data["today_lower"],
            revenue_upper=data["today_upper"],
            explanation=data["today_explanation"],
        ),
        yesterday=YesterdayPerformance(
            revenue=data["yesterday_revenue"],
            vs_avg_pct=((data["yesterday_revenue"] - data["avg_30"]) / data["avg_30"] * 100) if data["avg_30"] else 0.0,
            label=data["yesterday_label"],
            vs_prev_week_pct=data["wow_pct"],
            anomaly=data.get("anomaly"),
        ),
        top_priority=str(parsed.get("top_priority", "")),
        key_insight=str(parsed.get("key_insight", "")),
        week_actions=[str(a) for a in parsed.get("week_actions", [])[:3]],
        month_progress=MonthProgress(
            day_of_month=date.today().day,
            days_in_month=data["days_in_month"],
            progress_pct=data["month_progress_pct"],
            days_remaining=data["days_remaining"],
            next_holiday=data.get("next_holiday"),
            next_event=data.get("next_event"),
        ),
        goal_status=data.get("goal_status", []),
        alerts=[str(a) for a in parsed.get("alerts", [])][:3],
        competitor_update=parsed.get("competitor_update"),
        event_countdown=data.get("next_event"),
        source="claude",
        processing_ms=ms,
    )

    _cache_set(cache_key, response.model_dump())
    return response
