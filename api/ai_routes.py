"""
KI-Engine v2.1 — Datenbasierte Analysen mit robuster Fallback-Logik.
"""
import logging
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
from models.audit_log import AuditLog
from services.claude_runtime import (
    CLAUDE_API_URL,
    build_claude_headers,
    build_claude_payload,
    get_claude_runtime_config,
)

logger = logging.getLogger(__name__)


def _record_ai_audit(db: Session, user: "User", action: str, summary: str) -> None:
    """Record an AI interaction in the audit log."""
    try:
        import json as _json
        workspace_id = getattr(user, "active_workspace_id", None)
        if not workspace_id:
            return
        row = AuditLog(
            workspace_id=workspace_id,
            actor_user_id=user.id,
            actor_role="ai_engine",
            action=action,
            entity_type="recommendation",
            metadata_json=_json.dumps({"summary": summary[:500]}),
            created_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("AI audit logging skipped: %s", exc)

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
from services.forecast_service import persist_forecast_diagnosis
from services.decision_prompting import (
    DECISION_OPERATING_SYSTEM_PROMPT,
    MARKETING_SALES_DECISION_APPENDIX,
)

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


def _f(value: object) -> float:
    coerced = cast(Any, value)
    return float(coerced) if coerced is not None else 0.0


# -- Monitoring ---------------------------------------------------------------

MONITORED_ENDPOINTS = ("analysis", "recommendations", "chat", "forecast", "optimizer", "enterprise")
_monitor_lock = Lock()
_cache_lock = Lock()
CACHE_TTL_SECONDS = 60 * 5  # 5 Minuten — frische Analysen bei aktiven Sessions
CACHE_MAX_ENTRIES = 2000  # prevent unbounded cache growth across workspaces


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
        if len(AI_CACHE) >= CACHE_MAX_ENTRIES:
            oldest_key = min(AI_CACHE, key=lambda k: AI_CACHE[k]["expires_at"])
            AI_CACHE.pop(oldest_key, None)
        AI_CACHE[key] = {
            "expires_at": datetime.utcnow().timestamp() + CACHE_TTL_SECONDS,
            "payload": payload.model_dump(),
        }


def _workspace_cache_key(workspace_id: Optional[int], key: str) -> str:
    prefix = f"workspace:{workspace_id}" if workspace_id else "workspace:anon"
    return f"{prefix}:{key}"


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
    priority: Optional[str] = None  # critical|high|medium|low
    problem: Optional[str] = None
    cause_primary: Optional[str] = None
    cause_primary_score: Optional[int] = None
    cause_secondary: Optional[list[str]] = None
    cause_secondary_scores: Optional[list[int]] = None
    cause_amplifiers: Optional[list[str]] = None
    cause_amplifier_scores: Optional[list[int]] = None
    impact_level: Optional[str] = None      # high|medium|low
    confidence_level: Optional[str] = None  # high|medium|low
    time_factor: Optional[str] = None       # immediate|this_week|this_month
    expected_result: Optional[str] = None
    kpi_link: Optional[str] = None
    strategic_context: Optional[str] = None
    segment: Optional[str] = None
    owner_role: Optional[str] = None
    dashboard_summary: Optional[str] = None
    primary_metric: Optional[str] = None
    benchmark_note: Optional[str] = None
    forecast_note: Optional[str] = None
    immediate_action: Optional[str] = None
    mid_term_action: Optional[str] = None
    long_term_action: Optional[str] = None
    what_happened: Optional[str] = None
    why_it_happened: Optional[str] = None
    what_it_means: Optional[str] = None
    what_to_do: Optional[str] = None
    pattern_link: Optional[str] = None
    pattern_score: Optional[int] = None
    priority_reason: Optional[str] = None
    period_7d: Optional[str] = None
    period_30d: Optional[str] = None
    period_12m: Optional[str] = None
    confidence: int
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class PatternItem(BaseModel):
    id: str
    category: str
    metric: str
    title: str
    what_happens: str
    when: str
    evidence: str
    why_likely: str
    score: int
    strength: str
    action: str
    windows: dict[str, float] = {}
    repeated: bool = False
    business_impact: Optional[float] = None


class DeviationItem(BaseModel):
    id: str
    metric: str
    title: str
    status: str
    what_happened: str
    why_it_happened: str
    what_it_means: str
    what_to_do: str
    compare: dict[str, float] = {}
    value: float
    baseline_7d: float
    baseline_30d: float
    baseline_90d: float
    priority: str
    impact_score: int
    urgency: str
    pattern_link: Optional[str] = None


class DashboardKPIItem(BaseModel):
    id: str
    kpi: str
    dashboard_summary: str
    main_cause: str
    main_cause_score: Optional[int] = None
    secondary_causes: list[str] = []
    secondary_scores: list[int] = []
    amplifiers: list[str] = []
    amplifier_scores: list[int] = []
    recommendation: str
    immediate_action: Optional[str] = None
    mid_term_action: Optional[str] = None
    long_term_action: Optional[str] = None
    owner_role: Optional[str] = None
    benchmark_note: Optional[str] = None
    forecast_note: Optional[str] = None
    period_7d: Optional[str] = None
    period_30d: Optional[str] = None
    period_12m: Optional[str] = None
    priority: Optional[str] = None
    impact_pct: Optional[float] = None


class OpportunityCard(BaseModel):
    id: str
    title: str
    observation: str
    why_now: str
    evidence: str
    impact_score: int
    confidence_score: int
    recommended_action: str
    priority: Optional[str] = None
    owner_role: Optional[str] = None
    primary_metric: Optional[str] = None
    period_7d: Optional[str] = None
    period_30d: Optional[str] = None
    period_12m: Optional[str] = None
    strategic_context: Optional[str] = None


class AnalysisResponse(BaseModel):
    generated_at: str
    data_period: str
    summary: str
    ceo_summary: Optional[str] = None
    health_score: int
    health_label: str
    insights: list[Insight]
    top_action: str
    risk_level: str
    source: str
    processing_ms: float
    causal_chain: list[str] = []  # Ursachen-Kette (vom Top-Metrik bis Kernursache)
    dashboard_items: list[DashboardKPIItem] = []
    patterns: list[PatternItem] = []
    deviations: list[DeviationItem] = []
    opportunities: list[OpportunityCard] = []
    top_opportunity: Optional[OpportunityCard] = None


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
    owner_role: Optional[str] = None
    kpi_link: Optional[str] = None
    priority_reason: Optional[str] = None
    strategic_context: Optional[str] = None
    risk_level: Optional[str] = None
    ice_impact: Optional[int] = None      # 1-10: Umsatzwirkung
    ice_confidence: Optional[int] = None  # 1-10: Evidenzstaerke
    ice_ease: Optional[int] = None        # 1-10: Umsetzbarkeit
    ice_score: Optional[int] = None       # I × C × E, max 1000
    revenue_impact: Optional[int] = None
    growth_impact: Optional[int] = None
    risk_impact: Optional[int] = None
    team_impact: Optional[int] = None
    business_impact_score: Optional[float] = None
    impact_classification: Optional[str] = None
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class StrategicScenario(BaseModel):
    name: str
    strategy: str
    kpi_effect: str
    main_risk: str
    recommendation: str


class RolePriority(BaseModel):
    role: str
    immediate: list[str] = []
    mid_term: list[str] = []
    long_term: list[str] = []


class RecommendationsResponse(BaseModel):
    generated_at: str
    recommendations: list[RecommendationItem]
    quick_wins: list[str]
    strategic: list[str]
    opportunities: list[str] = []
    risks: list[str] = []
    scenarios: list[StrategicScenario] = []
    role_priorities: list[RolePriority] = []
    primary_recommendation: Optional[str] = None
    primary_recommendation_reason: Optional[str] = None
    primary_recommendation_effect: Optional[str] = None
    next_step: Optional[str] = None
    source: str
    processing_ms: float


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    force_fallback: bool = False
    profile_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    data_used: list[str]
    source: str
    processing_ms: float


def _chat_role_prompt(profile_id: Optional[str]) -> str:
    profile = str(profile_id or "management_ceo").lower()
    if profile in {"marketing_team", "content_team"}:
        return """Du agierst als AI-CMO innerhalb einer CEO- und Management-App.

DEIN AUFTRAG:
- Analysiere Marketing-Kampagnen, Kanaele, Inhalte und Budget-Allokation.
- Erkenne Trends, Chancen, Schwaechen und Leistungsschwankungen frueh.
- Priorisiere Massnahmen nach Wirkung, ROI, strategischem Fit und Ressourcenbedarf.
- Plane Content, Kampagnen und Stories immer mit klaren KPIs wie Traffic, Leads, Conversion, Engagement oder Reichweite.
- Empfehle A/B-Tests, Budget-Shifts, Timing-Anpassungen und Content-Optimierungen, wenn sie den groessten Hebel versprechen.
- Formuliere Reports so, dass CEO und COO Fortschritt, Chancen und Risiken sofort verstehen.

ANTWORTSTIL:
- Antworte wie ein Chief Marketing Officer: strategisch, klar priorisiert und direkt umsetzbar.
- Verknuepfe jede Empfehlung mit dem betroffenen Kanal, KPI-Ziel und naechsten Test.
- Erklaere Schwankungen moeglichst mit Ursache -> Wirkung -> Massnahme.
- Wenn Daten fehlen, benenne sauber, welche Marketingdaten fuer eine bessere Entscheidung fehlen."""
    return """Du bist Intlyst — ein proaktiver AI-CEO und persoenlicher Business Analyst.

VERHALTEN:
- Beantworte die Frage direkt und datenbasiert.
- Gib automatisch verwandten Kontext mit (z.B. bei Umsatz-Frage: auch Trend + Ursache + WoW-Vergleich).
- Nenne konkrete Zahlen in EUR und Prozent wo immer moeglich.
- Erklaere Kausalketten: nicht nur WAS, sondern WARUM.
- Priorisiere Massnahmen wie ein Unternehmensberater: zuerst kritisch, dann mittel- und langfristig.
- Ordne jede Empfehlung an Unternehmensziele wie Wachstum, Profitabilitaet, Effizienz oder Risikoreduktion an."""


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
    persisted_forecast_id: Optional[int] = None
    linked_insight_id: Optional[int] = None
    root_cause_insight_id: Optional[int] = None
    decision_problem_id: Optional[int] = None
    hidden_problems: list[dict] = []
    opportunities: list[dict] = []
    top_opportunity: Optional[dict] = None
    recommended_actions: list[str] = []


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
    key, claude_model = get_claude_runtime_config()
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY fehlt oder ungueltig.")

    async with httpx.AsyncClient(timeout=40) as client:
        res = await client.post(
            CLAUDE_API_URL,
            headers=build_claude_headers(key),
            json=build_claude_payload(
                user_prompt,
                model=claude_model,
                max_tokens=max_tokens,
                system_prompt=system_prompt,
            ),
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


def _safe_scenarios(items: list[dict]) -> list[StrategicScenario]:
    safe: list[StrategicScenario] = []
    for item in items:
        try:
            safe.append(StrategicScenario(**item))
        except Exception:
            continue
    return safe


def _safe_role_priorities(items: list[dict]) -> list[RolePriority]:
    safe: list[RolePriority] = []
    for item in items:
        try:
            safe.append(RolePriority(**item))
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


def _owner_role_for_signal(text: Optional[str]) -> str:
    haystack = str(text or "").lower()
    if any(token in haystack for token in ("cash", "marge", "profit", "roi", "liquid", "budget", "kosten", "umsatz")):
        return "CFO"
    if any(token in haystack for token in ("traffic", "lead", "kampagne", "reach", "marketing", "content")):
        return "CMO"
    if any(token in haystack for token in ("conversion", "funnel", "checkout", "prozess", "effizienz", "team", "operations")):
        return "COO"
    if any(token in haystack for token in ("forecast", "chance", "segment", "markt", "benchmark", "scenario", "szenario")):
        return "Strategist"
    return "CEO"


def _period_note(snapshot: dict, metric_key: str, label: str) -> str:
    metric = snapshot.get(metric_key, {}) if snapshot else {}
    trend_pct = float(metric.get("trend_pct", 0) or 0)
    avg_value = metric.get("avg", metric.get("latest", 0))
    return f"{label}: {avg_value:.2f} im Schnitt, Veraenderung {trend_pct:+.1f}%."


def _build_dashboard_items(insights: list[Insight], source_data: dict) -> list[DashboardKPIItem]:
    if not insights:
        return []

    revenue = source_data.get("revenue", {}) if source_data else {}
    conversion = source_data.get("conversion_rate", {}) if source_data else {}
    traffic = source_data.get("traffic", {}) if source_data else {}
    weekday = source_data.get("weekday_pattern", {}) if source_data else {}
    revenue_momentum = float(source_data.get("revenue_momentum_7d", 0) or 0) if source_data else 0.0

    items: list[DashboardKPIItem] = []
    for insight in insights[:5]:
        metric_label = insight.primary_metric or insight.kpi_link or insight.title
        benchmark_note = insight.benchmark_note or (
            f"Interner Zielvergleich: Umsatztrend {float(revenue.get('trend_pct', 0) or 0):+.1f}%, "
            f"Conversion {float(conversion.get('trend_pct', 0) or 0):+.1f}%."
        )
        forecast_note = insight.forecast_note or (
            f"Wenn sich das aktuelle Momentum von {revenue_momentum:+.1f}% fortsetzt, bleibt der KPI in den naechsten 30 Tagen unter Druck."
            if insight.priority in {"critical", "high"} and revenue_momentum < 0
            else f"Bei stabilem Trend ist in 30 Tagen ein kontrollierbares KPI-Fenster realistisch."
        )
        dashboard_summary = insight.dashboard_summary or insight.problem or insight.description
        items.append(
            DashboardKPIItem(
                id=insight.id,
                kpi=metric_label,
                dashboard_summary=dashboard_summary,
                main_cause=insight.cause_primary or insight.description,
                main_cause_score=insight.cause_primary_score,
                secondary_causes=insight.cause_secondary or [],
                secondary_scores=insight.cause_secondary_scores or [],
                amplifiers=insight.cause_amplifiers or [],
                amplifier_scores=insight.cause_amplifier_scores or [],
                recommendation=insight.action,
                immediate_action=insight.immediate_action or insight.action,
                mid_term_action=insight.mid_term_action or insight.expected_result,
                long_term_action=insight.long_term_action or insight.strategic_context,
                owner_role=insight.owner_role or _owner_role_for_signal(metric_label),
                benchmark_note=benchmark_note,
                forecast_note=forecast_note,
                period_7d=insight.period_7d or _period_note({"traffic": traffic}, "traffic", "7 Tage"),
                period_30d=insight.period_30d or _period_note(source_data, "revenue", "30 Tage"),
                period_12m=insight.period_12m or (
                    f"12 Monate: Wochentags-Spread {float(weekday.get('spread_pct', 0) or 0):+.1f}% zwischen {weekday.get('best_day', 'Top-Tag')} und {weekday.get('worst_day', 'schwachem Tag')}."
                ),
                priority=insight.priority,
                impact_pct=insight.impact_pct,
            )
        )
    return items


def _build_opportunity_cards(insights: list[Insight]) -> list[OpportunityCard]:
    cards: list[OpportunityCard] = []
    for insight in insights:
        if insight.type not in {"opportunity", "strength"}:
            continue
        cards.append(
            OpportunityCard(
                id=insight.id,
                title=insight.title,
                observation=insight.dashboard_summary or insight.description,
                why_now=insight.strategic_context or insight.problem or insight.description,
                evidence=insight.evidence,
                impact_score=max(1, min(100, int(round(insight.impact_pct * 6.5)))),
                confidence_score=max(1, min(100, int(insight.confidence))),
                recommended_action=insight.immediate_action or insight.action,
                priority=insight.priority,
                owner_role=insight.owner_role,
                primary_metric=insight.primary_metric or insight.kpi_link,
                period_7d=insight.period_7d,
                period_30d=insight.period_30d,
                period_12m=insight.period_12m,
                strategic_context=insight.strategic_context,
            )
        )
    return sorted(cards, key=lambda card: (card.impact_score, card.confidence_score), reverse=True)[:5]


def _normalize_insight(item: Insight) -> Insight:
    insight_type = "warning" if item.type == "risk" else item.type
    confidence = max(0, min(100, item.confidence))
    impact_pct = float(item.impact_pct or 0)

    def _priority_from_signal() -> str:
        if impact_pct >= 15 and confidence >= 70:
            return "critical"
        if impact_pct >= 10:
            return "high"
        if impact_pct >= 5:
            return "medium"
        return "low"

    def _impact_level() -> str:
        if impact_pct >= 12:
            return "high"
        if impact_pct >= 7:
            return "medium"
        return "low"

    def _confidence_level() -> str:
        if confidence >= 75:
            return "high"
        if confidence >= 60:
            return "medium"
        return "low"

    def _time_factor(priority: str) -> str:
        if priority == "critical":
            return "immediate"
        if priority == "high":
            return "this_week"
        return "this_month"

    priority = item.priority or _priority_from_signal()
    primary_score = item.cause_primary_score or min(95, max(50, confidence))
    secondary = item.cause_secondary or []
    secondary_scores = item.cause_secondary_scores or [max(30, primary_score - 20) for _ in secondary]
    amplifiers = item.cause_amplifiers or []
    amplifier_scores = item.cause_amplifier_scores or [max(20, primary_score - 30) for _ in amplifiers]
    update = {
        "type": insight_type,
        "confidence": confidence,
        "priority": priority,
        "impact_level": item.impact_level or _impact_level(),
        "confidence_level": item.confidence_level or _confidence_level(),
        "time_factor": item.time_factor or _time_factor(priority),
        "problem": item.problem or item.title or item.evidence,
        "cause_primary": item.cause_primary or item.description,
        "cause_primary_score": primary_score,
        "cause_secondary_scores": secondary_scores,
        "cause_amplifier_scores": amplifier_scores,
        "expected_result": item.expected_result or "",
        "owner_role": item.owner_role or _owner_role_for_signal(item.kpi_link or item.primary_metric or item.title),
        "immediate_action": item.immediate_action or item.action,
        "mid_term_action": item.mid_term_action or item.expected_result or item.action,
        "long_term_action": item.long_term_action or item.strategic_context or item.expected_result or item.action,
        "what_happened": item.what_happened or item.problem or item.title,
        "why_it_happened": item.why_it_happened or item.cause_primary or item.description,
        "what_it_means": item.what_it_means or item.strategic_context or item.kpi_link,
        "what_to_do": item.what_to_do or item.immediate_action or item.action,
        "pattern_link": item.pattern_link or "",
        "pattern_score": item.pattern_score,
        "priority_reason": item.priority_reason or "",
    }
    return item.model_copy(update=update)


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
    for item in sorted(
        items,
        key=lambda entry: float(entry.business_impact_score or 0) if entry.business_impact_score is not None else entry.impact_pct,
        reverse=True,
    ):
        normalized_title = item.title.strip().lower()
        if normalized_title in seen_titles:
            continue
        if item.impact_pct <= 0:
            continue
        if len(item.description.strip()) < 20 or len(item.expected_result.strip()) < 12:
            continue
        if not contains_numeric_signal(item.rationale):
            continue
        item_data = item.model_dump()
        revenue_impact = int(item_data.get("revenue_impact") or item_data.get("ice_impact") or 0)
        growth_impact = int(item_data.get("growth_impact") or item_data.get("ice_confidence") or 0)
        risk_impact = int(item_data.get("risk_impact") or 0)
        team_impact = int(item_data.get("team_impact") or item_data.get("ice_ease") or 0)
        business_impact_score = round((revenue_impact * 0.4) + (growth_impact * 0.3) + (risk_impact * 0.2) + (team_impact * 0.1), 1)
        if business_impact_score > 80:
            impact_classification = "geschaeftskritisch"
        elif business_impact_score >= 60:
            impact_classification = "sehr wichtig"
        elif business_impact_score >= 40:
            impact_classification = "sinnvoll"
        else:
            impact_classification = "optional"
        item_data.update(
            {
                "revenue_impact": max(0, min(100, revenue_impact)),
                "growth_impact": max(0, min(100, growth_impact)),
                "risk_impact": max(0, min(100, risk_impact)),
                "team_impact": max(0, min(100, team_impact)),
                "business_impact_score": business_impact_score,
                "impact_classification": impact_classification,
            }
        )
        scored = RecommendationItem(**score_recommendation_quality(item_data, source_data))
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

    trend_pct = float(rev.get("trend_pct", 0) or 0)
    conv_trend_pct = float(conv.get("trend_pct", 0) or 0)

    def _priority_from_delta(delta: float) -> str:
        if delta <= -15:
            return "critical"
        if delta <= -8:
            return "high"
        if delta <= -3:
            return "medium"
        return "low"

    def _impact_level(impact_pct: float) -> str:
        if impact_pct >= 12:
            return "high"
        if impact_pct >= 7:
            return "medium"
        return "low"

    def _confidence_level(confidence: int) -> str:
        if confidence >= 75:
            return "high"
        if confidence >= 60:
            return "medium"
        return "low"

    def _time_factor(priority: str) -> str:
        if priority == "critical":
            return "immediate"
        if priority == "high":
            return "this_week"
        return "this_month"

    fallback_insights = [
        {
            "id": "revenue-trend",
            "type": "strength" if rev.get("trend") == "up" else "weakness",
            "title": "Umsatztrend im Fokus",
            "description": f"Der Umsatztrend liegt bei {trend_pct:+.1f}% im Vergleich der letzten Periodenhaelften.",
            "evidence": f"Umsatztrend: {trend_pct:+.1f}%",
            "dashboard_summary": f"Umsatz veraendert sich um {trend_pct:+.1f}% und wirkt direkt auf Liquiditaet und Zielerreichung.",
            "priority": _priority_from_delta(trend_pct),
            "problem": f"Umsatztrend {trend_pct:+.1f}% gegen Vorperiode",
            "cause_primary": "Budget verteilt sich zu stark auf schwaechere Umsatzquellen",
            "cause_primary_score": 78,
            "cause_secondary": ["Kanalqualitaet schwankt zwischen den Wochen"],
            "cause_secondary_scores": [62],
            "cause_amplifiers": ["Monitoring findet nicht taeglich statt"],
            "cause_amplifier_scores": [48],
            "action": "Top-Kanaele mit positivem Beitrag priorisieren und taeglich monitoren.",
            "expected_result": "Stabilerer Umsatztrend innerhalb von 14 Tagen und klarere Budgeteffizienz.",
            "impact": "high",
            "impact_pct": 12.0,
            "impact_level": _impact_level(12.0),
            "confidence_level": _confidence_level(78),
            "time_factor": _time_factor(_priority_from_delta(trend_pct)),
            "kpi_link": "KPI-Bezug: Umsatzentwicklung, Wochenvergleich und 7-Tage-Momentum.",
            "strategic_context": "Das Signal entscheidet direkt ueber kurzfristige Liquiditaet und den Spielraum fuer Wachstum.",
            "owner_role": "CEO",
            "primary_metric": "Umsatz",
            "benchmark_note": f"Interner Benchmark: Wochenvergleich {wow:+.1f}% gegen Zielstabilitaet von mindestens 0%.",
            "forecast_note": f"Wenn sich der Umsatztrend von {trend_pct:+.1f}% fortsetzt, sinkt der Umsatz in den naechsten 30 Tagen weiter.",
            "immediate_action": "Budget der letzten 7 Tage auf die zwei staerksten Umsatzquellen konzentrieren.",
            "mid_term_action": "Innerhalb von 14 Tagen die schwachen Kanaele reduzieren und Gewinner ausbauen.",
            "long_term_action": "Ein regelbasiertes Umsatz-Portfolio mit klaren Stop-/Scale-Regeln etablieren.",
            "what_happened": f"Der Umsatz veraendert sich ueber den Zeitraum um {trend_pct:+.1f}%.",
            "why_it_happened": "Wahrscheinlich werden starke Umsatzquellen noch nicht konsequent priorisiert und schwaechere Quellen laufen zu lange weiter.",
            "what_it_means": "Das wirkt direkt auf Umsatz, Liquiditaet und Zielerreichung.",
            "what_to_do": "Die besten Umsatzquellen sofort absichern und schwaechere Quellen aktiv reduzieren.",
            "pattern_link": "Mit 7-, 30- und 90-Tage-Mustern gegenpruefen, ob der Trend wiederkehrt.",
            "pattern_score": 72,
            "priority_reason": "Hohe Prioritaet, weil Umsatz direkt den groessten Business-Effekt hat.",
            "period_7d": f"7 Tage: Umsatz-Momentum {float(source_data.get('revenue_momentum_7d', 0) or 0):+.1f}%.",
            "period_30d": f"30 Tage: Umsatztrend {trend_pct:+.1f}% versus Vorperiode.",
            "period_12m": "12 Monate: Historischer Vergleich ist im Fallback begrenzt, deshalb Trend monatlich weiter validieren.",
            "confidence": 78,
        },
        {
            "id": "conversion-opportunity",
            "type": "opportunity",
            "title": "Conversion gezielt verbessern",
            "description": f"Die Conversion Rate liegt bei {conv.get('avg', 0):.2f}% und zeigt {conv_trend_pct:+.1f}% Trend.",
            "evidence": f"Conversion Rate: {conv.get('avg', 0):.2f}%",
            "dashboard_summary": f"Conversion liegt bei {conv.get('avg', 0):.2f}% und entscheidet ueber die Ertragskraft des vorhandenen Traffics.",
            "priority": _priority_from_delta(conv_trend_pct),
            "problem": f"Conversion {conv.get('avg', 0):.2f}% mit Trend {conv_trend_pct:+.1f}%",
            "cause_primary": "Reibungspunkte im meistgenutzten Funnel bremsen Abschluesse",
            "cause_primary_score": 74,
            "cause_secondary": ["Traffic-Qualitaet variiert zwischen Kanaelen"],
            "cause_secondary_scores": [58],
            "cause_amplifiers": ["Fehlende gezielte Tests in den kritischen Schritten"],
            "cause_amplifier_scores": [45],
            "action": "Landing- und Checkout-Schritte mit den meisten Abbruechen zuerst optimieren.",
            "expected_result": "Steigerung der Conversion um 0.2 bis 0.5 Prozentpunkte.",
            "impact": "medium",
            "impact_pct": 8.0,
            "impact_level": _impact_level(8.0),
            "confidence_level": _confidence_level(74),
            "time_factor": _time_factor(_priority_from_delta(conv_trend_pct)),
            "kpi_link": "KPI-Bezug: Conversion Rate, Umsatz pro Visit und Funnel-Effizienz.",
            "strategic_context": "Verbessert die Profitabilitaet des bestehenden Traffics ohne sofort mehr Marketingbudget zu benoetigen.",
            "segment": "funnel",
            "owner_role": "COO",
            "primary_metric": "Conversion Rate",
            "benchmark_note": f"Interner Benchmark: Umsatz pro Visit liegt bei EUR {float(source_data.get('revenue_per_visit', {}).get('avg', 0) or 0):.4f}.",
            "forecast_note": "Wenn die Conversion in diesem Bereich stabilisiert wird, verbessert sich die Umsatzqualitaet schon innerhalb der naechsten Wochen.",
            "immediate_action": "Die zwei groessten Drop-off-Stellen im Funnel heute priorisieren.",
            "mid_term_action": "In 2 bis 4 Wochen Tests fuer Landingpage und Checkout sauber auswerten.",
            "long_term_action": "Ein wiederholbares Funnel-Optimierungsprogramm mit festen KPI-Schwellen aufsetzen.",
            "what_happened": f"Die Conversion Rate liegt bei {conv.get('avg', 0):.2f}% und ihr Trend liegt bei {conv_trend_pct:+.1f}%.",
            "why_it_happened": "Wahrscheinlich bremsen Reibung im Funnel und schwankende Traffic-Qualitaet die Abschluesse.",
            "what_it_means": "Der vorhandene Traffic bringt weniger Umsatz als moeglich.",
            "what_to_do": "Erst die groessten Reibungspunkte im Funnel beheben, bevor mehr Traffic eingekauft wird.",
            "pattern_link": "Mit wiederkehrenden Funnel-Mustern der letzten 7, 30 und 90 Tage verknuepfen.",
            "pattern_score": 68,
            "priority_reason": "Wichtig, weil schon kleine Verbesserungen grosse Wirkung auf den bestehenden Traffic haben.",
            "period_7d": f"7 Tage: Conversion-Momentum {float(source_data.get('conversion_momentum_7d', 0) or 0):+.2f} Prozentpunkte.",
            "period_30d": f"30 Tage: Conversion-Trend {conv_trend_pct:+.1f}% gegen Vorperiode.",
            "period_12m": "12 Monate: Funnel-Muster sollten saisonal geprueft und gegen groeßere Traffic-Schwankungen abgesichert werden.",
            "confidence": 74,
        },
    ]
    insights = [Insight(**score_insight_quality(item, source_data)) for item in fallback_insights]

    opportunities = _build_opportunity_cards(insights)

    return AnalysisResponse(
        generated_at=datetime.utcnow().isoformat(),
        data_period=source_data.get("period", ""),
        summary="Lokale Fallback-Analyse aktiv: Kernsignale aus Umsatz, Conversion und Wochenvergleich wurden datenbasiert ausgewertet.",
        ceo_summary="CEO-Fokus: Umsatztrend absichern, Conversion-Hebel im Kernfunnel priorisieren und die groesste Wachstumschance aktiv skalieren.",
        health_score=health,
        health_label=health_label,
        insights=insights,
        top_action="Umsatztreiber der letzten 7 Tage sichern und Conversion-Hebel mit hohem Volumen priorisieren.",
        risk_level=risk_level,
        source="fallback",
        processing_ms=processing_ms,
        dashboard_items=_build_dashboard_items(insights, source_data),
        patterns=[PatternItem(**item) for item in source_data.get("patterns", []) if item.get("id")],
        deviations=[DeviationItem(**item) for item in source_data.get("deviations", []) if item.get("id")],
        opportunities=opportunities,
        top_opportunity=opportunities[0] if opportunities else None,
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
            "owner_role": "CEO",
            "kpi_link": "KPI-Bezug: Umsatz, Wochenvergleich und Umsatz-Momentum.",
            "priority_reason": "Hohe Prioritaet, weil die Massnahme direkt auf Umsatz und Budgeteffizienz einzahlt.",
            "strategic_context": "Sichert kurzfristig Ertrag und schafft die Basis fuer gezieltere Wachstumsinvestitionen.",
            "risk_level": "medium",
            "revenue_impact": 88,
            "growth_impact": 72,
            "risk_impact": 55,
            "team_impact": 46,
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
            "owner_role": "COO",
            "kpi_link": "KPI-Bezug: Conversion Rate und Umsatz pro Visit.",
            "priority_reason": "Mittlere Prioritaet, weil der Hebel gross ist, aber Produkt- und Umsetzungszeit benoetigt.",
            "strategic_context": "Ein struktureller Hebel, der denselben Traffic profitabler macht und Skalierung erleichtert.",
            "risk_level": "medium",
            "revenue_impact": 74,
            "growth_impact": 82,
            "risk_impact": 48,
            "team_impact": 42,
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
            "owner_role": "CFO",
            "kpi_link": "KPI-Bezug: Umsatz, Conversion und Wochentagsleistung.",
            "priority_reason": "Sofort relevant, weil KPI-Brueche frueher erkannt und schneller gegengesteuert werden koennen.",
            "strategic_context": "Staerkt das Management-System und reduziert operative Blindspots bei weiterem Wachstum.",
            "risk_level": "low",
            "revenue_impact": 42,
            "growth_impact": 34,
            "risk_impact": 78,
            "team_impact": 58,
        },
    ]
    recs = [RecommendationItem(**score_recommendation_quality(item, source_data)) for item in fallback_recommendations]
    recs = _validated_recommendations(recs, source_data)
    primary = recs[0] if recs else None
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
        opportunities=[
            "Wachstumschance: Gewinnerkanaele mit positivem 7-Tage-Momentum fokussieren und Budget umschichten.",
            "Effizienzchance: Conversion-Verbesserung im Kernfunnel hebt Umsatz pro Visit ohne Zusatztraffic.",
            "Steuerungschance: KPI-Guardrails reduzieren Reaktionszeit bei negativen Abweichungen deutlich.",
        ],
        risks=[
            "Umsatzrisiko: Schwankender Wochenvergleich kann bei breiter Budgetverteilung Momentum kosten.",
            "Umsetzungsrisiko: Funnel-Probleme bleiben teuer, wenn hohes Traffic-Volumen auf schwache Schritte trifft.",
            "Steuerungsrisiko: Ohne feste Grenzwerte werden KPI-Brueche zu spaet eskaliert.",
        ],
        scenarios=[
            StrategicScenario(
                name="Basis",
                strategy="Top-Umsatzquellen stabilisieren und bestehende Nachfrage effizienter nutzen.",
                kpi_effect="Moderates Plus bei Umsatz und Umsatz pro Visit bei begrenztem Ressourceneinsatz.",
                main_risk="Verbesserungen bleiben inkrementell, wenn strukturelle Funnel-Huerden nicht geloest werden.",
                recommendation="Als Standardpfad sofort starten, wenn das Ziel stabile kurzfristige Performance ist.",
            ),
            StrategicScenario(
                name="Offensiv",
                strategy="Budget auf Gewinnerkanaele erhoehen und parallel den Kernfunnel aktiv optimieren.",
                kpi_effect="Hoeheres Umsatz- und Conversion-Potenzial, aber mehr operative Last und hoeherer Fehlerrisiko.",
                main_risk="Mehr Spend ohne schnelle Funnel-Anpassung kann Effizienz verwässern.",
                recommendation="Waehlen, wenn Teamkapazitaet fuer Tests, Umsetzung und taegliches Controlling vorhanden ist.",
            ),
            StrategicScenario(
                name="Defensiv",
                strategy="Guardrails, Monitoring und Kostenkontrolle vor aggressivem Wachstum priorisieren.",
                kpi_effect="Stabilere Marge und fruehere Risikoerkennung, aber geringeres kurzfristiges Umsatzwachstum.",
                main_risk="Marktchancen werden langsamer genutzt als bei offensiverer Strategie.",
                recommendation="Sinnvoll, wenn Cash-Schutz und Risikoreduktion aktuell wichtiger als Tempo sind.",
            ),
        ],
        role_priorities=[
            RolePriority(
                role="CEO",
                immediate=["Budget auf die profitabelsten Umsatzquellen konzentrieren."],
                mid_term=["Entscheiden, ob Basis- oder Offensiv-Szenario verfolgt wird."],
                long_term=["Wachstumshebel nach Beitrag zu Umsatz und Profitabilitaet neu priorisieren."],
            ),
            RolePriority(
                role="COO",
                immediate=["Top-2 Funnel-Reibungspunkte mit hoechstem Volumen identifizieren."],
                mid_term=["Umsetzungsplan fuer Conversion-Verbesserungen und Verantwortlichkeiten festziehen."],
                long_term=["Operative Standards fuer schnellere Funnel-Iteration etablieren."],
            ),
            RolePriority(
                role="CMO",
                immediate=["Traffic-Quellen nach Conversion und Umsatzbeitrag neu ranken."],
                mid_term=["Kampagnenbudget auf Kanaele mit starkem Momentum verlagern."],
                long_term=["Systematischen Testplan fuer Nachfrage- und Kanalqualitaet aufbauen."],
            ),
            RolePriority(
                role="CFO",
                immediate=["Grenzwerte fuer Umsatz-, Conversion- und Effizienzabweichungen definieren."],
                mid_term=["Woechentliche Guardrail-Reviews mit Management etablieren."],
                long_term=["Fruehwarnsystem fuer Rendite- und Margenrisiken institutionalisieren."],
            ),
        ],
        primary_recommendation=primary.title if primary else None,
        primary_recommendation_reason=primary.priority_reason if primary else None,
        primary_recommendation_effect=primary.expected_result if primary else None,
        next_step=primary.action_label if primary else None,
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


def _with_persisted_forecast_context(
    *,
    db: Session,
    metric: str,
    response: ForecastResponse,
) -> ForecastResponse:
    try:
        workspace_id = get_current_workspace_id() or 1
        diagnosis = persist_forecast_diagnosis(
            db=db,
            workspace_id=workspace_id,
            kpi_name=metric,
            forecast_result={
                "historical": [point.model_dump() for point in response.historical],
                "forecast": [point.model_dump() for point in response.forecast],
                "trend": response.trend,
                "growth_pct": response.growth_pct,
                "confidence": response.confidence,
            },
            historical_points=[point.model_dump() for point in response.historical],
        )
        response.persisted_forecast_id = int(diagnosis["forecast_record"].id)
        response.linked_insight_id = diagnosis["linked_insight_id"]
        response.root_cause_insight_id = diagnosis["root_cause_insight_id"]
        response.decision_problem_id = diagnosis["decision_problem_id"]
        response.hidden_problems = diagnosis["hidden_problems"]
        response.opportunities = diagnosis.get("opportunities", [])
        response.top_opportunity = diagnosis.get("top_opportunity")
        response.recommended_actions = diagnosis["actions"]
    except Exception:
        pass
    return response


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
    workspace_id = get_current_workspace_id()

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
            dashboard_items=[],
            patterns=[],
            deviations=[],
        )

    cache_key = _workspace_cache_key(
        workspace_id,
        f"analysis:{days}:{_payload_fingerprint(source_data)}",
    )
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
    system = f"""Du bist ein McKinsey Senior Partner mit 20 Jahren Erfahrung in datengetriebener Unternehmensanalyse.
{DECISION_OPERATING_SYSTEM_PROMPT}
Deine Methodik: MECE-Strukturierung + Chain-of-Thought Reasoning (Signal → Ursache → Implikation → Massnahme).
Du identifizierst nicht nur was passiert, sondern WARUM — und welche EINE Massnahme den groessten Unterschied macht.
Du kalibrierst Konfidenz strikt: confidence >75 nur fuer Signale mit mindestens 2 konsistenten Datenpunkten.
Du benennst explizit was die Zahlen NICHT erklaeren (Negative Space) — das ist genauso wertvoll.
Du formulierst CEO-tauglich: praxisnah, klar priorisiert, ohne Floskeln und immer mit direktem KPI- und Zielbezug.
Gib ausschliesslich valides JSON ohne Zusatztext aus."""

    prompt = f"""Analysiere die folgenden Geschaeftsdaten mit McKinsey-Methodik:

{context}

Antworte AUSSCHLIESSLICH als JSON in diesem Schema:
{{
  "summary": "3-4 Saetze: Kernsituation + Kausalkette + Prioritaet — mit konkreten Zahlen",
  "ceo_summary": "1-2 Saetze fuer die Geschaeftsfuehrung: was passiert, warum es zaehlt und was jetzt zu tun ist",
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
      "priority": "critical|high|medium|low",
      "problem": "Was laeuft falsch? klar messbar",
      "cause_primary": "Wahrscheinlichste Hauptursache",
      "cause_primary_score": 0,
      "cause_secondary": ["moegliche Nebenursachen"],
      "cause_secondary_scores": [0],
      "cause_amplifiers": ["Verstaerker, die das Problem groesser machen"],
      "cause_amplifier_scores": [0],
      "action": "Sofortmassnahme mit messbarem Ziel",
      "expected_result": "Messbarer Effekt nach Umsetzung",
      "impact": "high|medium|low",
      "impact_level": "high|medium|low",
      "impact_pct": 0,
      "confidence_level": "high|medium|low",
      "time_factor": "immediate|this_week|this_month",
      "kpi_link": "Welcher KPI oder welches Unternehmensziel betroffen ist",
      "strategic_context": "Einordnung fuer Wachstum, Profitabilitaet oder Marktrisiko",
      "owner_role": "CEO|COO|CMO|CFO|Strategist",
      "dashboard_summary": "Kurzfassung fuer Dashboard: KPI + Bedeutung in 1 Satz",
      "primary_metric": "Welche KPI im Dashboard betroffen ist",
      "benchmark_note": "Vergleich gegen Vergangenheit, Ziel oder Benchmark in 1 Satz",
      "forecast_note": "Was passiert, wenn der Trend 30 Tage anhaelt",
      "immediate_action": "Konkrete Sofortmassnahme",
      "mid_term_action": "Konkrete Massnahme fuer 2-6 Wochen",
      "long_term_action": "Strategische Massnahme fuer die naechsten Monate",
      "what_happened": "Einfache Antwort: Was passiert gerade?",
      "why_it_happened": "Einfache Antwort: Warum passiert das wahrscheinlich?",
      "what_it_means": "Einfache Antwort: Was bedeutet das fuer das Business?",
      "what_to_do": "Einfache Antwort: Was solltest du jetzt tun?",
      "pattern_link": "Ist das einmalig oder wiederkehrend? Was hat frueher geholfen?",
      "pattern_score": 0,
      "priority_reason": "Warum dieses Thema jetzt wichtig ist",
      "period_7d": "Einordnung fuer 7 Tage",
      "period_30d": "Einordnung fuer 30 Tage",
      "period_12m": "Einordnung fuer 12 Monate",
      "segment": null,
      "confidence": 0
    }}
  ]
}}

Regeln:
- Verwende sehr einfache Sprache. Kein Fachjargon.
- Jedes Insight muss die vier Pflichtfragen direkt beantworten: Was passiert? Warum passiert das? Was bedeutet das? Was tun wir jetzt?
- Verbinde jede Abweichung mit Mustern: einmalig oder wiederkehrend, gab es das schon, was hat damals funktioniert?
- Chain-of-Thought pflicht: jedes Insight erklaert Signal → Ursache → Implikation → Massnahme.
- Nutze nur gegebene Daten, keine freien Annahmen.
- Erzeuge 4-6 Insights: mindestens 1x strength, 1x weakness, 1x opportunity.
- Suche aktiv nach versteckten Chancen: ueberdurchschnittliches Wachstum, bessere Effizienz, wiederkehrende positive Muster, ueberproportionale Wirkung bei geringem Einsatz.
- Jede Analyse muss 7 Tage, 30 Tage und den langfristigen Verlauf einordnen. Kein Einzelwert ohne Trendvergleich.
- Vergleiche immer: aktuell vs Vergangenheit, kurzfristig vs langfristig, Erwartung vs Realitaet und wo moeglich starker Bereich vs schwacher Bereich.
- Uebersetze Trends in Entscheidungen: Was ist die groesste Chance aktuell, warum genau diese, was soll als Naechstes passieren?
- Einen "contrarian" Insight hinzufuegen: Was widerspricht den ersten Erwartungen oder laeuft gegen den Haupttrend?
- Bevorzuge abgeleitete Kennzahlen: Umsatz/Visit, AOV, Neukunden/Conversion, 7-Tage-Momentum, Wochentagsmuster.
- Jedes Insight: evidence mit Zahl, confidence 0-100, impact_pct > 0.
- Jedes Insight braucht KPI-Bezug und strategische Einordnung in klarem CEO-Deutsch.
- Jedes Insight muss klar Problem → Ursache → Massnahme abbilden und eine priorisierte Einstufung enthalten.
- Die Analyse darf niemals nur beschreiben, sondern muss immer in konkrete, priorisierte Massnahmen uebergehen.
- Ursachen als Hauptursache, Nebenursachen, Verstaerker ausgeben.
- Jede Ursache mit Score 0-100 bewerten (Hoehe = staerkerer Einfluss).
- Opportunity-Insights muessen explizit beantworten: Was passiert? Warum ist das eine Chance? Welche Daten belegen das? Wie stark ist die Chance? Wie sicher ist die Einschaetzung? Was tun wir jetzt?
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
        opportunities = _build_opportunity_cards(insights)
        response = AnalysisResponse(
            generated_at=datetime.utcnow().isoformat(),
            data_period=source_data.get("period", ""),
            summary=str(parsed.get("summary", "")),
            ceo_summary=str(parsed.get("ceo_summary", "")),
            health_score=max(0, min(100, int(parsed.get("health_score", 50)))),
            health_label=str(parsed.get("health_label", "Neutral")),
            insights=insights,
            top_action=str(parsed.get("top_action", "")),
            risk_level=str(parsed.get("risk_level", "medium")),
            source="claude",
            processing_ms=ms,
            causal_chain=causal_chain,
            dashboard_items=_build_dashboard_items(insights, source_data),
            patterns=[PatternItem(**item) for item in source_data.get("patterns", []) if item.get("id")],
            deviations=[DeviationItem(**item) for item in source_data.get("deviations", []) if item.get("id")],
            opportunities=opportunities,
            top_opportunity=opportunities[0] if opportunities else None,
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
    workspace_id = get_current_workspace_id()

    if not source_data:
        ms = _record_metric("recommendations", started, "local", True)
        _record_ai_audit(db, current_user, "ai_recommendation_local_fallback", "No data available")
        return RecommendationsResponse(
            generated_at=datetime.utcnow().isoformat(),
            recommendations=[],
            quick_wins=["Zuerst Datenbasis aufbauen (mindestens 7 Tage)."],
            strategic=["Tracking fuer Umsatz, Traffic und Conversion vervollstaendigen."],
            opportunities=[],
            risks=[],
            scenarios=[],
            role_priorities=[],
            source="local",
            processing_ms=ms,
        )

    cache_key = _workspace_cache_key(
        workspace_id,
        f"recommendations:{days}:{_payload_fingerprint(source_data)}",
    )
    if not force_fallback:
        cached = _cache_get(cache_key)
        if cached:
            _record_metric("recommendations", started, cached.get("source", "claude"), True)
            return RecommendationsResponse(**cached)

    # Schichten 1–3: Angereicherter Kontext
    context = await build_enriched_context(db, source_data, days)
    system = f"""Du bist die AI-Strategist-Rolle innerhalb einer CEO- und Management-App.
{DECISION_OPERATING_SYSTEM_PROMPT}
{MARKETING_SALES_DECISION_APPENDIX}

ZUSATZREGELN:
- Priorisiere Massnahmen nach ICE-Framework: Impact × Confidence × Ease (je 1-10, Gesamtscore max 1000).
- Begruende jede Empfehlung quantitativ mit Zahlen aus den Daten.
- Verknuepfe jede Empfehlung mit KPIs, operativen Zielen und einer verantwortlichen Management-Rolle.
- Formuliere praezise, ohne Floskeln, in klarem CEO-Deutsch.
- Gib nur valides JSON ohne Zusatztext aus."""

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
      "priority": "critical|high|medium|low",
      "category": "marketing|product|sales|operations|finance",
      "timeframe": "immediate|this_week|this_month|this_quarter",
      "action_label": "max 4 Woerter",
      "owner_role": "CEO|COO|CMO|CFO|Strategist",
      "kpi_link": "Welcher KPI oder welches Ziel direkt beeinflusst wird",
      "priority_reason": "Warum jetzt und warum vor anderen Massnahmen",
      "strategic_context": "Kurzfristige und strategische Einordnung fuer das Unternehmen",
      "risk_level": "low|medium|high",
      "ice_impact": 0,
      "ice_confidence": 0,
      "ice_ease": 0,
      "ice_score": 0,
      "revenue_impact": 0,
      "growth_impact": 0,
      "risk_impact": 0,
      "team_impact": 0,
      "business_impact_score": 0,
      "impact_classification": "geschaeftskritisch|sehr wichtig|sinnvoll|optional"
    }}
  ],
  "quick_wins": ["..."],
  "strategic": ["..."],
  "opportunities": ["..."],
  "risks": ["..."],
  "scenarios": [
    {{
      "name": "Basis|Offensiv|Defensiv",
      "strategy": "Welche Strategie simuliert wird",
      "kpi_effect": "Erwartete KPI-Folge fuer Umsatz, Conversion, Effizienz oder Cash",
      "main_risk": "Hauptrisiko dieses Szenarios",
      "recommendation": "Klare Management-Empfehlung"
    }}
  ],
  "role_priorities": [
    {{
      "role": "CEO|COO|CMO|CFO",
      "immediate": ["1-2 konkrete Sofortmassnahmen"],
      "mid_term": ["1-2 mittelfristige Hebel"],
      "long_term": ["1-2 langfristige strategische Schritte"]
    }}
  ],
  "primary_recommendation": "Die eine wichtigste Massnahme",
  "primary_recommendation_reason": "Warum genau diese Massnahme die Nummer 1 ist",
  "primary_recommendation_effect": "Welcher KPI- und Business-Effekt erwartet wird",
  "next_step": "Was als Naechstes operativ passiert"
}}

Regeln:
- 3-5 recommendations, sortiert nach ice_score absteigend.
- ice_score = ice_impact × ice_confidence × ice_ease (jedes 1-10).
- business_impact_score = (revenue_impact × 0.4) + (growth_impact × 0.3) + (risk_impact × 0.2) + (team_impact × 0.1).
- Jedes rationale: mindestens eine Zahl (EUR, %, Trend).
- Jede Empfehlung braucht KPI-Bezug, Priorisierungsgrund und strategischen Kontext.
- Jede Empfehlung braucht eine klare owner_role fuer das Management.
- Jede Empfehlung muss konkret beantworten: Was wird gemacht? Warum genau diese Massnahme? Welche KPI wird beeinflusst? Welche Wirkung wird erwartet? Wie schnell tritt die Wirkung ein?
- Nur direkt aus den Daten ableiten. Keine generischen Marketing- oder Sales-Tipps.
- priority = critical nur bei unmittelbarem Umsatz- oder Risikodruck.
- Timeframe-Pflicht: mind. 1x 'immediate', mind. 1x 'this_week'.
- Mindestens 1 Umsatzhebel, mindestens 1 Effizienz-/Funnel-Hebel.
- Bevorzuge: Umsatz/Visit, AOV, Zielabweichung, 7-Tage-Momentum, Wochentagsmuster.
- quick_wins: 2-3 Punkte, heute umsetzbar.
- strategic: 2-3 Punkte, mittel- bis langfristig.
- opportunities: 3 priorisierte Chancen nach Potenzial, Risiko und Ressourcenbedarf.
- risks: 3 priorisierte Risiken mit Management-Relevanz.
- scenarios: genau 3 Szenarien: Basis, Offensiv, Defensiv.
- role_priorities: genau 4 Eintraege fuer CEO, COO, CMO, CFO.
- primary_recommendation muss exakt die hoechstpriorisierte Empfehlung benennen und begruenden."""

    if force_fallback:
        ms = _record_metric("recommendations", started, "fallback", True)
        response = _local_recommendations_fallback(ms, source_data)
        _record_ai_audit(db, current_user, "ai_recommendation_fallback", "Forced local fallback")
        return response

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
            opportunities=[str(x) for x in parsed.get("opportunities", [])][:3],
            risks=[str(x) for x in parsed.get("risks", [])][:3],
            scenarios=_safe_scenarios([item for item in parsed.get("scenarios", [])[:3] if isinstance(item, dict)]),
            role_priorities=_safe_role_priorities([item for item in parsed.get("role_priorities", [])[:4] if isinstance(item, dict)]),
            primary_recommendation=str(parsed.get("primary_recommendation", recs[0].title if recs else "")) or None,
            primary_recommendation_reason=str(parsed.get("primary_recommendation_reason", recs[0].priority_reason if recs else "")) or None,
            primary_recommendation_effect=str(parsed.get("primary_recommendation_effect", recs[0].expected_result if recs else "")) or None,
            next_step=str(parsed.get("next_step", recs[0].action_label if recs else "")) or None,
            source="claude",
            processing_ms=ms,
        )
        _record_ai_audit(
            db,
            current_user,
            "ai_recommendation_generated",
            f"source=claude recommendations={len(recs)}",
        )
        _cache_set(cache_key, response)
        return response
    except Exception as exc:
        ms = _record_metric("recommendations", started, "fallback", False, str(exc))
        response = _local_recommendations_fallback(ms, source_data)
        _record_ai_audit(db, current_user, "ai_recommendation_error_fallback", str(exc))
        return response


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

    system = f"""{_chat_role_prompt(body.profile_id)}
- Schliesse jede Antwort mit einer kurzen Rueckfrage ab, die zur Vertiefung einlaedt.
- Antworte auf Deutsch, klar und direkt — ohne Floskeln.

GESCHAEFTSDATEN (7d / 30d / 90d):
{context}"""

    messages = []
    for h in (body.history or [])[-8:]:
        if h.role in ("user", "assistant") and h.content:
            messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": body.message})

    key, claude_model = get_claude_runtime_config()
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        ms = _record_metric("chat", started, "fallback", False, "ANTHROPIC_API_KEY fehlt")
        return _local_chat_fallback(body.message, source_data, ms)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                CLAUDE_API_URL,
                headers=build_claude_headers(key),
                json=build_claude_payload(
                    body.message,
                    model=claude_model,
                    max_tokens=700,
                    system_prompt=system,
                    messages=messages,
                ),
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
        return _with_persisted_forecast_context(db=db, metric=metric, response=ForecastResponse(
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
        ))

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
            return _with_persisted_forecast_context(db=db, metric=metric, response=ForecastResponse(
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
            ))

        ms = _record_metric("forecast", started, "claude", True)
        return _with_persisted_forecast_context(db=db, metric=metric, response=ForecastResponse(
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
        ))
    except Exception as exc:
        local_fc, trend, growth, conf, summary, drivers = _local_forecast(hist_values, horizon, future_dates)
        ms = _record_metric("forecast", started, "fallback", False, str(exc))
        return _with_persisted_forecast_context(db=db, metric=metric, response=ForecastResponse(
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
        ))


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

    _, claude_model = get_claude_runtime_config()
    return AIMetricsResponse(
        generated_at=datetime.utcnow().isoformat(),
        model=claude_model,
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
    cache_key = _workspace_cache_key(workspace_id, f"enterprise:{_payload_fingerprint(payload)}")
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
    key, claude_model = get_claude_runtime_config()
    configured = is_configured_secret(key, prefixes=("sk-ant-",), min_length=20)
    return {
        "configured": configured,
        "key_preview": f"{key[:12]}..." if len(key) > 12 else "nicht gesetzt",
        "model": claude_model,
        "status": "ready" if configured else "missing_key",
    }
