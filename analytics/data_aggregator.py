"""
Schicht 1 — Rohdaten Aggregation
analytics/data_aggregator.py

Sammelt ALLE verfügbaren Daten aus ALLEN Quellen in einem strukturierten Objekt.
Jede externe Datenquelle hat Timeout + Fallback.
Das System liefert immer ein Ergebnis, auch wenn externe APIs nicht erreichbar sind.
"""

import asyncio
import calendar
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from models.daily_metrics import DailyMetrics
from models.goals import Goal
from models.task import Task

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _to_float(v: Any) -> float:
    """Sicherer Cast zu float, gibt 0.0 bei None/Fehler zurück."""
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _to_int(v: Any) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _env(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


# ---------------------------------------------------------------------------
# Datenstrukturen
# ---------------------------------------------------------------------------

@dataclass
class DataQualityReport:
    """Beschreibt Vollständigkeit und Qualität der gesammelten Daten."""

    score: float                    # 0–100: Gesamtqualitätsscore
    connected_sources: list[str]    # Aktive Datenquellen
    missing_sources: list[str]      # Nicht verbundene Datenquellen
    missing_impact: str             # Klartext: Was fehlt uns dadurch?
    data_days: int                  # Anzahl Tage mit internen Daten
    has_stripe: bool
    has_ga4: bool
    has_instagram: bool
    has_tiktok: bool


@dataclass
class InternalMetrics:
    """Metriken aus der internen Datenbank."""

    dates: list[date]
    revenue: list[float]
    traffic: list[float]
    conversions: list[float]
    conversion_rate: list[float]    # Dezimalwert, z.B. 0.032 = 3.2%
    new_customers: list[float]

    # Aggregierte Werte
    total_revenue_30d: float
    total_revenue_90d: float
    avg_daily_revenue: float
    avg_traffic: float
    avg_conversion_rate_pct: float  # in Prozent, z.B. 3.2

    # Ziele
    goals: list[dict]               # [{metric, target, current, progress_pct, on_track}]

    # Task-Status
    tasks_open: int
    tasks_overdue: int
    tasks_high_priority: int

    # Alert-Historie (letzte 7 Tage)
    recent_alerts: list[dict]


@dataclass
class StripeMetrics:
    """Zahlungsdaten aus Stripe."""

    mrr: float                      # Monthly Recurring Revenue
    arr: float                      # Annual Recurring Revenue
    total_customers: int
    active_customers_30d: int       # Kunden mit Kauf in letzten 30 Tagen
    avg_order_value: float
    refund_rate_pct: float          # in Prozent
    failed_payments_30d: int
    churn_estimate_pct: float       # geschätzte Churn-Rate
    top_customers: list[dict]       # [{customer_id, total_revenue, last_purchase}]
    revenue_by_day: dict[str, float]  # ISO-Datum → Tagesumsatz


@dataclass
class GA4Metrics:
    """Traffic-Daten aus Google Analytics 4."""

    sessions_30d: int
    users_30d: int
    new_users_30d: int
    avg_session_duration_sec: float
    bounce_rate_pct: float
    traffic_sources: dict[str, float]  # "organic"/"paid"/"social"/"direct" → Anteil %
    device_split: dict[str, float]     # "mobile"/"desktop"/"tablet" → Anteil %
    top_landing_pages: list[dict]      # [{page, sessions, bounce_rate}]
    sessions_by_day: dict[str, int]    # ISO-Datum → Sitzungen


@dataclass
class InstagramMetrics:
    """Social-Media-Daten aus Instagram Graph API."""

    followers: int
    follower_growth_30d: int
    avg_reach: float
    avg_engagement_rate_pct: float
    avg_save_rate_pct: float
    story_view_rate_pct: float
    posting_frequency_per_week: float
    top_posts: list[dict]              # [{id, type, reach, engagement_rate, date}]
    followers_by_day: dict[str, int]   # ISO-Datum → Follower-Zahl


@dataclass
class TikTokMetrics:
    """Video-Daten aus TikTok."""

    followers: int
    follower_growth_30d: int
    avg_video_views: float
    avg_completion_rate_pct: float
    avg_shares: float
    avg_comments: float
    top_videos: list[dict]             # [{id, views, completion_rate, shares, date}]


@dataclass
class ExternalContext:
    """Externe Kontextdaten: Feiertage, Trends, Saisonalität."""

    holidays_next_14d: list[dict]          # [{date, name, country}]
    holidays_today: list[dict]             # Feiertage heute
    google_trends: dict[str, int]          # Suchbegriff → Trend-Index 0–100
    current_month: int                     # 1–12
    current_day_of_month: int
    days_in_month: int
    days_remaining_in_month: int
    month_progress_pct: float             # Wie weit sind wir im Monat?
    country_code: str


@dataclass
class AggregatedData:
    """
    Vollständig aggregiertes Datenprojekt eines Unternehmens.
    Enthält alle verfügbaren Daten aus allen Quellen.
    """

    snapshot_date: date
    data_quality: DataQualityReport
    internal: InternalMetrics
    stripe: Optional[StripeMetrics]
    ga4: Optional[GA4Metrics]
    instagram: Optional[InstagramMetrics]
    tiktok: Optional[TikTokMetrics]
    external: ExternalContext
    connected_sources: list[str]
    missing_sources: list[str]


# ---------------------------------------------------------------------------
# Interne DB-Daten (synchron)
# ---------------------------------------------------------------------------

def _fetch_internal(db: Session, days: int = 90) -> InternalMetrics:
    """
    Liest alle Metriken aus der internen Datenbank.

    Args:
        db: SQLAlchemy Session (hat bereits Workspace-Kontext)
        days: Anzahl Tage rückwärts (max 365)

    Returns:
        InternalMetrics mit vollständigen Zeitreihen
    """
    safe_days = max(7, min(days, 365))
    since = date.today() - timedelta(days=safe_days)

    rows: list[DailyMetrics] = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )

    dates = [row.date for row in rows]
    revenue = [_to_float(row.revenue) for row in rows]
    traffic = [_to_float(row.traffic) for row in rows]
    conversions = [_to_float(row.conversions) for row in rows]
    conversion_rate = [_to_float(row.conversion_rate) for row in rows]
    new_customers = [_to_float(row.new_customers) for row in rows]

    today = date.today()
    rows_30 = [r for r in rows if (today - r.date).days <= 30]
    rows_90 = rows

    total_30 = sum(_to_float(r.revenue) for r in rows_30)
    total_90 = sum(_to_float(r.revenue) for r in rows_90)
    avg_daily = total_30 / len(rows_30) if rows_30 else 0.0
    avg_traffic = (
        sum(_to_float(r.traffic) for r in rows_30) / len(rows_30) if rows_30 else 0.0
    )
    avg_cr = (
        sum(_to_float(r.conversion_rate) for r in rows_30) / len(rows_30) * 100
        if rows_30
        else 0.0
    )

    # Ziele
    goals_raw = db.query(Goal).all()
    goals: list[dict] = []
    for goal in goals_raw:
        metric = str(getattr(goal, "metric", ""))
        target = _to_float(getattr(goal, "target_value", 0))
        current = _compute_goal_value(metric, rows_30, conversion_rate)
        progress = round(current / target * 100, 1) if target else 0.0
        goals.append(
            {
                "metric": metric,
                "target": target,
                "current": round(current, 2),
                "progress_pct": progress,
                "on_track": progress >= 80,
            }
        )

    # Tasks
    tasks = db.query(Task).all()
    tasks_open = sum(1 for t in tasks if t.status == "open")
    tasks_overdue = sum(
        1
        for t in tasks
        if t.due_date and t.due_date < today and t.status != "done"
    )
    tasks_high = sum(
        1 for t in tasks if t.priority == "high" and t.status != "done"
    )

    return InternalMetrics(
        dates=dates,
        revenue=revenue,
        traffic=traffic,
        conversions=conversions,
        conversion_rate=conversion_rate,
        new_customers=new_customers,
        total_revenue_30d=round(total_30, 2),
        total_revenue_90d=round(total_90, 2),
        avg_daily_revenue=round(avg_daily, 2),
        avg_traffic=round(avg_traffic, 1),
        avg_conversion_rate_pct=round(avg_cr, 3),
        goals=goals,
        tasks_open=tasks_open,
        tasks_overdue=tasks_overdue,
        tasks_high_priority=tasks_high,
        recent_alerts=[],  # Erweiterbar: Alert-Modell einbinden
    )


def _compute_goal_value(
    metric: str,
    rows: list[DailyMetrics],
    conv_rates: list[float],
) -> float:
    """Berechnet den aktuellen Wert für eine Ziel-Metrik."""
    if metric == "revenue":
        return sum(_to_float(r.revenue) for r in rows)
    if metric == "traffic":
        return sum(_to_float(r.traffic) for r in rows)
    if metric == "conversions":
        return sum(_to_float(r.conversions) for r in rows)
    if metric in ("conversion_rate", "conv_rate"):
        return (sum(conv_rates) / len(conv_rates) * 100) if conv_rates else 0.0
    if metric in ("new_customers", "customers"):
        return sum(_to_float(r.new_customers) for r in rows)
    return 0.0


# ---------------------------------------------------------------------------
# Stripe (asynchron)
# ---------------------------------------------------------------------------

async def _fetch_stripe(days: int = 90) -> Optional[StripeMetrics]:
    """
    Liest Zahlungsdaten aus der Stripe REST API.

    Erfordert: STRIPE_SECRET_KEY in den Umgebungsvariablen.
    Gibt None zurück wenn Stripe nicht konfiguriert ist.
    """
    api_key = _env("STRIPE_SECRET_KEY")
    if not api_key or not api_key.startswith("sk_"):
        return None

    headers = {"Authorization": f"Bearer {api_key}"}
    since_ts = int((datetime.utcnow() - timedelta(days=days)).timestamp())
    base = "https://api.stripe.com/v1"

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            # Zahlungen der letzten N Tage
            charges_res = await client.get(
                f"{base}/charges",
                headers=headers,
                params={
                    "created[gte]": since_ts,
                    "limit": 100,
                    "expand[]": "data.customer",
                },
            )
            charges_res.raise_for_status()
            charges_data = charges_res.json().get("data", [])

            # Fehlgeschlagene Zahlungen
            failed_res = await client.get(
                f"{base}/charges",
                headers=headers,
                params={
                    "created[gte]": since_ts,
                    "limit": 100,
                    "paid": "false",
                },
            )
            failed_count = len(failed_res.json().get("data", [])) if failed_res.status_code == 200 else 0

            # Refunds
            refunds_res = await client.get(
                f"{base}/refunds",
                headers=headers,
                params={"created[gte]": since_ts, "limit": 100},
            )
            refunds_data = refunds_res.json().get("data", []) if refunds_res.status_code == 200 else []

    except (httpx.TimeoutException, httpx.HTTPError):
        return None

    # Verarbeitung der Charges
    successful = [c for c in charges_data if c.get("paid") and not c.get("refunded")]
    total_revenue = sum(c.get("amount", 0) for c in successful) / 100.0  # Stripe in Cents
    customer_ids = list({c.get("customer") for c in successful if c.get("customer")})
    orders_30d = [
        c for c in successful
        if c.get("created", 0) >= int((datetime.utcnow() - timedelta(days=30)).timestamp())
    ]
    aov = (
        sum(c.get("amount", 0) for c in orders_30d) / 100.0 / len(orders_30d)
        if orders_30d
        else 0.0
    )
    refund_amount = sum(r.get("amount", 0) for r in refunds_data) / 100.0
    refund_rate = (refund_amount / total_revenue * 100) if total_revenue else 0.0

    # Umsatz nach Tag aggregieren
    revenue_by_day: dict[str, float] = {}
    for charge in successful:
        charge_date = date.fromtimestamp(charge.get("created", 0)).isoformat()
        revenue_by_day[charge_date] = (
            revenue_by_day.get(charge_date, 0.0) + charge.get("amount", 0) / 100.0
        )

    # MRR-Schätzung aus letzten 30 Tagen
    rev_30 = sum(
        c.get("amount", 0) / 100.0
        for c in successful
        if c.get("created", 0) >= int((datetime.utcnow() - timedelta(days=30)).timestamp())
    )
    mrr = rev_30  # Simpel: letzter Monat als MRR

    # Top-Kunden nach Umsatz
    customer_revenue: dict[str, float] = {}
    customer_last_purchase: dict[str, str] = {}
    for charge in successful:
        cid = str(charge.get("customer") or charge.get("id", ""))
        amount = charge.get("amount", 0) / 100.0
        customer_revenue[cid] = customer_revenue.get(cid, 0.0) + amount
        purchase_date = date.fromtimestamp(charge.get("created", 0)).isoformat()
        if cid not in customer_last_purchase or purchase_date > customer_last_purchase[cid]:
            customer_last_purchase[cid] = purchase_date

    top_customers = sorted(
        [
            {
                "customer_id": cid,
                "total_revenue": round(rev, 2),
                "last_purchase": customer_last_purchase.get(cid, ""),
            }
            for cid, rev in customer_revenue.items()
        ],
        key=lambda x: x["total_revenue"],
        reverse=True,
    )[:10]

    return StripeMetrics(
        mrr=round(mrr, 2),
        arr=round(mrr * 12, 2),
        total_customers=len(customer_ids),
        active_customers_30d=len({c.get("customer") for c in orders_30d if c.get("customer")}),
        avg_order_value=round(aov, 2),
        refund_rate_pct=round(refund_rate, 2),
        failed_payments_30d=failed_count,
        churn_estimate_pct=0.0,  # Erfordert vollständige Kundenliste; wird in Schicht 5 berechnet
        top_customers=top_customers,
        revenue_by_day=revenue_by_day,
    )


# ---------------------------------------------------------------------------
# Google Analytics 4 (asynchron)
# ---------------------------------------------------------------------------

async def _fetch_ga4(days: int = 90) -> Optional[GA4Metrics]:
    """
    Liest Traffic-Daten aus der Google Analytics 4 Data API.

    Erfordert:
    - GOOGLE_ANALYTICS_PROPERTY_ID (Format: "properties/123456789")
    - GOOGLE_ANALYTICS_BEARER_TOKEN oder GOOGLE_ANALYTICS_API_KEY

    Gibt None zurück wenn GA4 nicht konfiguriert ist.
    """
    property_id = _env("GOOGLE_ANALYTICS_PROPERTY_ID")
    bearer_token = _env("GOOGLE_ANALYTICS_BEARER_TOKEN")
    if not property_id or not bearer_token:
        return None

    # Normalisiere Property-ID
    if not property_id.startswith("properties/"):
        property_id = f"properties/{property_id}"

    end_date = date.today().isoformat()
    start_date = (date.today() - timedelta(days=days)).isoformat()

    url = f"https://analyticsdata.googleapis.com/v1beta/{property_id}:runReport"
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "dateRanges": [{"startDate": start_date, "endDate": end_date}],
        "dimensions": [{"name": "date"}, {"name": "sessionDefaultChannelGroup"}, {"name": "deviceCategory"}],
        "metrics": [
            {"name": "sessions"},
            {"name": "activeUsers"},
            {"name": "newUsers"},
            {"name": "averageSessionDuration"},
            {"name": "bounceRate"},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            res.raise_for_status()
            report = res.json()
    except (httpx.TimeoutException, httpx.HTTPError):
        return None

    rows = report.get("rows", [])
    if not rows:
        return None

    # Aggregation
    total_sessions = 0
    total_users = 0
    total_new_users = 0
    total_duration = 0.0
    total_bounce = 0.0
    traffic_sources: dict[str, float] = {}
    device_split: dict[str, float] = {}
    sessions_by_day: dict[str, int] = {}

    for row in rows:
        dims = [d.get("value", "") for d in row.get("dimensionValues", [])]
        vals = [_to_float(m.get("value", 0)) for m in row.get("metricValues", [])]
        if len(dims) < 3 or len(vals) < 5:
            continue

        row_date, channel, device = dims[0], dims[1], dims[2]
        sessions, users, new_users, duration, bounce = (
            _to_int(vals[0]), _to_int(vals[1]), _to_int(vals[2]), vals[3], vals[4]
        )

        # Datum formatieren (GA4 liefert YYYYMMDD)
        if len(row_date) == 8:
            row_date = f"{row_date[:4]}-{row_date[4:6]}-{row_date[6:8]}"

        total_sessions += sessions
        total_users += users
        total_new_users += new_users
        total_duration += duration * sessions
        total_bounce += bounce * sessions

        # Traffic-Quellen aggregieren
        channel_key = channel.lower().replace(" ", "_")
        traffic_sources[channel_key] = traffic_sources.get(channel_key, 0.0) + sessions

        # Geräte aggregieren
        device_key = device.lower()
        device_split[device_key] = device_split.get(device_key, 0.0) + sessions

        # Sitzungen nach Tag
        sessions_by_day[row_date] = sessions_by_day.get(row_date, 0) + sessions

    avg_duration = total_duration / total_sessions if total_sessions else 0.0
    avg_bounce = total_bounce / total_sessions if total_sessions else 0.0

    # Prozentuale Anteile berechnen
    total_channel = sum(traffic_sources.values()) or 1
    total_device = sum(device_split.values()) or 1
    traffic_pct = {k: round(v / total_channel * 100, 1) for k, v in traffic_sources.items()}
    device_pct = {k: round(v / total_device * 100, 1) for k, v in device_split.items()}

    return GA4Metrics(
        sessions_30d=total_sessions,
        users_30d=total_users,
        new_users_30d=total_new_users,
        avg_session_duration_sec=round(avg_duration, 1),
        bounce_rate_pct=round(avg_bounce * 100, 1),
        traffic_sources=traffic_pct,
        device_split=device_pct,
        top_landing_pages=[],  # Erfordert separaten Report-Call
        sessions_by_day=sessions_by_day,
    )


# ---------------------------------------------------------------------------
# Instagram Graph API (asynchron)
# ---------------------------------------------------------------------------

async def _fetch_instagram() -> Optional[InstagramMetrics]:
    """
    Liest Social-Media-Daten aus der Instagram Graph API.

    Erfordert:
    - INSTAGRAM_ACCESS_TOKEN (Long-lived User Access Token)
    - INSTAGRAM_ACCOUNT_ID (Business Account ID)

    Gibt None zurück wenn Instagram nicht konfiguriert ist.
    """
    token = _env("INSTAGRAM_ACCESS_TOKEN")
    account_id = _env("INSTAGRAM_ACCOUNT_ID")
    if not token or not account_id:
        return None

    base = "https://graph.instagram.com"
    params_base = {"access_token": token}

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            # Account-Insights
            account_res = await client.get(
                f"{base}/{account_id}",
                params={
                    **params_base,
                    "fields": "followers_count,media_count",
                },
            )
            account_res.raise_for_status()
            account_data = account_res.json()

            # Letzte 25 Posts
            media_res = await client.get(
                f"{base}/{account_id}/media",
                params={
                    **params_base,
                    "fields": "id,media_type,timestamp,like_count,comments_count",
                    "limit": 25,
                },
            )
            media_res.raise_for_status()
            media_data = media_res.json().get("data", [])

    except (httpx.TimeoutException, httpx.HTTPError):
        return None

    followers = _to_int(account_data.get("followers_count", 0))

    # Engagement-Metriken aus Posts berechnen
    engagement_rates = []
    top_posts = []
    for post in media_data:
        likes = _to_int(post.get("like_count", 0))
        comments = _to_int(post.get("comments_count", 0))
        eng = ((likes + comments) / followers * 100) if followers else 0.0
        engagement_rates.append(eng)
        top_posts.append(
            {
                "id": post.get("id", ""),
                "type": post.get("media_type", ""),
                "engagement_rate": round(eng, 2),
                "date": post.get("timestamp", "")[:10],
            }
        )

    top_posts.sort(key=lambda x: x["engagement_rate"], reverse=True)
    avg_engagement = sum(engagement_rates) / len(engagement_rates) if engagement_rates else 0.0

    # Posting-Frequenz berechnen
    post_dates = [p.get("timestamp", "")[:10] for p in media_data if p.get("timestamp")]
    posting_freq = len(post_dates) / 4.0  # Posts der letzten ~4 Wochen → pro Woche

    return InstagramMetrics(
        followers=followers,
        follower_growth_30d=0,  # Erfordert Insights API mit erhöhten Berechtigungen
        avg_reach=0.0,          # Erfordert Insights API
        avg_engagement_rate_pct=round(avg_engagement, 2),
        avg_save_rate_pct=0.0,  # Erfordert Insights API
        story_view_rate_pct=0.0,
        posting_frequency_per_week=round(posting_freq, 1),
        top_posts=top_posts[:5],
        followers_by_day={},
    )


# ---------------------------------------------------------------------------
# TikTok (asynchron)
# ---------------------------------------------------------------------------

async def _fetch_tiktok() -> Optional[TikTokMetrics]:
    """
    Liest Video-Daten aus der TikTok Research API.

    Erfordert:
    - TIKTOK_ACCESS_TOKEN
    - TIKTOK_ACCOUNT_ID

    Gibt None zurück wenn TikTok nicht konfiguriert ist.
    """
    token = _env("TIKTOK_ACCESS_TOKEN")
    if not token:
        return None

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            res = await client.get(
                "https://open.tiktokapis.com/v2/user/info/",
                headers={"Authorization": f"Bearer {token}"},
                params={"fields": "follower_count,following_count,video_count"},
            )
            res.raise_for_status()
            data = res.json().get("data", {}).get("user", {})
    except (httpx.TimeoutException, httpx.HTTPError):
        return None

    return TikTokMetrics(
        followers=_to_int(data.get("follower_count", 0)),
        follower_growth_30d=0,
        avg_video_views=0.0,
        avg_completion_rate_pct=0.0,
        avg_shares=0.0,
        avg_comments=0.0,
        top_videos=[],
    )


# ---------------------------------------------------------------------------
# Externe Kontextdaten (asynchron)
# ---------------------------------------------------------------------------

async def _fetch_external(country_code: str = "DE") -> ExternalContext:
    """
    Lädt externe Kontextdaten: Feiertage und Saisonalität.

    Verwendet die kostenlose Nager.Date API für Feiertage.
    Kein API-Key erforderlich.
    """
    today = date.today()
    holidays_next_14: list[dict] = []
    holidays_today: list[dict] = []

    try:
        years_to_fetch = {today.year}
        if (today + timedelta(days=14)).year != today.year:
            years_to_fetch.add(today.year + 1)

        async with httpx.AsyncClient(timeout=8.0) as client:
            all_holidays: list[dict] = []
            for year in years_to_fetch:
                res = await client.get(
                    f"https://date.nager.at/api/v3/PublicHolidays/{year}/{country_code}"
                )
                if res.status_code == 200:
                    all_holidays.extend(res.json())

        for h in all_holidays:
            h_date_str = h.get("date", "")
            if not h_date_str:
                continue
            try:
                h_date = date.fromisoformat(h_date_str)
            except ValueError:
                continue

            entry = {
                "date": h_date_str,
                "name": h.get("localName", h.get("name", "")),
                "country": country_code,
                "days_away": (h_date - today).days,
            }

            if h_date == today:
                holidays_today.append(entry)
            elif 0 < (h_date - today).days <= 14:
                holidays_next_14.append(entry)

    except (httpx.TimeoutException, httpx.HTTPError):
        pass  # Feiertage sind optional

    # Saisonale Kennzahlen
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    days_remaining = days_in_month - today.day
    month_progress = round(today.day / days_in_month * 100, 1)

    return ExternalContext(
        holidays_next_14d=holidays_next_14,
        holidays_today=holidays_today,
        google_trends={},  # Erweiterbar: pytrends Integration
        current_month=today.month,
        current_day_of_month=today.day,
        days_in_month=days_in_month,
        days_remaining_in_month=days_remaining,
        month_progress_pct=month_progress,
        country_code=country_code,
    )


# ---------------------------------------------------------------------------
# Qualitätsbericht
# ---------------------------------------------------------------------------

def _build_quality_report(
    internal: InternalMetrics,
    stripe: Optional[StripeMetrics],
    ga4: Optional[GA4Metrics],
    instagram: Optional[InstagramMetrics],
    tiktok: Optional[TikTokMetrics],
) -> DataQualityReport:
    """
    Berechnet den Datenqualitäts-Score basierend auf verfügbaren Quellen.

    Gewichtung:
    - Interne Daten (30+ Tage): 40 Punkte
    - Stripe: 25 Punkte
    - GA4: 20 Punkte
    - Instagram oder TikTok: 15 Punkte
    """
    score = 0.0
    connected: list[str] = []
    missing: list[str] = []

    # Interne Daten
    data_days = len(internal.dates)
    if data_days >= 30:
        score += 40.0
    elif data_days >= 14:
        score += 28.0
    elif data_days >= 7:
        score += 18.0
    elif data_days > 0:
        score += 10.0
    connected.append(f"Interne DB ({data_days} Tage)")

    # Stripe
    if stripe:
        score += 25.0
        connected.append("Stripe")
    else:
        missing.append("Stripe")

    # GA4
    if ga4:
        score += 20.0
        connected.append("Google Analytics 4")
    else:
        missing.append("Google Analytics 4")

    # Social Media
    if instagram:
        score += 10.0
        connected.append("Instagram")
    else:
        missing.append("Instagram")

    if tiktok:
        score += 5.0
        connected.append("TikTok")
    else:
        missing.append("TikTok")

    # Impact-Beschreibung
    impact_parts = []
    if not stripe:
        impact_parts.append("Stripe fehlt: Kein CLV, keine Churn-Analyse, kein MRR")
    if not ga4:
        impact_parts.append("GA4 fehlt: Kein Kanal-Attribution, kein Bounce-Rate-Tracking")
    if not instagram and not tiktok:
        impact_parts.append("Social Media fehlt: Keine Social→Revenue Kausalität messbar")
    if data_days < 30:
        impact_parts.append(f"Nur {data_days} Tage Daten: Prognosen weniger zuverlässig")

    missing_impact = "; ".join(impact_parts) if impact_parts else "Alle Kernquellen verbunden."

    return DataQualityReport(
        score=round(min(100.0, score), 1),
        connected_sources=connected,
        missing_sources=missing,
        missing_impact=missing_impact,
        data_days=data_days,
        has_stripe=stripe is not None,
        has_ga4=ga4 is not None,
        has_instagram=instagram is not None,
        has_tiktok=tiktok is not None,
    )


# ---------------------------------------------------------------------------
# Haupt-Einstiegspunkt
# ---------------------------------------------------------------------------

async def aggregate_all_data(
    db: Session,
    days: int = 90,
    country_code: str = "DE",
) -> AggregatedData:
    """
    Aggregiert ALLE verfügbaren Daten parallel aus allen Quellen.

    Läuft alle externen API-Calls gleichzeitig via asyncio.gather().
    Interne DB-Abfragen laufen synchron (SQLAlchemy ist synchron).

    Args:
        db:           SQLAlchemy Session mit Workspace-Kontext
        days:         Analysezeitraum in Tagen (Standard: 90)
        country_code: ISO-Ländercode für Feiertage (Standard: "DE")

    Returns:
        AggregatedData mit allen verfügbaren Daten und Qualitätsbericht

    Raises:
        Niemals — alle Fehler werden intern abgefangen (Graceful Degradation)
    """
    # Schritt 1: Interne Daten synchron laden (DB ist nicht async)
    internal = _fetch_internal(db, days)

    # Schritt 2: Alle externen APIs parallel laden
    results = await asyncio.gather(
        _fetch_stripe(days),
        _fetch_ga4(days),
        _fetch_instagram(),
        _fetch_tiktok(),
        _fetch_external(country_code),
        return_exceptions=True,  # Kein Crash bei Teilfehlern
    )

    # Ergebnisse auspacken (Exceptions → None)
    def _unwrap(result: Any, expected_type: type) -> Any:
        if isinstance(result, Exception):
            return None
        if result is None:
            return None
        return result

    stripe = _unwrap(results[0], StripeMetrics)
    ga4 = _unwrap(results[1], GA4Metrics)
    instagram = _unwrap(results[2], InstagramMetrics)
    tiktok = _unwrap(results[3], TikTokMetrics)
    external_raw = results[4]
    external: ExternalContext = (
        external_raw
        if isinstance(external_raw, ExternalContext)
        else ExternalContext(
            holidays_next_14d=[],
            holidays_today=[],
            google_trends={},
            current_month=date.today().month,
            current_day_of_month=date.today().day,
            days_in_month=calendar.monthrange(date.today().year, date.today().month)[1],
            days_remaining_in_month=0,
            month_progress_pct=0.0,
            country_code=country_code,
        )
    )

    # Schritt 3: Qualitätsbericht erstellen
    quality = _build_quality_report(internal, stripe, ga4, instagram, tiktok)

    return AggregatedData(
        snapshot_date=date.today(),
        data_quality=quality,
        internal=internal,
        stripe=stripe,
        ga4=ga4,
        instagram=instagram,
        tiktok=tiktok,
        external=external,
        connected_sources=quality.connected_sources,
        missing_sources=quality.missing_sources,
    )


# ---------------------------------------------------------------------------
# Kontext-Builder für KI (Schicht 11)
# ---------------------------------------------------------------------------

def build_aggregated_context(data: AggregatedData) -> str:
    """
    Formatiert AggregatedData als kompakten Kontext-String für Claude.

    Diese Funktion erzeugt Block 1–4 des KI-Kontext-Aufbaus (Schicht 11):
    - Datenquellen-Status
    - Zeitreihen-Überblick
    - Externe Kontextfaktoren
    - Ziele & Tasks
    """
    lines: list[str] = []
    internal = data.internal
    quality = data.data_quality

    lines.append(f"DATENQUALITÄT: {quality.score:.0f}/100")
    lines.append(f"Verbunden: {', '.join(quality.connected_sources)}")
    if quality.missing_sources:
        lines.append(f"Fehlt: {', '.join(quality.missing_sources)}")
        lines.append(f"Impact: {quality.missing_impact}")
    lines.append("")

    # Interne Metriken
    if internal.dates:
        lines.append(f"DATENZEITRAUM: {internal.dates[0]} bis {internal.dates[-1]} ({len(internal.dates)} Tage)")
        lines.append(f"UMSATZ 30d: EUR {internal.total_revenue_30d:,.2f} (Ø EUR {internal.avg_daily_revenue:,.2f}/Tag)")
        lines.append(f"TRAFFIC Ø: {internal.avg_traffic:.0f} Besucher/Tag")
        lines.append(f"CONVERSION Ø: {internal.avg_conversion_rate_pct:.2f}%")
        lines.append("")

    # Stripe
    if data.stripe:
        s = data.stripe
        lines.append(f"STRIPE: MRR EUR {s.mrr:,.2f} | ARR EUR {s.arr:,.2f}")
        lines.append(f"  AOV: EUR {s.avg_order_value:.2f} | Refund-Rate: {s.refund_rate_pct:.1f}%")
        lines.append(f"  Kunden aktiv 30d: {s.active_customers_30d} | Fehlzahlungen 30d: {s.failed_payments_30d}")
        lines.append("")

    # GA4
    if data.ga4:
        g = data.ga4
        lines.append(f"GA4: {g.sessions_30d:,} Sessions | {g.new_users_30d:,} neue Nutzer")
        lines.append(f"  Bounce-Rate: {g.bounce_rate_pct:.1f}% | Ø Session: {g.avg_session_duration_sec:.0f}s")
        if g.traffic_sources:
            top_channel = max(g.traffic_sources.items(), key=lambda x: x[1])
            lines.append(f"  Top-Kanal: {top_channel[0]} ({top_channel[1]:.0f}%)")
        lines.append("")

    # Instagram
    if data.instagram:
        ig = data.instagram
        lines.append(f"INSTAGRAM: {ig.followers:,} Follower | {ig.posting_frequency_per_week:.1f} Posts/Woche")
        lines.append(f"  Ø Engagement: {ig.avg_engagement_rate_pct:.2f}%")
        lines.append("")

    # Externe Faktoren
    ext = data.external
    lines.append(f"MONATSVERLAUF: Tag {ext.current_day_of_month}/{ext.days_in_month} ({ext.month_progress_pct:.0f}% durch)")
    lines.append(f"  Noch {ext.days_remaining_in_month} Tage im Monat")
    if ext.holidays_today:
        names = ", ".join(h["name"] for h in ext.holidays_today)
        lines.append(f"  HEUTE FEIERTAG: {names}")
    if ext.holidays_next_14d:
        next_h = ext.holidays_next_14d[0]
        lines.append(f"  Nächster Feiertag: {next_h['name']} in {next_h['days_away']} Tagen ({next_h['date']})")
    lines.append("")

    # Ziele
    if internal.goals:
        lines.append("ZIELE:")
        for goal in internal.goals[:4]:
            status = "auf Kurs" if goal["on_track"] else "HINTER PLAN"
            lines.append(
                f"  {goal['metric']}: {goal['progress_pct']:.0f}% "
                f"(Ist: {goal['current']:.0f} / Ziel: {goal['target']:.0f}) — {status}"
            )
        lines.append("")

    # Tasks
    if internal.tasks_open > 0 or internal.tasks_overdue > 0:
        lines.append(f"TASKS: {internal.tasks_open} offen | {internal.tasks_overdue} überfällig | {internal.tasks_high_priority} hohe Priorität")

    return "\n".join(lines)
