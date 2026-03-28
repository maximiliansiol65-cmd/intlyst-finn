"""
KI-Engine v2.1 — Datenbasierte Analysen mit robuster Fallback-Logik.
"""
from datetime import date, datetime, timedelta
import hashlib
import json
import os
from threading import Lock
from time import perf_counter
from typing import Any, Dict, List, Optional, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db, get_current_workspace_id
from api.auth_routes import User, get_current_user
from models.daily_metrics import DailyMetrics
from security_config import is_configured_secret
from services.analysis_service import (
    build_analysis_context,
    build_analysis_snapshot,
    build_intlyst_dataset,
    contains_numeric_signal,
    get_daily_rows,
    score_insight_quality,
    score_recommendation_quality,
)
from services.enterprise_ai_service import build_enterprise_ai_response

# Analyse-Engine Schichten 1–4
try:
    from analytics.statistics import compute_full_bundle, build_statistics_context
    from analytics.timeseries import analyze_all_timeseries, build_timeseries_context
    from analytics.data_aggregator import aggregate_all_data, build_aggregated_context
    from analytics.causality import analyze_all_causality, build_causality_context
    _ANALYTICS_AVAILABLE = True
except ImportError:
    _ANALYTICS_AVAILABLE = False

# Analyse-Engine Schicht 8 (Social Media)
try:
    from analytics.social_analytics import (
        analyze_instagram_posts,
        analyze_tiktok_videos,
        compute_social_revenue_attribution,
        build_social_analytics_bundle,
        build_social_context,
    )
    _SOCIAL_ANALYTICS_AVAILABLE = True
except ImportError:
    _SOCIAL_ANALYTICS_AVAILABLE = False

router = APIRouter(prefix="/api/ai", tags=["ai"])

CLAUDE_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")


def _f(value: object) -> float:
    coerced = cast(Any, value)
    return float(coerced) if coerced is not None else 0.0


# -- Monitoring ---------------------------------------------------------------

MONITORED_ENDPOINTS = ("analysis", "recommendations", "chat", "forecast", "optimizer", "enterprise")
_monitor_lock = Lock()
_cache_lock = Lock()
CACHE_TTL_SECONDS = 60 * 5  # 5 Minuten — frische Analysen bei aktiven Sessions


def _new_metric() -> dict:
    return {
        "requests": 0,
        "success": 0,
        "errors": 0,
        "fallback": 0,
        "total_ms": 0.0,
        "avg_ms": 0.0,
        "last_source": "local",
        "last_error": "",
        "last_error_at": "",
    }


AI_MONITOR: dict[str, dict] = {name: _new_metric() for name in MONITORED_ENDPOINTS}
AI_CACHE: dict[str, dict] = {}


def _record_metric(endpoint: str, started_at: float, source: str, ok: bool, error_message: str = "") -> float:
    elapsed_ms = round((perf_counter() - started_at) * 1000, 2)
    with _monitor_lock:
        metric = AI_MONITOR[endpoint]
        metric["requests"] += 1
        metric["total_ms"] = round(metric["total_ms"] + elapsed_ms, 2)
        metric["avg_ms"] = round(metric["total_ms"] / metric["requests"], 2)
        metric["last_source"] = source

        if ok:
            metric["success"] += 1
        else:
            metric["errors"] += 1
            metric["last_error"] = error_message[:220]
            metric["last_error_at"] = datetime.utcnow().isoformat()

        if source == "fallback":
            metric["fallback"] += 1

    return elapsed_ms


def _payload_fingerprint(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str, ensure_ascii=True)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> Optional[dict]:
    now = datetime.utcnow().timestamp()
    with _cache_lock:
        entry = AI_CACHE.get(key)
        if not entry:
            return None
        if entry["expires_at"] <= now:
            AI_CACHE.pop(key, None)
            return None
        return dict(entry["payload"])


def _cache_set(key: str, payload: BaseModel) -> None:
    with _cache_lock:
        AI_CACHE[key] = {
            "expires_at": datetime.utcnow().timestamp() + CACHE_TTL_SECONDS,
            "payload": payload.model_dump(),
        }


# -- Schemas -----------------------------------------------------------------

class Insight(BaseModel):
    id: str
    type: str
    title: str
    description: str
    evidence: str
    action: str
    impact: str
    impact_pct: float
    segment: Optional[str] = None
    confidence: int
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class AnalysisResponse(BaseModel):
    generated_at: str
    data_period: str
    summary: str
    health_score: int
    health_label: str
    insights: list[Insight]
    top_action: str
    risk_level: str
    source: str
    processing_ms: float
    causal_chain: list[str] = []  # Ursachen-Kette (vom Top-Metrik bis Kernursache)


class RecommendationItem(BaseModel):
    id: str
    title: str
    description: str
    rationale: str
    expected_result: str
    impact_pct: float
    effort: str
    priority: str
    category: str
    timeframe: str
    action_label: str
    ice_impact: Optional[int] = None      # 1-10: Umsatzwirkung
    ice_confidence: Optional[int] = None  # 1-10: Evidenzstaerke
    ice_ease: Optional[int] = None        # 1-10: Umsetzbarkeit
    ice_score: Optional[int] = None       # I × C × E, max 1000
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class RecommendationsResponse(BaseModel):
    generated_at: str
    recommendations: list[RecommendationItem]
    quick_wins: list[str]
    strategic: list[str]
    source: str
    processing_ms: float


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    force_fallback: bool = False


class ChatResponse(BaseModel):
    reply: str
    data_used: list[str]
    source: str
    processing_ms: float


class ForecastPoint(BaseModel):
    date: str
    value: float
    lower_bound: float
    upper_bound: float


class EnterpriseAIResponse(BaseModel):
    generated_at: str
    functions: list[str]
    data_sources: list[dict]
    analysis: dict
    recommendations: dict
    predict: dict
    alerts: dict
    actions: dict
    automation: dict
    learning: dict
    security: dict
    is_forecast: bool


class ForecastResponse(BaseModel):
    metric: str
    metric_label: str
    horizon_days: int
    historical: list[ForecastPoint]
    forecast: list[ForecastPoint]
    trend: str
    growth_pct: float
    confidence: int
    summary: str
    key_drivers: list[str]
    source: str
    processing_ms: float


class AIMetricsResponse(BaseModel):
    generated_at: str
    model: str
    endpoints: dict[str, dict]
    totals: dict[str, float]


class SocialMetric(BaseModel):
    platform: str
    metric: str
    value: float
    change_pct: float
    label: Optional[str] = None


class BenchmarkDatum(BaseModel):
    metric: str
    your_value: float
    benchmark_value: float
    gap_pct: float
    label: Optional[str] = None


class OptimizedAction(BaseModel):
    id: str
    title: str
    description: str
    rationale: str
    impact_pct: float
    effort: str
    owner: str
    timeframe: str
    category: str


class OptimizerRequest(BaseModel):
    days: int = 30
    social: List[SocialMetric] = Field(default_factory=list)
    benchmarks: List[BenchmarkDatum] = Field(default_factory=list)
    location: str = ""
    force_fallback: bool = False


class OptimizerResponse(BaseModel):
    generated_at: str
    summary: str
    actions: List[OptimizedAction]
    quick_wins: List[str]
    alerts: List[str]
    source: str
    processing_ms: float


# -- Echte Daten aufbauen ----------------------------------------------------

def load_real_data(db: Session, days: int = 30) -> dict:
    return build_analysis_snapshot(db, days)


def build_data_context(data: dict) -> str:
    return build_analysis_context(data)


async def build_enriched_context(db: Session, source_data: dict, days: int = 90) -> str:
    """
    Baut den vollständigen Analyse-Kontext für Claude auf (Schichten 1–3).

    Block A — Bestehender Snapshot (Schicht 0: WoW, Momentum, Anomalien)
    Block B — Statistische Analyse (Schicht 2: Slope, R², Verteilung, Ausreißer)
    Block C — Zeitreihenanalyse (Schicht 3: STL, ADF, Changepoints, Wochentage)
    Block D — Externe Daten (Schicht 1: Stripe, GA4, Feiertage, Monatsstatus)

    Graceful Degradation: Jeder Block ist optional — Fehler werden still ignoriert.
    """
    base = build_data_context(source_data)
    if not _ANALYTICS_AVAILABLE:
        return base

    rows = get_daily_rows(db, days)
    if not rows:
        return base

    dates = [r.date for r in rows]
    revenue = [_f(r.revenue) for r in rows]
    traffic = [_f(r.traffic) for r in rows]
    conv_rate = [_f(r.conversion_rate) for r in rows]
    new_customers = [_f(r.new_customers) for r in rows]

    parts: list[str] = [base]

    # Block B — Schicht 2: Statistische Grundanalyse
    try:
        stats_bundle = compute_full_bundle(revenue, traffic, conv_rate, new_customers, dates)
        stats_ctx = build_statistics_context(stats_bundle)
        if stats_ctx:
            parts.append(stats_ctx)
    except Exception:
        pass

    # Block C — Schicht 3: Zeitreihenanalyse
    try:
        ts_bundle = analyze_all_timeseries(revenue, traffic, conv_rate, new_customers, dates)
        ts_ctx = build_timeseries_context(ts_bundle)
        if ts_ctx:
            parts.append(ts_ctx)
    except Exception:
        pass

    # Block C2 — Schicht 4: Kausalitätsanalyse (Granger + Kreuzkorrelation)
    try:
        from models.business_event import BusinessEvent
        events_raw = db.query(BusinessEvent).order_by(BusinessEvent.event_date.desc()).limit(20).all()
        events_dicts = [{"date": e.event_date, "title": e.title, "category": e.category} for e in events_raw]
        causality_bundle = analyze_all_causality(revenue, traffic, conv_rate, new_customers, dates, events_dicts)
        causality_ctx = build_causality_context(causality_bundle)
        if causality_ctx:
            parts.append(causality_ctx)
    except Exception:
        pass

    # Block D — Schicht 1: Externe Daten (Stripe, GA4, Feiertage)
    try:
        agg_data = await aggregate_all_data(db, days)
        agg_ctx = build_aggregated_context(agg_data)
        if agg_ctx:
            parts.append(agg_ctx)
    except Exception:
        pass

    # Block E — Schicht 8: Social Media Analyse (Instagram + TikTok)
    if _SOCIAL_ANALYTICS_AVAILABLE:
        try:
            from models.social_account import SocialAccount
            from analytics.social_analytics import _parse_ts
            from datetime import date as _date
            import os as _os

            workspace_id = get_current_workspace_id()

            # Instagram: gespeicherte Posts aus Aggregator oder Env-Token
            ig_token = None
            ig_account_id = None
            sa = (
                db.query(SocialAccount)
                .filter(
                    SocialAccount.workspace_id == workspace_id,
                    SocialAccount.platform     == "instagram",
                    SocialAccount.is_active    == True,
                )
                .first()
            ) if workspace_id else None

            if sa and sa.access_token:
                ig_token      = sa.access_token
                ig_account_id = sa.account_id
            else:
                ig_token      = _os.getenv("INSTAGRAM_ACCESS_TOKEN", "").strip() or None
                ig_account_id = _os.getenv("INSTAGRAM_ACCOUNT_ID", "").strip() or None

            ig_analysis   = None
            tt_analysis   = None
            attribution   = None

            if ig_token:
                # Nutze gecachte Post-Daten aus dem Aggregator (agg_data.instagram)
                # falls vorhanden — ansonsten Dummy-Profil mit leeren Posts
                ig_profile: dict = {}
                ig_posts:   list = []
                try:
                    if "agg_data" in dir() and hasattr(agg_data, "instagram") and agg_data.instagram:
                        ig_profile = {
                            "followers_count": agg_data.instagram.follower_count,
                            "follows_count":   0,
                            "media_count":     agg_data.instagram.media_count,
                        }
                except Exception:
                    pass

                ig_analysis = analyze_instagram_posts(ig_posts, ig_profile)

                # Social → Revenue Attribution
                try:
                    rev_dates = [r.date if isinstance(r.date, _date) else _date.fromisoformat(str(r.date)) for r in rows]
                    reach_daily: dict[_date, list[float]] = {}
                    for p in ig_posts:
                        dt = _parse_ts(p.get("timestamp", ""))
                        if dt:
                            reach_daily.setdefault(dt.date(), []).append(float(p.get("reach", 0) or 0))
                    if reach_daily:
                        reach_dates_list = sorted(reach_daily)
                        reach_vals_list  = [sum(reach_daily[d]) for d in reach_dates_list]
                        attribution = compute_social_revenue_attribution(
                            reach_vals_list, reach_dates_list, revenue, rev_dates, "instagram"
                        )
                except Exception:
                    pass

            # TikTok (Env-Token oder DB)
            tt_token = None
            tta = (
                db.query(SocialAccount)
                .filter(
                    SocialAccount.workspace_id == workspace_id,
                    SocialAccount.platform     == "tiktok",
                    SocialAccount.is_active    == True,
                )
                .first()
            ) if workspace_id else None
            if tta and tta.access_token:
                tt_token = tta.access_token
            else:
                tt_token = _os.getenv("TIKTOK_ACCESS_TOKEN", "").strip() or None

            if tt_token:
                tt_analysis = analyze_tiktok_videos([], {})

            if ig_analysis or tt_analysis:
                bundle = build_social_analytics_bundle(ig_analysis, tt_analysis, attribution)
                social_ctx = build_social_context(bundle)
                if social_ctx:
                    parts.append(social_ctx)
        except Exception:
            pass

    return "\n\n".join(p for p in parts if p)


# -- Claude ------------------------------------------------------------------

async def call_claude(system_prompt: str, user_prompt: str, max_tokens: int = 2000) -> str:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY fehlt oder ungueltig.")

    async with httpx.AsyncClient(timeout=40) as client:
        res = await client.post(
            CLAUDE_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )

    if res.status_code != 200:
        err_msg = ""
        try:
            err_msg = res.json().get("error", {}).get("message", "")
        except Exception:
            err_msg = ""
        raise HTTPException(status_code=502, detail=f"Analyse-Fehler: {err_msg or res.text[:200]}")

    payload = res.json()
    content = payload.get("content", [])
    if not content:
        raise HTTPException(status_code=502, detail="Analyse-Fehler: Leere KI-Antwort.")

    return content[0].get("text", "")


def parse_json_response(raw: str) -> dict:
    text = (raw or "").strip()
    if not text:
        raise ValueError("Leere KI-Antwort")

    if "```" in text:
        parts = text.split("```")
        for part in parts:
            candidate = part.strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            try:
                return json.loads(candidate)
            except Exception:
                continue

    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        raise ValueError(f"Kein JSON gefunden: {text[:120]}")


async def _call_claude_with_regeneration(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    issue: str,
) -> dict:
    retry_prompt = (
        f"{user_prompt}\n\n"
        "REGENERATIONS-HINWEIS:\n"
        f"Die vorige Antwort war qualitativ unzureichend: {issue}\n"
        "Erzeuge die Antwort komplett neu. Nutze nur die gelieferten Daten, liefere nur JSON, "
        "nimm keine generischen Floskeln auf und behebe exakt die genannten Maengel."
    )
    raw = await call_claude(system_prompt, retry_prompt, max_tokens=max_tokens)
    return parse_json_response(raw)


def _safe_insights(items: list[dict]) -> list[Insight]:
    safe: list[Insight] = []
    for item in items:
        try:
            safe.append(Insight(**item))
        except Exception:
            continue
    return safe


def _safe_recommendations(items: list[dict]) -> list[RecommendationItem]:
    safe: list[RecommendationItem] = []
    for item in items:
        try:
            safe.append(RecommendationItem(**item))
        except Exception:
            continue
    return safe


def _safe_actions(items: list[dict]) -> List[OptimizedAction]:
    safe: List[OptimizedAction] = []
    for item in items:
        try:
            safe.append(OptimizedAction(**item))
        except Exception:
            continue
    return safe


def _normalize_insight(item: Insight) -> Insight:
    insight_type = "warning" if item.type == "risk" else item.type
    confidence = max(0, min(100, item.confidence))
    return item.model_copy(update={"type": insight_type, "confidence": confidence})


def _validated_insights(items: list[Insight], source_data: dict) -> list[Insight]:
    seen: set[tuple[str, str]] = set()
    valid: list[Insight] = []
    for item in sorted((_normalize_insight(entry) for entry in items), key=lambda entry: entry.impact_pct, reverse=True):
        dedupe_key = (item.title.strip().lower(), item.evidence.strip().lower())
        if dedupe_key in seen:
            continue
        if item.impact_pct <= 0 or item.confidence < 50:
            continue
        if len(item.description.strip()) < 24 or len(item.action.strip()) < 8:
            continue
        if not contains_numeric_signal(item.evidence):
            continue
        scored = Insight(**score_insight_quality(item.model_dump(), source_data))
        if (scored.quality_score or 0) < 60:
            continue
        seen.add(dedupe_key)
        valid.append(scored)
    return valid[:6]


def _validated_recommendations(items: list[RecommendationItem], source_data: dict) -> list[RecommendationItem]:
    seen_titles: set[str] = set()
    valid: list[RecommendationItem] = []
    for item in sorted(items, key=lambda entry: entry.impact_pct, reverse=True):
        normalized_title = item.title.strip().lower()
        if normalized_title in seen_titles:
            continue
        if item.impact_pct <= 0:
            continue
        if len(item.description.strip()) < 20 or len(item.expected_result.strip()) < 12:
            continue
        if not contains_numeric_signal(item.rationale):
            continue
        scored = RecommendationItem(**score_recommendation_quality(item.model_dump(), source_data))
        if (scored.quality_score or 0) < 60:
            continue
        seen_titles.add(normalized_title)
        valid.append(scored)
    return valid[:5]


def _analysis_issue(insights: list[Insight]) -> Optional[str]:
    required_types = {"strength", "weakness", "opportunity"}
    present_types = {insight.type for insight in insights}
    if len(insights) < 4:
        return f"Es wurden nur {len(insights)} valide Insights geliefert, benoetigt sind mindestens 4."
    if not required_types.issubset(present_types):
        missing = ", ".join(sorted(required_types - present_types))
        return f"Es fehlen erforderliche Insight-Typen: {missing}."
    average_quality = sum((insight.quality_score or 0) for insight in insights) / len(insights)
    if average_quality < 70:
        return f"Die durchschnittliche Insight-Qualitaet ist mit {average_quality:.1f} zu niedrig."
    return None


def _recommendation_issue(recommendations: list[RecommendationItem]) -> Optional[str]:
    if len(recommendations) < 3:
        return f"Es wurden nur {len(recommendations)} valide Empfehlungen geliefert, benoetigt sind mindestens 3."
    average_quality = sum((recommendation.quality_score or 0) for recommendation in recommendations) / len(recommendations)
    if average_quality < 68:
        return f"Die durchschnittliche Empfehlungsqualitaet ist mit {average_quality:.1f} zu niedrig."
    categories = {recommendation.category for recommendation in recommendations}
    if len(categories) < 2:
        return "Die Empfehlungen sind zu einseitig und decken weniger als zwei Kategorien ab."
    return None


# -- Context Builder Helpers -------------------------------------------------

def build_social_context(social: List[SocialMetric]) -> str:
    if not social:
        return ""
    lines = ["SOCIAL SIGNALS:"]
    for m in social[:10]:
        label = m.label or m.metric
        lines.append(f"- {m.platform}: {label} {m.value:.2f} ({m.change_pct:+.1f}%)")
    return "\n".join(lines)


def build_benchmark_context(benchmarks: List[BenchmarkDatum]) -> str:
    if not benchmarks:
        return ""
    lines = ["BENCHMARKS:"]
    for b in benchmarks[:10]:
        label = b.label or b.metric
        lines.append(
            f"- {label}: dein Wert {b.your_value:.2f} vs. Benchmark {b.benchmark_value:.2f} ({b.gap_pct:+.1f}%)"
        )
    return "\n".join(lines)


# -- Local fallback builders -------------------------------------------------

def _local_analysis_fallback(source_data: dict, processing_ms: float) -> AnalysisResponse:
    rev = source_data.get("revenue", {})
    conv = source_data.get("conversion_rate", {})
    wow = float(source_data.get("week_over_week", 0) or 0)

    health = 50
    if rev.get("trend") == "up":
        health += 12
    elif rev.get("trend") == "down":
        health -= 12
    if conv.get("trend") == "up":
        health += 8
    elif conv.get("trend") == "down":
        health -= 8
    if wow > 5:
        health += 8
    elif wow < -5:
        health -= 10
    health = max(0, min(100, health))

    if health >= 80:
        health_label, risk_level = "Sehr gut", "low"
    elif health >= 60:
        health_label, risk_level = "Gut", "medium"
    elif health >= 40:
        health_label, risk_level = "Mittel", "medium"
    elif health >= 20:
        health_label, risk_level = "Schwach", "high"
    else:
        health_label, risk_level = "Kritisch", "critical"

    fallback_insights = [
        {
            "id": "revenue-trend",
            "type": "strength" if rev.get("trend") == "up" else "weakness",
            "title": "Umsatztrend im Fokus",
            "description": f"Der Umsatztrend liegt bei {rev.get('trend_pct', 0):+.1f}% im Vergleich der letzten Periodenhaelften.",
            "evidence": f"Umsatztrend: {rev.get('trend_pct', 0):+.1f}%",
            "action": "Top-Kanaele mit positivem Beitrag priorisieren und taeglich monitoren.",
            "impact": "high",
            "impact_pct": 12.0,
            "confidence": 78,
        },
        {
            "id": "conversion-opportunity",
            "type": "opportunity",
            "title": "Conversion gezielt verbessern",
            "description": f"Die Conversion Rate liegt bei {conv.get('avg', 0):.2f}% und zeigt {conv.get('trend_pct', 0):+.1f}% Trend.",
            "evidence": f"Conversion Rate: {conv.get('avg', 0):.2f}%",
            "action": "Landing- und Checkout-Schritte mit den meisten Abbruechen zuerst optimieren.",
            "impact": "medium",
            "impact_pct": 8.0,
            "segment": "funnel",
            "confidence": 74,
        },
    ]
    insights = [Insight(**score_insight_quality(item, source_data)) for item in fallback_insights]

    return AnalysisResponse(
        generated_at=datetime.utcnow().isoformat(),
        data_period=source_data.get("period", ""),
        summary="Lokale Fallback-Analyse aktiv: Kernsignale aus Umsatz, Conversion und Wochenvergleich wurden datenbasiert ausgewertet.",
        health_score=health,
        health_label=health_label,
        insights=insights,
        top_action="Umsatztreiber der letzten 7 Tage sichern und Conversion-Hebel mit hohem Volumen priorisieren.",
        risk_level=risk_level,
        source="fallback",
        processing_ms=processing_ms,
    )


def _local_recommendations_fallback(processing_ms: float, source_data: dict) -> RecommendationsResponse:
    revenue = source_data.get("revenue", {}) if source_data else {}
    conversion_rate = source_data.get("conversion_rate", {}) if source_data else {}
    revenue_per_visit = source_data.get("revenue_per_visit", {}) if source_data else {}
    weekday = source_data.get("weekday_pattern", {}) if source_data else {}
    week_over_week = float(source_data.get("week_over_week", 0) or 0)
    revenue_momentum = float(source_data.get("revenue_momentum_7d", 0) or 0)
    conversion_momentum = float(source_data.get("conversion_momentum_7d", 0) or 0)

    fallback_recommendations = [
        {
            "id": "prioritize-top-revenue-sources",
            "title": "Top-Umsatzquellen priorisieren",
            "description": "Kanaele und Aktionen mit dem hoechsten Umsatzbeitrag der letzten 14 Tage gezielt ausbauen und schwache Quellen aktiv zurueckfahren.",
            "rationale": f"Der Wochenvergleich liegt bei {week_over_week:+.1f}% und das 7-Tage-Umsatz-Momentum bei {revenue_momentum:+.1f}%. Bei EUR {revenue.get('avg', 0):,.2f} Tagesumsatz lohnt es sich, Gewinner sofort zu priorisieren statt Budget breit zu verteilen.",
            "expected_result": f"Stabilerer Wochenumsatz und ein Plus von 6-10% auf Basis von aktuell EUR {revenue.get('avg', 0):,.2f} pro Tag.",
            "impact_pct": 10.0,
            "effort": "medium",
            "priority": "high",
            "category": "sales",
            "timeframe": "this_week",
            "action_label": "Kanaele priorisieren",
        },
        {
            "id": "optimize-funnel",
            "title": "Conversion-Funnel optimieren",
            "description": "Kritische Drop-off-Schritte im meistgenutzten Funnel identifizieren und die zwei groessten Reibungspunkte noch diese Woche verbessern.",
            "rationale": f"Die Conversion Rate liegt bei {conversion_rate.get('avg', 0):.2f}% und das Conversion-Momentum bei {conversion_momentum:+.2f} Prozentpunkten. Schon kleine Verbesserungen wirken bei konstantem Traffic direkt auf Umsatz und Effizienz.",
            "expected_result": f"+0.2 bis +0.5 Prozentpunkte Conversion und hoeherer Umsatz pro Visit als aktuell EUR {revenue_per_visit.get('avg', 0):.4f}.",
            "impact_pct": 8.0,
            "effort": "medium",
            "priority": "medium",
            "category": "product",
            "timeframe": "this_month",
            "action_label": "Funnel verbessern",
        },
        {
            "id": "kpi-guardrails",
            "title": "KPI-Guardrails definieren",
            "description": "Schwellenwerte fuer Umsatz, Conversion und Wochentagsleistung definieren und automatisch pruefen, damit negative Abweichungen sofort sichtbar werden.",
            "rationale": f"Die Spreizung zwischen {weekday.get('best_day', 'starkem Tag')} und {weekday.get('worst_day', 'schwachem Tag')} liegt bei {weekday.get('spread_pct', 0):+.1f}%. Solche Muster und Trendbrueche sollten bei einer Conversion von {conversion_rate.get('avg', 0):.2f}% nicht erst manuell entdeckt werden.",
            "expected_result": "30-60 Minuten schnellere Reaktion auf Leistungsabfall und fruehere Gegenmassnahmen bei KPI-Bruechen.",
            "impact_pct": 6.5,
            "effort": "low",
            "priority": "medium",
            "category": "operations",
            "timeframe": "immediate",
            "action_label": "Grenzwerte setzen",
        },
    ]
    recs = [RecommendationItem(**score_recommendation_quality(item, source_data)) for item in fallback_recommendations]
    return RecommendationsResponse(
        generated_at=datetime.utcnow().isoformat(),
        recommendations=recs,
        quick_wins=[
            "Top-3 Traffic-Quellen nach Conversion pruefen und Budget umverteilen.",
            "Checkout-Abbruchquote der letzten 7 Tage analysieren und Sofort-Fixes planen.",
        ],
        strategic=[
            "Woechentlichen Performance-Review mit festen KPI-Schwellen etablieren.",
            "Experiment-Backlog fuer Conversion-Hebel mit Impact-Schaetzung aufbauen.",
        ],
        source="fallback",
        processing_ms=processing_ms,
    )


def _local_chat_fallback(message: str, source_data: dict, processing_ms: float) -> ChatResponse:
    rev = (source_data or {}).get("revenue", {})
    trend = rev.get("trend_pct", 0)
    reply = (
        "Externe KI ist aktuell nicht verfuegbar. "
        f"Lokale Einschaetzung: Umsatztrend {trend:+.1f}%. "
        "Pruefe zuerst Traffic-Qualitaet und Conversion-Engpaesse in den letzten 7 Tagen. "
        f"Deine Frage war: '{message[:80]}'."
    )
    data_used = []
    if rev.get("total"):
        data_used.append(f"Umsatz EUR {rev.get('total'):,.0f}")
    if trend:
        data_used.append(f"Trend {trend:+.1f}%")

    return ChatResponse(reply=reply, data_used=data_used, source="fallback", processing_ms=processing_ms)


def _local_forecast(values: list[float], horizon: int, future_dates: list[str]) -> tuple[list[ForecastPoint], str, float, int, str, list[str]]:
    last_window = values[-14:]
    n = len(last_window)

    # Exponentiell gewichteter Basis: neuere Tage erhalten mehr Gewicht
    weights = [1.5 ** i for i in range(n)]
    total_w = sum(weights)
    baseline = sum(last_window[i] * weights[i] for i in range(n)) / total_w

    # Kurzzeit-Slope (7 Tage) und Langzeit-Slope (14 Tage), blended 70/30
    recent = last_window[-7:] if n >= 7 else last_window
    short_slope = (recent[-1] - recent[0]) / max(1, len(recent) - 1)
    long_slope  = (last_window[-1] - last_window[0]) / max(1, n - 1)
    blended_slope = 0.7 * short_slope + 0.3 * long_slope

    end = last_window[-1]
    volatility = (max(last_window) - min(last_window)) / baseline * 100 if baseline else 0

    trend = "stable"
    if blended_slope > baseline * 0.003:
        trend = "up"
    elif blended_slope < -baseline * 0.003:
        trend = "down"

    growth_pct = ((end - last_window[0]) / last_window[0] * 100) if last_window[0] else 0
    confidence = max(40, min(85, int(85 - min(40, volatility))))

    base_band = max(0.06, min(0.22, volatility / 100))
    forecast: list[ForecastPoint] = []
    projected = end
    for i in range(horizon):
        # Slope-Daempfung: Mean Reversion ueber Zeit (0.97^i)
        dampened = blended_slope * (0.97 ** i)
        projected = max(0.0, projected + dampened)
        # Konfidenzband weitet sich mit sqrt(i/horizon) — je weiter in die Zukunft, desto breiter
        band = base_band * (1.0 + 0.20 * ((i + 1) / horizon) ** 0.5)
        forecast.append(
            ForecastPoint(
                date=future_dates[i],
                value=round(projected, 4),
                lower_bound=round(max(0.0, projected * (1 - band)), 4),
                upper_bound=round(projected * (1 + band), 4),
                is_forecast=True,
            )
        )

    summary = (
        f"Lokale Prognose (gewichteter Trend): Basis {baseline:.2f}, "
        f"Slope {blended_slope:+.4f}/Tag, Volatilitaet {volatility:.1f}%, Konfidenz {confidence}%."
    )
    drivers = [
        f"Kurzzeit-Slope (7d): {short_slope:+.4f}/Tag",
        f"Langzeit-Slope (14d): {long_slope:+.4f}/Tag",
        f"Daten-Volatilitaet: {volatility:.1f}%",
    ]
    return forecast, trend, round(growth_pct, 2), confidence, summary, drivers


def _local_optimizer_fallback(processing_ms: float) -> OptimizerResponse:
    actions = [
        OptimizedAction(
            id="stabilize-revenue",
            title="Umsatz stabilisieren",
            description="Priorisiere Top-Kanaele mit positivem Trend und sichere Budgets fuer die naechsten 2 Wochen.",
            rationale="Erhalt von Kernumsatz schafft Spielraum fuer Experimente.",
            impact_pct=14.0,
            effort="medium",
            owner="growth",
            timeframe="7d",
            category="revenue",
        ),
        OptimizedAction(
            id="lift-conversion",
            title="Conversion-Lift",
            description="Fokus auf Checkout- und Landing-Optimierungen mit hohem Traffic und hohem Drop-off.",
            rationale="Konversionshebel liefern kurzfristig messbare Effekte.",
            impact_pct=11.0,
            effort="medium",
            owner="product",
            timeframe="14d",
            category="conversion",
        ),
        OptimizedAction(
            id="reactivate-users",
            title="Bestandskunden reaktivieren",
            description="Starte eine Reaktivierungskampagne mit personalisierten Incentives fuer inaktive Kunden.",
            rationale="Guenstige CAC und schnelle Umsatzwirkung durch bestehende Kontakte.",
            impact_pct=9.0,
            effort="low",
            owner="crm",
            timeframe="7d",
            category="retention",
        ),
    ]
    return OptimizerResponse(
        generated_at=datetime.utcnow().isoformat(),
        summary="Fallback-Plan aktiv: Stabilisiere Umsatzquellen, hebe Conversion und reaktiviere Bestandskunden.",
        actions=actions,
        quick_wins=["Budget auf Top-Kanaele umschichten", "Checkout-Reibung in einer Session fixen"],
        alerts=["KI nicht verfuegbar, lokal priorisiert"],
        source="fallback",
        processing_ms=processing_ms,
    )


# -- Endpunkte ---------------------------------------------------------------

@router.get("/analysis", response_model=AnalysisResponse)
async def get_analysis(days: int = 30, force_fallback: bool = Query(default=False), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    started = perf_counter()
    source_data = load_real_data(db, days)

    # Extrahiere Ursachen-Kette explizit
    causal_chain = []
    if _ANALYTICS_AVAILABLE:
        try:
            rows = get_daily_rows(db, days)
            if rows:
                dates = [r.date for r in rows]
                revenue = [_f(r.revenue) for r in rows]
                traffic = [_f(r.traffic) for r in rows]
                conv_rate = [_f(r.conversion_rate) for r in rows]
                new_customers = [_f(r.new_customers) for r in rows]
                from models.business_event import BusinessEvent
                events_raw = db.query(BusinessEvent).order_by(BusinessEvent.event_date.desc()).limit(20).all()
                events_dicts = [{"date": e.event_date, "title": e.title, "category": e.category} for e in events_raw]
                from analytics.causality import analyze_all_causality, build_causal_chain
                causality_bundle = analyze_all_causality(revenue, traffic, conv_rate, new_customers, dates, events_dicts)
                causal_chain = build_causal_chain(causality_bundle)
        except Exception:
            causal_chain = []

    if not source_data:
        ms = _record_metric("analysis", started, "local", True)
        return AnalysisResponse(
            generated_at=datetime.utcnow().isoformat(),
            data_period="",
            summary="Keine ausreichenden Daten fuer eine KI-Analyse verfuegbar.",
            health_score=0,
            health_label="Keine Daten",
            insights=[],
            top_action="Zuerst mindestens 7 Tage taegliche Metriken erfassen.",
            risk_level="medium",
            source="local",
            processing_ms=ms,
            causal_chain=[],
        )

    cache_key = f"analysis:{days}:{_payload_fingerprint(source_data)}"
    if not force_fallback:
        cached = _cache_get(cache_key)
        if cached:
            _record_metric("analysis", started, cached.get("source", "claude"), True)
            # Ensure causal_chain is present in cache (for backward compatibility)
            if "causal_chain" not in cached:
                cached["causal_chain"] = causal_chain
            return AnalysisResponse(**cached)

    # Schichten 1–3: Angereicherter Kontext (statistisch + Zeitreihe + Externe Daten)
    context = await build_enriched_context(db, source_data, days)
    system = """Du bist ein McKinsey Senior Partner mit 20 Jahren Erfahrung in datengetriebener Unternehmensanalyse.
Deine Methodik: MECE-Strukturierung + Chain-of-Thought Reasoning (Signal → Ursache → Implikation → Massnahme).
Du identifizierst nicht nur was passiert, sondern WARUM — und welche EINE Massnahme den groessten Unterschied macht.
Du kalibrierst Konfidenz strikt: confidence >75 nur fuer Signale mit mindestens 2 konsistenten Datenpunkten.
Du benennst explizit was die Zahlen NICHT erklaeren (Negative Space) — das ist genauso wertvoll.
Gib ausschliesslich valides JSON ohne Zusatztext aus."""

    prompt = f"""Analysiere die folgenden Geschaeftsdaten mit McKinsey-Methodik:

{context}

Antworte AUSSCHLIESSLICH als JSON in diesem Schema:
{{
  "summary": "3-4 Saetze: Kernsituation + Kausalkette + Prioritaet — mit konkreten Zahlen",
  "health_score": 0,
  "health_label": "Sehr gut|Gut|Mittel|Schwach|Kritisch",
  "top_action": "Eine priorisierte Massnahme mit erwarteter Euro-Wirkung",
  "risk_level": "low|medium|high|critical",
  "insights": [
    {{
      "id": "slug",
      "type": "strength|weakness|opportunity|risk",
      "title": "max 7 Woerter",
      "description": "Chain-of-Thought: Signal → Ursache → Implikation (2-3 Saetze mit Zahlen)",
      "evidence": "Konkrete Kennzahl mit absolutem Wert und Vergleich",
      "action": "Sofortmassnahme mit messbarem Ziel",
      "impact": "high|medium|low",
      "impact_pct": 0,
      "segment": null,
      "confidence": 0
    }}
  ]
}}

Regeln:
- Chain-of-Thought pflicht: jedes Insight erklaert Signal → Ursache → Implikation → Massnahme.
- Nutze nur gegebene Daten, keine freien Annahmen.
- Erzeuge 4-6 Insights: mindestens 1x strength, 1x weakness, 1x opportunity.
- Einen "contrarian" Insight hinzufuegen: Was widerspricht den ersten Erwartungen oder laeuft gegen den Haupttrend?
- Bevorzuge abgeleitete Kennzahlen: Umsatz/Visit, AOV, Neukunden/Conversion, 7-Tage-Momentum, Wochentagsmuster.
- Jedes Insight: evidence mit Zahl, confidence 0-100, impact_pct > 0.
- confidence >75 = starkes Signal (mehrere Datenpunkte konsistent); 50-75 = mittel; <50 = schwach.
- Sortiere Insights nach impact_pct absteigend."""

    if force_fallback:
        ms = _record_metric("analysis", started, "fallback", True)
        resp = _local_analysis_fallback(source_data, ms)
        resp.causal_chain = causal_chain
        return resp

    try:
        raw = await call_claude(system, prompt, max_tokens=2100)
        parsed = parse_json_response(raw)
        insights = _validated_insights(_safe_insights(parsed.get("insights", [])), source_data)
        issue = _analysis_issue(insights)
        if issue:
            parsed = await _call_claude_with_regeneration(system, prompt, 2100, issue)
            insights = _validated_insights(_safe_insights(parsed.get("insights", [])), source_data)
            issue = _analysis_issue(insights)

        if issue:
            ms = _record_metric("analysis", started, "fallback", True)
            resp = _local_analysis_fallback(source_data, ms)
            resp.causal_chain = causal_chain
            return resp

        ms = _record_metric("analysis", started, "claude", True)
        response = AnalysisResponse(
            generated_at=datetime.utcnow().isoformat(),
            data_period=source_data.get("period", ""),
            summary=str(parsed.get("summary", "")),
            health_score=max(0, min(100, int(parsed.get("health_score", 50)))),
            health_label=str(parsed.get("health_label", "Neutral")),
            insights=insights,
            top_action=str(parsed.get("top_action", "")),
            risk_level=str(parsed.get("risk_level", "medium")),
            source="claude",
            processing_ms=ms,
            causal_chain=causal_chain,
        )
        _cache_set(cache_key, response)
        return response
    except Exception as exc:
        ms = _record_metric("analysis", started, "fallback", False, str(exc))
        resp = _local_analysis_fallback(source_data, ms)
        resp.causal_chain = causal_chain
        return resp


@router.get("/insights", response_model=AnalysisResponse)
async def get_insights(days: int = 30, force_fallback: bool = Query(default=False), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await get_analysis(days=days, force_fallback=force_fallback, db=db)


@router.get("/recommendations", response_model=RecommendationsResponse)
async def get_recommendations(days: int = 30, force_fallback: bool = Query(default=False), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    started = perf_counter()
    source_data = load_real_data(db, days)

    if not source_data:
        ms = _record_metric("recommendations", started, "local", True)
        return RecommendationsResponse(
            generated_at=datetime.utcnow().isoformat(),
            recommendations=[],
            quick_wins=["Zuerst Datenbasis aufbauen (mindestens 7 Tage)."],
            strategic=["Tracking fuer Umsatz, Traffic und Conversion vervollstaendigen."],
            source="local",
            processing_ms=ms,
        )

    cache_key = f"recommendations:{days}:{_payload_fingerprint(source_data)}"
    if not force_fallback:
        cached = _cache_get(cache_key)
        if cached:
            _record_metric("recommendations", started, cached.get("source", "claude"), True)
            return RecommendationsResponse(**cached)

    # Schichten 1–3: Angereicherter Kontext
    context = await build_enriched_context(db, source_data, days)
    system = """Du bist ein McKinsey Growth Partner der Massnahmen nach ICE-Framework priorisiert.
ICE = Impact × Confidence × Ease (je 1-10, Gesamtscore max 1000).
Impact: geschaetzter Umsatz-/Conversion-Effekt. Confidence: Staerke der Evidenz. Ease: Umsetzbarkeit in Stunden/Tagen.
Empfehlungen muessen quantitativ begruendet sein — kein Rationale ohne konkrete Zahl aus den Daten.
Gib nur valides JSON ohne Zusatztext aus."""

    prompt = f"""Erstelle ICE-priorisierte Handlungsempfehlungen aus diesen Daten:

{context}

Antwort nur als JSON:
{{
  "recommendations": [
    {{
      "id": "slug",
      "title": "max 6 Woerter",
      "description": "2 Saetze mit konkretem Hebel",
      "rationale": "Begruendung mit mindestens einer Zahl aus den Daten",
      "expected_result": "Messbarer Effekt mit Einheit (EUR oder %)",
      "impact_pct": 0,
      "effort": "low|medium|high",
      "priority": "high|medium|low",
      "category": "marketing|product|sales|operations|finance",
      "timeframe": "immediate|this_week|this_month|this_quarter",
      "action_label": "max 4 Woerter",
      "ice_impact": 0,
      "ice_confidence": 0,
      "ice_ease": 0,
      "ice_score": 0
    }}
  ],
  "quick_wins": ["..."],
  "strategic": ["..."]
}}

Regeln:
- 3-5 recommendations, sortiert nach ice_score absteigend.
- ice_score = ice_impact × ice_confidence × ice_ease (jedes 1-10).
- Jedes rationale: mindestens eine Zahl (EUR, %, Trend).
- Timeframe-Pflicht: mind. 1x 'immediate', mind. 1x 'this_week'.
- Mindestens 1 Umsatzhebel, mindestens 1 Effizienz-/Funnel-Hebel.
- Bevorzuge: Umsatz/Visit, AOV, Zielabweichung, 7-Tage-Momentum, Wochentagsmuster.
- quick_wins: 2-3 Punkte, heute umsetzbar.
- strategic: 2-3 Punkte, mittel- bis langfristig."""

    if force_fallback:
        ms = _record_metric("recommendations", started, "fallback", True)
        return _local_recommendations_fallback(ms, source_data)

    try:
        raw = await call_claude(system, prompt, max_tokens=2100)
        parsed = parse_json_response(raw)
        recs = _validated_recommendations(_safe_recommendations(parsed.get("recommendations", [])), source_data)
        issue = _recommendation_issue(recs)
        if issue:
            parsed = await _call_claude_with_regeneration(system, prompt, 2100, issue)
            recs = _validated_recommendations(_safe_recommendations(parsed.get("recommendations", [])), source_data)
            issue = _recommendation_issue(recs)

        if issue:
            ms = _record_metric("recommendations", started, "fallback", True)
            return _local_recommendations_fallback(ms, source_data)

        ms = _record_metric("recommendations", started, "claude", True)
        response = RecommendationsResponse(
            generated_at=datetime.utcnow().isoformat(),
            recommendations=recs,
            quick_wins=[str(x) for x in parsed.get("quick_wins", [])][:3],
            strategic=[str(x) for x in parsed.get("strategic", [])][:3],
            source="claude",
            processing_ms=ms,
        )
        _cache_set(cache_key, response)
        return response
    except Exception as exc:
        ms = _record_metric("recommendations", started, "fallback", False, str(exc))
        return _local_recommendations_fallback(ms, source_data)


@router.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    started = perf_counter()
    # Vollstaendiger 90-Tage-Datensatz fuer maximalen Kontext im Chat
    dataset = build_intlyst_dataset(db)
    context = dataset.get("context", "Keine Daten verfuegbar.")
    source_data = dataset.get("snapshots", {}).get("30d", {}) if dataset.get("snapshots") else {}

    if body.force_fallback:
        ms = _record_metric("chat", started, "fallback", True)
        return _local_chat_fallback(body.message, source_data, ms)

    system = f"""Du bist Intlyst — ein proaktiver persoenlicher Business Analyst.
Du hast Zugriff auf Geschaeftsdaten ueber 7, 30 und 90 Tage.

VERHALTEN:
- Beantworte die Frage direkt und datenbasiert.
- Gib automatisch verwandten Kontext mit (z.B. bei Umsatz-Frage: auch Trend + Ursache + WoW-Vergleich).
- Nenne konkrete Zahlen in EUR und Prozent wo immer moeglich.
- Erklaere Kausalketten: nicht nur WAS, sondern WARUM.
- Schliesse jede Antwort mit einer kurzen Rueckfrage ab, die zur Vertiefung einlaedt.
- Antworte auf Deutsch, klar und direkt — ohne Floskeln.

GESCHAEFTSDATEN (7d / 30d / 90d):
{context}"""

    messages = []
    for h in (body.history or [])[-8:]:
        if h.role in ("user", "assistant") and h.content:
            messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": body.message})

    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        ms = _record_metric("chat", started, "fallback", False, "ANTHROPIC_API_KEY fehlt")
        return _local_chat_fallback(body.message, source_data, ms)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                CLAUDE_URL,
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 700,
                    "system": system,
                    "messages": messages,
                },
            )

        if res.status_code != 200:
            ms = _record_metric("chat", started, "fallback", False, f"Claude {res.status_code}")
            return _local_chat_fallback(body.message, source_data, ms)

        reply = res.json().get("content", [{}])[0].get("text", "")
        data_used: list[str] = []
        rev = source_data.get("revenue", {}) if source_data else {}
        if rev.get("total"):
            data_used.append(f"Umsatz EUR {rev['total']:,.0f}")
        if rev.get("trend_pct") not in (None, 0):
            data_used.append(f"Trend {rev.get('trend_pct', 0):+.1f}%")
        if source_data and source_data.get("week_over_week") not in (None, 0):
            data_used.append(f"WoW {source_data.get('week_over_week', 0):+.1f}%")
        if source_data and source_data.get("revenue_momentum_7d") not in (None, 0):
            data_used.append(f"Momentum {source_data.get('revenue_momentum_7d', 0):+.1f}%")
        if dataset.get("anomaly_count", 0) > 0:
            data_used.append(f"{dataset['anomaly_count']} Anomalie(n) erkannt")

        ms = _record_metric("chat", started, "claude", True)
        return ChatResponse(reply=reply, data_used=data_used, source="claude", processing_ms=ms)
    except Exception as exc:
        ms = _record_metric("chat", started, "fallback", False, str(exc))
        return _local_chat_fallback(body.message, source_data, ms)


@router.get("/forecast/{metric}", response_model=ForecastResponse)
async def get_forecast(
    metric: str,
    horizon: int = 30,
    force_fallback: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    started = perf_counter()
    valid_metrics = {
        "revenue": "Umsatz",
        "traffic": "Traffic",
        "conversions": "Conversions",
        "conversion_rate": "Conversion Rate",
        "new_customers": "Neue Kunden",
    }

    if metric not in valid_metrics:
        _record_metric("forecast", started, "local", False, "ungueltige metrik")
        raise HTTPException(status_code=400, detail=f"Metrik ungueltig: {list(valid_metrics.keys())}")
    if horizon not in (30, 60, 90):
        _record_metric("forecast", started, "local", False, "ungueltiger horizon")
        raise HTTPException(status_code=400, detail="Horizon muss 30, 60 oder 90 sein.")

    since = date.today() - timedelta(days=60)
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )

    if len(rows) < 14:
        _record_metric("forecast", started, "local", False, "zu wenige daten")
        raise HTTPException(status_code=404, detail="Zu wenige Daten fuer Prognose (mindestens 14 Tage).")

    metric_fn = {
        "revenue": lambda r: _f(r.revenue),
        "traffic": lambda r: _f(r.traffic),
        "conversions": lambda r: _f(r.conversions),
        "conversion_rate": lambda r: _f(r.conversion_rate) * 100,
        "new_customers": lambda r: _f(r.new_customers),
    }[metric]

    hist_values = [metric_fn(r) for r in rows]
    hist_dates = [str(r.date) for r in rows]
    historical = [
        ForecastPoint(
            date=hist_dates[i],
            value=round(hist_values[i], 4),
            lower_bound=round(hist_values[i], 4),
            upper_bound=round(hist_values[i], 4),
            is_forecast=False,
        )
        for i in range(len(hist_values))
    ]

    today = date.today()
    future_dates = [str(today + timedelta(days=i + 1)) for i in range(horizon)]

    if force_fallback:
        fc, trend, growth, conf, summary, drivers = _local_forecast(hist_values, horizon, future_dates)
        ms = _record_metric("forecast", started, "fallback", True)
        return ForecastResponse(
            metric=metric,
            metric_label=valid_metrics[metric],
            horizon_days=horizon,
            historical=historical,
            forecast=fc,
            trend=trend,
            growth_pct=growth,
            confidence=conf,
            summary=summary,
            key_drivers=drivers,
            source="fallback",
            processing_ms=ms,
        )

    hist_tail_vals = hist_values[-14:]
    hist_tail_dates = hist_dates[-14:]
    hist_text = "\n".join(f"{hist_tail_dates[i]}: {hist_tail_vals[i]:.4f}" for i in range(len(hist_tail_vals)))
    trend_pct = ((hist_tail_vals[-1] - hist_tail_vals[0]) / hist_tail_vals[0] * 100) if hist_tail_vals[0] else 0

    system = """Du bist ein Datenwissenschaftler fuer Zeitreihenprognosen.
Antworte nur mit validem JSON und nutze ausschliesslich gegebene Zahlen."""
    prompt = f"""Erstelle eine {horizon}-Tage Prognose fuer {valid_metrics[metric]}.

Historische Daten (letzte 14 Tage):
{hist_text}

Statistiken:
- Durchschnitt: {sum(hist_tail_vals)/len(hist_tail_vals):.4f}
- Min: {min(hist_tail_vals):.4f}
- Max: {max(hist_tail_vals):.4f}
- Trend: {trend_pct:.2f}%

Antwort nur als JSON:
{{
  "trend": "up|down|stable",
  "growth_pct": 0,
  "confidence": 0,
  "summary": "2 Saetze mit Zahlen",
  "key_drivers": ["Treiber 1", "Treiber 2"],
  "forecast": [
    {{
      "date": "{future_dates[0]}",
      "value": 0,
      "lower_bound": 0,
      "upper_bound": 0
    }}
  ]
}}

Regeln:
- Exakt {horizon} Forecast-Eintraege.
- lower_bound <= value <= upper_bound.
- Konfidenz 0-100.
- Keine freien Annahmen ausser aus den gezeigten Trendmustern."""

    try:
        raw = await call_claude(system, prompt, max_tokens=1500)
        parsed = parse_json_response(raw)

        forecast_points: list[ForecastPoint] = []
        raw_forecast = parsed.get("forecast", [])
        for i, p in enumerate(raw_forecast[:horizon]):
            try:
                value = float(p["value"])
                lb = float(p.get("lower_bound", value * 0.85))
                ub = float(p.get("upper_bound", value * 1.15))
                if lb > value:
                    lb = value
                if ub < value:
                    ub = value
                date_str = str(p.get("date") or future_dates[min(i, len(future_dates) - 1)])
                forecast_points.append(
                    ForecastPoint(
                        date=date_str,
                        value=round(value, 4),
                        lower_bound=round(lb, 4),
                        upper_bound=round(ub, 4),
                        is_forecast=True,
                    )
                )
            except Exception:
                continue

        if len(forecast_points) < horizon:
            local_fc, trend, growth, conf, summary, drivers = _local_forecast(hist_values, horizon, future_dates)
            ms = _record_metric("forecast", started, "fallback", True)
            return ForecastResponse(
                metric=metric,
                metric_label=valid_metrics[metric],
                horizon_days=horizon,
                historical=historical,
                forecast=local_fc,
                trend=trend,
                growth_pct=growth,
                confidence=conf,
                summary=summary,
                key_drivers=drivers,
                source="fallback",
                processing_ms=ms,
            )

        ms = _record_metric("forecast", started, "claude", True)
        return ForecastResponse(
            metric=metric,
            metric_label=valid_metrics[metric],
            horizon_days=horizon,
            historical=historical,
            forecast=forecast_points,
            trend=str(parsed.get("trend", "stable")),
            growth_pct=float(parsed.get("growth_pct", 0)),
            confidence=max(0, min(100, int(parsed.get("confidence", 70)))),
            summary=str(parsed.get("summary", "")),
            key_drivers=[str(x) for x in parsed.get("key_drivers", [])],
            source="claude",
            processing_ms=ms,
        )
    except Exception as exc:
        local_fc, trend, growth, conf, summary, drivers = _local_forecast(hist_values, horizon, future_dates)
        ms = _record_metric("forecast", started, "fallback", False, str(exc))
        return ForecastResponse(
            metric=metric,
            metric_label=valid_metrics[metric],
            horizon_days=horizon,
            historical=historical,
            forecast=local_fc,
            trend=trend,
            growth_pct=growth,
            confidence=conf,
            summary=summary,
            key_drivers=drivers,
            source="fallback",
            processing_ms=ms,
        )


@router.post("/optimizer", response_model=OptimizerResponse)
async def run_optimizer(body: OptimizerRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    started = perf_counter()
    source_data = load_real_data(db, body.days)

    # If there are no core metrics, we cannot build a plan from data.
    if not source_data:
        ms = _record_metric("optimizer", started, "fallback", True, "keine daten")
        return _local_optimizer_fallback(ms)

    data_context = build_data_context(source_data)
    social_context = build_social_context(body.social)
    benchmark_context = build_benchmark_context(body.benchmarks)
    location_context = f"STANDORT: {body.location}" if body.location else ""

    context_blocks = [data_context, social_context, benchmark_context, location_context]
    context = "\n\n".join([c for c in context_blocks if c])

    system = """Du bist ein KI-Optimizer fuer Wachstums- und Effizienzprogramme.
Du priorisierst Massnahmen strikt datenbasiert, kombinierst KPIs, Social Signals, Benchmarks und Standortfaktoren.
Gib nur valides JSON ohne zusaetzlichen Text aus."""

    prompt = f"""Erstelle einen priorisierten Action-Plan aus den folgenden Kontexten:

{context}

Antwort NUR als JSON:
{{
  "summary": "2-3 Saetze: Was ist das Kernproblem, was sind die Hebel?",
  "actions": [
    {{
      "id": "slug",
      "title": "max 6 Woerter",
      "description": "2 Saetze mit konkretem Hebel",
      "rationale": "Warum gerade diese Massnahme (mit Zahl)?",
      "impact_pct": 0,
      "effort": "low|medium|high",
      "owner": "growth|marketing|product|sales|ops|crm",
      "timeframe": "now|7d|30d",
      "category": "revenue|conversion|retention|acquisition|ops"
    }}
  ],
  "quick_wins": ["2-3 sehr schnelle Schritte"],
  "alerts": ["Risiken oder Abhaengigkeiten"]
}}

Regeln:
- 4-6 Aktionen, impact_pct > 0 und nach Impact absteigend sortiert.
- Mindestens 1 Aktion fuer Conversion oder Acquisition.
- Mindestens 1 Aktion fuer kurzfristige Umsatzsicherung.
- Nutze Social- und Benchmark-Kontext, falls vorhanden, in der rationale.
- Alerts nur wenn echter Risikohinweis besteht."""

    if body.force_fallback:
        ms = _record_metric("optimizer", started, "fallback", True)
        return _local_optimizer_fallback(ms)

    try:
        raw = await call_claude(system, prompt, max_tokens=2300)
        parsed = parse_json_response(raw)
        actions = _safe_actions(parsed.get("actions", []))
        actions = sorted(actions, key=lambda a: a.impact_pct, reverse=True)[:6]

        if len(actions) < 3:
            ms = _record_metric("optimizer", started, "fallback", True)
            return _local_optimizer_fallback(ms)

        ms = _record_metric("optimizer", started, "claude", True)
        return OptimizerResponse(
            generated_at=datetime.utcnow().isoformat(),
            summary=str(parsed.get("summary", "")),
            actions=actions,
            quick_wins=[str(x) for x in parsed.get("quick_wins", [])][:3],
            alerts=[str(x) for x in parsed.get("alerts", [])][:3],
            source="claude",
            processing_ms=ms,
        )
    except Exception as exc:
        ms = _record_metric("optimizer", started, "fallback", False, str(exc))
        return _local_optimizer_fallback(ms)


@router.get("/metrics", response_model=AIMetricsResponse)
def get_ai_metrics(current_user: User = Depends(get_current_user)):
    with _monitor_lock:
        endpoints = {k: dict(v) for k, v in AI_MONITOR.items()}

    total_requests = sum(v["requests"] for v in endpoints.values())
    total_errors = sum(v["errors"] for v in endpoints.values())
    total_fallback = sum(v["fallback"] for v in endpoints.values())
    avg_ms = round(
        sum(v["avg_ms"] * v["requests"] for v in endpoints.values()) / total_requests,
        2,
    ) if total_requests else 0.0

    return AIMetricsResponse(
        generated_at=datetime.utcnow().isoformat(),
        model=CLAUDE_MODEL,
        endpoints=endpoints,
        totals={
            "requests": float(total_requests),
            "errors": float(total_errors),
            "fallback": float(total_fallback),
            "error_rate": round((total_errors / total_requests) * 100, 2) if total_requests else 0.0,
            "fallback_rate": round((total_fallback / total_requests) * 100, 2) if total_requests else 0.0,
            "avg_ms": avg_ms,
        },
    )


@router.get("/enterprise", response_model=EnterpriseAIResponse)
def get_enterprise_ai(
    industry: str = Query(default="ecommerce"),
    lookback_days: int = Query(default=30, ge=14, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    workspace_id: int = Depends(get_current_workspace_id),
):
    started = perf_counter()
    payload = {
        "user_id": current_user.id,
        "workspace_id": workspace_id,
        "industry": industry,
        "lookback_days": lookback_days,
    }
    cache_key = _payload_fingerprint(payload)
    cached = _cache_get(cache_key)
    if cached:
        _record_metric("enterprise", started, "cache", True)
        return EnterpriseAIResponse(**cached)

    try:
        response_payload = build_enterprise_ai_response(
            db,
            current_user=current_user,
            workspace_id=workspace_id,
            industry=industry,
            lookback_days=lookback_days,
        )
        response = EnterpriseAIResponse(**response_payload)
        _cache_set(cache_key, response)
        _record_metric("enterprise", started, "local", True)
        return response
    except Exception as exc:
        _record_metric("enterprise", started, "fallback", False, str(exc))
        raise HTTPException(status_code=500, detail="Enterprise-AI konnte nicht berechnet werden.")


@router.get("/health-check")
def check_api_status(current_user: User = Depends(get_current_user)):
    key = os.getenv("ANTHROPIC_API_KEY", "")
    configured = is_configured_secret(key, prefixes=("sk-ant-",), min_length=20)
    return {
        "configured": configured,
        "key_preview": f"{key[:12]}..." if len(key) > 12 else "nicht gesetzt",
        "model": CLAUDE_MODEL,
        "status": "ready" if configured else "missing_key",
    }
