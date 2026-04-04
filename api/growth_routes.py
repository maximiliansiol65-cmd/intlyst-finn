"""
Intlyst Growth Engine — Wachstumsstrategien basierend auf Nutzerziel
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime, JSON
from pydantic import BaseModel
from typing import Any, Optional, cast
from datetime import datetime, date, timedelta
import httpx, os, json
from database import get_db
from models.base import Base
from api.auth_routes import User, get_current_user, get_current_workspace_id
from models.daily_metrics import DailyMetrics
from services.decision_prompting import (
    DECISION_OPERATING_SYSTEM_PROMPT,
    MARKETING_SALES_DECISION_APPENDIX,
)

router = APIRouter(prefix="/api/growth", tags=["growth"])


@router.get("")
def growth_overview(current_user: User = Depends(get_current_user)):
    """Lightweight overview endpoint for smoke/integration tests."""
    return {"goals_available": list(GROWTH_GOALS.keys())}

CLAUDE_URL   = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"


# ── Wachstumsziele ────────────────────────────────────────

GROWTH_GOALS = {
    "more_revenue": {
        "label":    "Mehr Umsatz",
        "focus":    "Umsatzsteigerung durch Preisoptimierung, Upselling und Conversion-Verbesserung",
        "kpis":     ["revenue", "conversion_rate", "avg_order_value"],
        "strategy": "revenue_growth",
        "icon":     "💰",
    },
    "more_customers": {
        "label":    "Mehr Kunden",
        "focus":    "Neukundengewinnung durch Lead-Strategien und Conversion-Optimierung",
        "kpis":     ["new_customers", "traffic", "conversion_rate"],
        "strategy": "customer_acquisition",
        "icon":     "👥",
    },
    "more_reach": {
        "label":    "Mehr Reichweite / Branding",
        "focus":    "Markenbekanntheit durch Social Media, Content und organisches Wachstum",
        "kpis":     ["traffic", "social_reach", "brand_mentions"],
        "strategy": "brand_awareness",
        "icon":     "📣",
    },
    "more_profit": {
        "label":    "Mehr Gewinn",
        "focus":    "Kostenreduktion, Prozessoptimierung und Margenverbesserung",
        "kpis":     ["revenue", "costs", "efficiency"],
        "strategy": "profit_optimization",
        "icon":     "📈",
    },
    "fast_growth": {
        "label":    "Schnell wachsen",
        "focus":    "Aggressives Wachstum durch skalierbare Akquisition und virale Strategien",
        "kpis":     ["revenue_growth", "customer_growth", "viral_coefficient"],
        "strategy": "aggressive_growth",
        "icon":     "🚀",
    },
    "stable_growth": {
        "label":    "Stabil wachsen",
        "focus":    "Nachhaltiges Wachstum durch Retention, Loyalty und langfristige Optimierung",
        "kpis":     ["retention_rate", "ltv", "churn_rate"],
        "strategy": "sustainable_growth",
        "icon":     "🌱",
    },
    "social_media": {
        "label":    "Social Media Wachstum",
        "focus":    "Instagram, TikTok, YouTube Shorts — Content der Kunden bringt",
        "kpis":     ["follower_growth", "engagement_rate", "social_conversions"],
        "strategy": "social_first",
        "icon":     "📱",
    },
    "automation": {
        "label":    "Automatisierung & Effizienz",
        "focus":    "Zeitaufwand reduzieren, Prozesse automatisieren, Skalierbarkeit erhöhen",
        "kpis":     ["time_saved", "automation_rate", "cost_per_task"],
        "strategy": "efficiency_first",
        "icon":     "⚙️",
    },
}


# ── Models ───────────────────────────────────────────────

class GrowthProfile(Base):
    __tablename__ = "growth_profiles"

    id             = Column(Integer, primary_key=True)
    user_id        = Column(Integer, nullable=False, default=1)
    workspace_id   = Column(Integer, nullable=False, default=1, index=True)
    growth_goal    = Column(String, nullable=False)
    company_name   = Column(String, nullable=True)
    industry       = Column(String, nullable=True)
    social_handles = Column(JSON, nullable=True)   # {instagram, tiktok, youtube}
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow)


# ── Schemas ──────────────────────────────────────────────

class GrowthGoalResponse(BaseModel):
    key:      str
    label:    str
    focus:    str
    icon:     str
    strategy: str


class SetGrowthGoalRequest(BaseModel):
    growth_goal:    str
    company_name:   Optional[str] = None
    industry:       Optional[str] = None
    social_handles: Optional[dict] = None


class GrowthProfileResponse(BaseModel):
    growth_goal:    str
    goal_label:     str
    goal_icon:      str
    focus:          str
    company_name:   Optional[str]
    industry:       Optional[str]
    social_handles: Optional[dict]


class GrowthAction(BaseModel):
    id:             str
    title:          str
    description:    str
    why_now:        str
    impact:         str
    impact_pct:     float
    effort:         str
    timeframe:      str
    category:       str
    specific_steps: list[str]
    ice_score:      Optional[int] = None   # I × C × E (max 1000)
    funnel_stage:   Optional[str] = None   # awareness|engagement|conversion|retention
    revenue_impact: Optional[int] = None
    growth_impact:  Optional[int] = None
    risk_impact:    Optional[int] = None
    team_impact:    Optional[int] = None
    business_impact_score: Optional[float] = None
    impact_classification: Optional[str] = None


class SocialStrategy(BaseModel):
    platform:       str
    content_type:   str
    frequency:      str
    hook_formula:   str
    example_idea:   str
    expected_reach: str
    converts_to:    str


class GrowthStrategyResponse(BaseModel):
    growth_goal:       str
    goal_label:        str
    executive_summary: str
    growth_score:      int
    growth_velocity:   str
    biggest_lever:     str
    actions:           list[GrowthAction]
    social_strategies: list[SocialStrategy]
    quick_wins:        list[str]
    warnings:          list[str]
    next_30_days:      list[str]
    primary_recommendation: Optional[str] = None
    primary_recommendation_reason: Optional[str] = None
    primary_recommendation_effect: Optional[str] = None
    next_step: Optional[str] = None
    generated_at:      str


class ContentIdea(BaseModel):
    platform:  str
    format:    str
    hook:      str
    content:   str
    cta:       str
    best_time: str
    goal:      str


# ── Daten laden ───────────────────────────────────────────

def _period_stats(rows: list) -> dict:
    """Aggregiert Kennzahlen fuer eine beliebige Zeilen-Liste."""
    if not rows:
        return {}
    revenues   = [float(getattr(r, "revenue", 0) or 0) for r in rows]
    traffics   = [float(getattr(r, "traffic", 0) or 0) for r in rows]
    new_custs  = [float(getattr(r, "new_customers", 0) or 0) for r in rows]
    conv_rates = [float(getattr(r, "conversion_rate", 0) or 0) for r in rows]
    conversions = [float(getattr(r, "conversions", 0) or 0) for r in rows]
    n = len(rows)
    half = n // 2

    def _trend(vals: list[float]) -> float:
        if not vals[:half]:
            return 0.0
        old_avg = sum(vals[:half]) / len(vals[:half])
        new_avg = sum(vals[half:]) / len(vals[half:]) if vals[half:] else old_avg
        return round((new_avg - old_avg) / old_avg * 100, 1) if old_avg else 0.0

    aovs = [revenues[i] / conversions[i] if conversions[i] else 0.0 for i in range(n)]
    avg_aov = round(sum(aovs) / sum(1 for a in aovs if a > 0), 2) if any(aovs) else 0.0
    avg_rev = sum(revenues) / n if n else 0.0

    return {
        "period_days":           n,
        "total_revenue":         round(sum(revenues), 2),
        "avg_revenue_day":       round(avg_rev, 2),
        "revenue_trend":         _trend(revenues),
        "total_traffic":         int(sum(traffics)),
        "avg_traffic_day":       round(sum(traffics) / n, 1),
        "traffic_trend":         _trend(traffics),
        "total_new_customers":   int(sum(new_custs)),
        "avg_new_customers_day": round(sum(new_custs) / n, 2),
        "avg_conversion_rate":   round(sum(conv_rates) / n * 100, 2),
        "avg_aov":               avg_aov,
        "best_revenue_day":      round(max(revenues), 2),
        "worst_revenue_day":     round(min(revenues), 2),
        "revenue_volatility":    round((max(revenues) - min(revenues)) / avg_rev * 100 if avg_rev else 0, 1),
    }


def load_business_data(db: Session, workspace_id: int) -> dict:
    since_90 = date.today() - timedelta(days=90)
    rows_all = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= since_90,
        )
        .order_by(DailyMetrics.date)
        .all()
    )

    if not rows_all:
        return {"available": False}

    today    = date.today()
    rows_30  = [r for r in rows_all if (today - r.date).days <= 30]
    rows_7   = [r for r in rows_all if (today - r.date).days <= 7]
    rows_7_prev = [r for r in rows_all if 7 < (today - r.date).days <= 14]

    stats_7  = _period_stats(rows_7)
    stats_30 = _period_stats(rows_30)
    stats_90 = _period_stats(rows_all)

    # 7-Tage-Momentum: aktuelle vs. vorige Woche
    curr_7_rev = sum(float(getattr(r, "revenue", 0) or 0) for r in rows_7)
    prev_7_rev = sum(float(getattr(r, "revenue", 0) or 0) for r in rows_7_prev)
    revenue_momentum = round((curr_7_rev - prev_7_rev) / prev_7_rev * 100, 1) if prev_7_rev else 0.0

    # Wochentag-Muster (30 Tage)
    wd_buckets: dict[int, list[float]] = {i: [] for i in range(7)}
    for r in rows_30:
        wd_buckets[r.date.weekday()].append(float(getattr(r, "revenue", 0) or 0))
    wd_avgs = {d: sum(v) / len(v) for d, v in wd_buckets.items() if v}
    best_wd = max(wd_avgs.items(), key=lambda item: item[1])[0] if wd_avgs else -1
    worst_wd = min(wd_avgs.items(), key=lambda item: item[1])[0] if wd_avgs else -1
    wd_names = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

    # Wachstumsphase anhand monatlichem Umsatz
    monthly_rev = stats_30.get("total_revenue", 0)
    if monthly_rev < 5_000:
        growth_phase, phase_label = "early", "Early Stage"
    elif monthly_rev < 50_000:
        growth_phase, phase_label = "growth", "Growth Stage"
    else:
        growth_phase, phase_label = "scale", "Scale Stage"

    return {
        "available":        True,
        "7d":               stats_7,
        "30d":              stats_30,
        "90d":              stats_90,
        "revenue_momentum_7d": revenue_momentum,
        "weekday_pattern": {
            "best_day":  wd_names[best_wd]  if best_wd  >= 0 else "?",
            "worst_day": wd_names[worst_wd] if worst_wd >= 0 else "?",
            "best_avg":  round(wd_avgs.get(best_wd,  0), 2),
            "worst_avg": round(wd_avgs.get(worst_wd, 0), 2),
        },
        "growth_phase":  growth_phase,
        "phase_label":   phase_label,
    }


def build_growth_prompt(goal: str, data: dict, profile: GrowthProfile) -> str:
    goal_data   = GROWTH_GOALS.get(goal, GROWTH_GOALS["more_revenue"])
    industry    = profile.industry or "nicht angegeben"
    company     = profile.company_name or "Unternehmen"
    socials     = cast(dict, getattr(profile, "social_handles", None) or {})
    phase_label = data.get("phase_label", "") if data.get("available") else ""

    data_block = ""
    if data.get("available"):
        d7  = data.get("7d", {})
        d30 = data.get("30d", {})
        d90 = data.get("90d", {})
        momentum = data.get("revenue_momentum_7d", 0)
        wp = data.get("weekday_pattern", {})

        data_block = f"""
WACHSTUMSPHASE: {phase_label}

LETZTE 7 TAGE:
- Umsatz: €{d7.get('total_revenue', 0):,.2f} (Trend: {d7.get('revenue_trend', 0):+.1f}%)
- Traffic: {d7.get('total_traffic', 0):,} Besucher
- Ø Conversion: {d7.get('avg_conversion_rate', 0):.2f}%
- Momentum vs. Vorwoche: {momentum:+.1f}%

LETZTE 30 TAGE:
- Gesamtumsatz: €{d30.get('total_revenue', 0):,.2f} | Ø/Tag: €{d30.get('avg_revenue_day', 0):,.2f}
- Umsatz-Trend: {d30.get('revenue_trend', 0):+.1f}% | Volatilitaet: {d30.get('revenue_volatility', 0):.1f}%
- Traffic: {d30.get('total_traffic', 0):,} | Trend: {d30.get('traffic_trend', 0):+.1f}%
- Neue Kunden: {d30.get('total_new_customers', 0)} | Ø Conversion: {d30.get('avg_conversion_rate', 0):.2f}%
- AOV: €{d30.get('avg_aov', 0):.2f}

LETZTE 90 TAGE:
- Gesamtumsatz: €{d90.get('total_revenue', 0):,.2f} | Trend: {d90.get('revenue_trend', 0):+.1f}%
- Neue Kunden: {d90.get('total_new_customers', 0)}

WOCHENMUSTER:
- Staerkster Tag: {wp.get('best_day', '?')} (Ø €{wp.get('best_avg', 0):.2f})
- Schwaechster Tag: {wp.get('worst_day', '?')} (Ø €{wp.get('worst_avg', 0):.2f})"""
    else:
        data_block = "\nGESCHÄFTSDATEN: Noch keine Daten — Empfehlungen basieren auf Branchenstandards."

    social_block = ""
    if socials:
        social_block = "\nSOCIAL MEDIA: " + ", ".join(f"{k}: @{v}" for k, v in socials.items() if v)

    return f"""Du bist Intlyst — ein hochentwickeltes KI-Wachstumssystem.
{DECISION_OPERATING_SYSTEM_PROMPT}
{MARKETING_SALES_DECISION_APPENDIX}

UNTERNEHMEN: {company}
BRANCHE: {industry}
WACHSTUMSZIEL: {goal_data['label']} — {goal_data['focus']}
{data_block}
{social_block}

Erstelle eine praezise, umsetzbare Wachstumsstrategie EXAKT ausgerichtet auf "{goal_data['label']}".
Beziehe Wachstumsphase und alle Zeitreihen-Signale explizit ein. Keine Floskeln — nur datenbasierte Erkenntnisse."""


# ── Claude aufrufen ───────────────────────────────────────

async def call_claude(system: str, user: str, max_tokens: int = 2500) -> str:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not key or not key.startswith("sk-ant-"):
        raise HTTPException(status_code=500, detail="API Key fehlt.")

    async with httpx.AsyncClient(timeout=45) as client:
        res = await client.post(
            CLAUDE_URL,
            headers={
                "x-api-key":         key,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            json={
                "model":      CLAUDE_MODEL,
                "max_tokens": max_tokens,
                "system":     system,
                "messages":   [{"role": "user", "content": user}],
            },
        )

    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Analyse-Fehler: {res.text[:200]}")

    return res.json()["content"][0]["text"]


def parse_json(raw: str) -> dict:
    text = raw.strip()
    if "```" in text:
        for part in text.split("```"):
            part = part.strip().lstrip("json").strip()
            try:
                return json.loads(part)
            except Exception:
                continue
    try:
        return json.loads(text)
    except Exception:
        s = text.find("{")
        e = text.rfind("}") + 1
        if s >= 0 and e > s:
            return json.loads(text[s:e])
        raise ValueError("Kein JSON")


# ── Endpunkte ────────────────────────────────────────────

@router.get("/goals", response_model=list[GrowthGoalResponse])
def get_growth_goals(current_user: User = Depends(get_current_user)):
    return [
        GrowthGoalResponse(key=k, label=v["label"], focus=v["focus"], icon=v["icon"], strategy=v["strategy"])
        for k, v in GROWTH_GOALS.items()
    ]


@router.post("/set-goal")
def set_growth_goal(body: SetGrowthGoalRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.growth_goal not in GROWTH_GOALS:
        raise HTTPException(status_code=400, detail=f"Ungültiges Ziel. Erlaubt: {list(GROWTH_GOALS.keys())}")

    workspace_id = current_user.active_workspace_id
    profile = (
        db.query(GrowthProfile)
        .filter(
            GrowthProfile.user_id == current_user.id,
            GrowthProfile.workspace_id == workspace_id,
        )
        .first()
    )
    if profile:
        profile_obj = cast(Any, profile)
        profile_obj.growth_goal = body.growth_goal
        profile_obj.company_name = body.company_name or profile_obj.company_name
        profile_obj.industry = body.industry or profile_obj.industry
        profile_obj.social_handles = body.social_handles or profile_obj.social_handles
        profile_obj.updated_at = datetime.utcnow()
    else:
        profile = GrowthProfile(
            user_id=current_user.id,
            workspace_id=workspace_id,
            growth_goal=body.growth_goal,
            company_name=body.company_name,
            industry=body.industry,
            social_handles=body.social_handles,
        )
        db.add(profile)
    db.commit()

    goal = GROWTH_GOALS[body.growth_goal]
    return {
        "message": f"Wachstumsziel gesetzt: {goal['label']}",
        "goal":    body.growth_goal,
        "focus":   goal["focus"],
        "icon":    goal["icon"],
    }


@router.get("/profile", response_model=GrowthProfileResponse)
def get_growth_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    profile = (
        db.query(GrowthProfile)
        .filter(
            GrowthProfile.user_id == current_user.id,
            GrowthProfile.workspace_id == workspace_id,
        )
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Kein Wachstumsziel gesetzt.")

    goal_key = str(getattr(profile, "growth_goal", "more_revenue"))
    goal = GROWTH_GOALS.get(goal_key, GROWTH_GOALS["more_revenue"])
    return GrowthProfileResponse(
        growth_goal=goal_key,
        goal_label=goal["label"],
        goal_icon=goal["icon"],
        focus=goal["focus"],
        company_name=getattr(profile, "company_name", None),
        industry=getattr(profile, "industry", None),
        social_handles=getattr(profile, "social_handles", None),
    )


@router.get("/strategy", response_model=GrowthStrategyResponse)
async def get_growth_strategy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    profile = (
        db.query(GrowthProfile)
        .filter(
            GrowthProfile.user_id == current_user.id,
            GrowthProfile.workspace_id == workspace_id,
        )
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Bitte zuerst Wachstumsziel setzen: POST /api/growth/set-goal")

    goal_key    = str(getattr(profile, "growth_goal", "more_revenue"))
    data        = load_business_data(db, workspace_id=workspace_id)
    phase_label = data.get("phase_label", "Growth Stage") if data.get("available") else "Growth Stage"
    context     = build_growth_prompt(goal_key, data, profile)
    goal        = GROWTH_GOALS.get(goal_key, GROWTH_GOALS["more_revenue"])

    system = f"""Du bist Intlyst — das KI-Wachstumssystem fuer {phase_label} Unternehmen.
{DECISION_OPERATING_SYSTEM_PROMPT}
{MARKETING_SALES_DECISION_APPENDIX}
Fokus: {goal['label']} — {goal['focus']}
Methodik: ICE-Scoring (Impact × Confidence × Ease), Chain-of-Thought Begruendungen, Funnel-Stage-Zuordnung.
Antworte ausschliesslich mit validem JSON. Keine Erklaerungen ausserhalb."""

    prompt = f"""{context}

Erstelle eine vollstaendige, phasengerechte Wachstumsstrategie.

Antworte NUR mit diesem JSON:
{{
  "executive_summary": "3-4 Saetze: Datenlage + Kausalkette + Kernhebel fuer {goal['label']} — mit konkreten Zahlen",
  "growth_score": 68,
  "growth_velocity": "slow|medium|fast|explosive",
  "biggest_lever": "Der eine quantifizierte Hebel mit groesstem Impact (1 Satz mit Zahl)",
  "actions": [
    {{
      "id": "action-slug",
      "title": "Konkrete Massnahme (max 6 Woerter)",
      "description": "Was genau zu tun ist — konkret und ausfuehrbar",
      "why_now": "Kausalkette aus den Daten: warum JETZT diese Massnahme (mit Zahl)",
      "impact": "high|medium|low",
      "impact_pct": 22.5,
      "effort": "low|medium|high",
      "timeframe": "immediate|this_week|this_month",
      "category": "marketing|product|sales|operations|content",
      "funnel_stage": "awareness|engagement|conversion|retention",
      "ice_score": 540,
      "revenue_impact": 0,
      "growth_impact": 0,
      "risk_impact": 0,
      "team_impact": 0,
      "business_impact_score": 0,
      "impact_classification": "geschaeftskritisch|sehr wichtig|sinnvoll|optional",
      "specific_steps": ["Schritt 1 konkret", "Schritt 2 konkret", "Schritt 3 konkret"]
    }}
  ],
  "social_strategies": [
    {{
      "platform": "Instagram",
      "content_type": "Reels",
      "frequency": "4x pro Woche",
      "hook_formula": "Konkrete Hook-Formel fuer diese Branche",
      "example_idea": "Konkretes Content-Thema mit Bezug zur Branche",
      "expected_reach": "500-2000 Views",
      "converts_to": "Funnel-Stage den dieser Content bedient (Awareness/Engagement/Conversion)"
    }}
  ],
  "quick_wins": [
    "Heute (sofort): Konkrete Massnahme",
    "Diese Woche: Konkrete Massnahme",
    "Diesen Monat: Konkrete Massnahme"
  ],
  "warnings": [
    "Warnung basierend auf konkreter Zahl aus den Daten",
    "Phasenspezifisches Risiko fuer {phase_label}"
  ],
  "next_30_days": [
    "Woche 1: ...",
    "Woche 2: ...",
    "Woche 3: ...",
    "Woche 4: ..."
  ],
  "primary_recommendation": "Die wichtigste Massnahme",
  "primary_recommendation_reason": "Warum genau diese Massnahme die Nummer 1 ist",
  "primary_recommendation_effect": "Welchen KPI-Effekt diese Massnahme erzeugen soll",
  "next_step": "Was als Naechstes operativ umgesetzt wird"
}}

Regeln:
- 4-5 actions, sortiert nach ice_score absteigend (ice_score = Impact × Confidence × Ease, je 1-10).
- business_impact_score = (revenue_impact × 0.4) + (growth_impact × 0.3) + (risk_impact × 0.2) + (team_impact × 0.1).
- funnel_stage fuer jede action setzen.
- why_now: MUSS auf konkrete Zahl aus den gegebenen Daten verweisen.
- Jede Action muss klar beantworten: Was wird gemacht? Warum jetzt? Welche KPI wird beeinflusst? Welche Wirkung wird erwartet? Wie schnell tritt Wirkung ein?
- Marketing- und Sales-Empfehlungen muessen direkt aus Funnel-, Demand-, Reichweiten- oder Effizienzsignalen entstehen.
- 3 social_strategies passend zu Branche und Ziel "{goal['label']}".
- Phasen-Anpassung "{phase_label}":
  Early Stage: Fokus auf ersten Kunden, manuelles Wachstum, Product-Market-Fit.
  Growth Stage: Kanaloptimierung, Skalierung, Systematisierung.
  Scale Stage: Effizienz, LTV-Maximierung, neue Marktsegmente.
- growth_score: 0-100 | growth_velocity: slow|medium|fast|explosive.
- primary_recommendation muss die hoechstpriorisierte Action benennen und begruenden."""

    raw         = await call_claude(system, prompt, max_tokens=2500)
    data_parsed = parse_json(raw)

    return GrowthStrategyResponse(
        growth_goal=goal_key,
        goal_label=goal["label"],
        executive_summary=data_parsed.get("executive_summary", ""),
        growth_score=int(data_parsed.get("growth_score", 50)),
        growth_velocity=data_parsed.get("growth_velocity", "medium"),
        biggest_lever=data_parsed.get("biggest_lever", ""),
        actions=[GrowthAction(**a) for a in data_parsed.get("actions", [])],
        social_strategies=[SocialStrategy(**s) for s in data_parsed.get("social_strategies", [])],
        quick_wins=data_parsed.get("quick_wins", []),
        warnings=data_parsed.get("warnings", []),
        next_30_days=data_parsed.get("next_30_days", []),
        primary_recommendation=data_parsed.get("primary_recommendation"),
        primary_recommendation_reason=data_parsed.get("primary_recommendation_reason"),
        primary_recommendation_effect=data_parsed.get("primary_recommendation_effect"),
        next_step=data_parsed.get("next_step"),
        generated_at=datetime.utcnow().isoformat(),
    )


@router.get("/content-ideas", response_model=list[ContentIdea])
async def get_content_ideas(
    count: int = 5,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    profile = (
        db.query(GrowthProfile)
        .filter(
            GrowthProfile.user_id == current_user.id,
            GrowthProfile.workspace_id == workspace_id,
        )
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Wachstumsziel nicht gesetzt.")

    goal_key = str(getattr(profile, "growth_goal", "more_reach"))
    goal     = GROWTH_GOALS.get(goal_key, GROWTH_GOALS["more_reach"])
    industry = str(getattr(profile, "industry", "E-Commerce") or "E-Commerce")
    socials  = cast(dict, getattr(profile, "social_handles", None) or {})

    system = "Du bist ein Social Media Stratege. Antworte nur mit validem JSON."

    prompt = f"""Erstelle {count} konkrete Content-Ideen für:
Branche: {industry}
Wachstumsziel: {goal['label']}
Social Media: {', '.join(socials.keys()) if socials else 'Instagram, TikTok, YouTube'}

Antworte NUR mit diesem JSON:
{{
  "ideas": [
    {{
      "platform": "TikTok",
      "format": "15s Video",
      "hook": "Die ersten 3 Sekunden — konkret",
      "content": "Was genau im Video passiert",
      "cta": "Was der Zuschauer tun soll",
      "best_time": "Dienstag 18-20 Uhr",
      "goal": "Neue Kunden | Follower | Traffic | Verkäufe"
    }}
  ]
}}

Wichtig: Ideen müssen konkret für die Branche sein, keine generischen Tipps."""

    raw  = await call_claude(system, prompt, max_tokens=1500)
    data = parse_json(raw)
    return [ContentIdea(**idea) for idea in data.get("ideas", [])]


@router.post("/analyze-social")
async def analyze_social_post(
    platform: str,
    post_description: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    profile = (
        db.query(GrowthProfile)
        .filter(
            GrowthProfile.user_id == current_user.id,
            GrowthProfile.workspace_id == workspace_id,
        )
        .first()
    )
    goal_key = str(getattr(profile, "growth_goal", "more_reach")) if profile else "more_reach"
    goal     = GROWTH_GOALS.get(goal_key)
    industry = str(getattr(profile, "industry", "E-Commerce")) if profile else "E-Commerce"

    system = "Du bist ein Social Media Analyst. Antworte nur mit validem JSON."

    prompt = f"""Analysiere diesen {platform} Post für ein {industry} Unternehmen:

Post-Beschreibung: {post_description}
Wachstumsziel: {goal['label'] if goal else 'Mehr Reichweite'}

Antworte NUR mit diesem JSON:
{{
  "score": 72,
  "verdict": "Gut aber optimierbar",
  "strengths": ["Was gut ist"],
  "weaknesses": ["Was fehlt"],
  "optimized_hook": "Verbesserter Hook",
  "optimized_cta": "Verbesserter CTA",
  "expected_performance": "Was erwartet werden kann",
  "similar_winning_formats": ["Format 1", "Format 2"]
}}"""

    raw = await call_claude(system, prompt, max_tokens=800)
    return parse_json(raw)
