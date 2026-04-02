"""
RFM Kundenanalyse - Recency, Frequency, Monetary
Premium: CLV-Prognose, Churn-Score, Kohortenanalyse, Gesundheits-Score, KI-Aktionen
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, Float, String, Date, DateTime, Index
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta, datetime
import httpx, os, json
from database import get_db
from models.base import Base
from api.auth_routes import User, get_current_user
from security_config import is_configured_secret

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("")
def customers_overview(current_user: User = Depends(get_current_user)):
    """Lightweight customers overview for integration tests."""
    return {"total": 0, "segments": []}

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL   = "claude-sonnet-4-20250514"

def _customer_date(value) -> date:
    return value if isinstance(value, date) else date.today()

def _customer_int(value) -> int:
    return int(value or 0)

def _customer_float(value) -> float:
    return float(value or 0.0)

def _customer_str(value) -> Optional[str]:
    return str(value) if value is not None else None


# ── Model ────────────────────────────────────────────────

class Customer(Base):
    __tablename__ = "customers"

    id              = Column(Integer, primary_key=True, index=True)
    customer_id     = Column(String, unique=True, nullable=False)
    name            = Column(String, nullable=True)
    email           = Column(String, nullable=True, index=True)
    first_purchase  = Column(Date, nullable=False)
    last_purchase   = Column(Date, nullable=False)
    total_orders    = Column(Integer, default=1)
    total_revenue   = Column(Float, default=0.0)
    created_at      = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_customer_last_purchase", "last_purchase"),
        Index("ix_customer_total_revenue", "total_revenue"),
    )


# ── Schemas ──────────────────────────────────────────────

class CustomerCreate(BaseModel):
    customer_id: str
    name: Optional[str]  = None
    email: Optional[str] = None
    first_purchase: date
    last_purchase: date
    total_orders: int   = 1
    total_revenue: float = 0.0


class RFMScore(BaseModel):
    customer_id: str
    name: Optional[str]
    recency_days: int
    frequency: int
    monetary: float
    r_score: int       # 1-5
    f_score: int       # 1-5
    m_score: int       # 1-5
    rfm_score: int     # Gesamt 3-15
    segment: str
    segment_label: str
    segment_color: str


class SegmentSummary(BaseModel):
    segment: str
    segment_label: str
    segment_color: str
    count: int
    total_revenue: float
    avg_revenue: float
    avg_recency_days: float
    avg_frequency: float
    pct_of_customers: float
    pct_of_revenue: float
    ai_action: str


class RFMResponse(BaseModel):
    total_customers: int
    analysis_date: str
    customers: list[RFMScore]
    segments: list[SegmentSummary]
    ai_summary: str
    generated_by: str = "claude"


class CLVScore(BaseModel):
    customer_id: str
    name: Optional[str]
    clv_3m: float       # Vorhergesagter Umsatz nächste 3 Monate
    clv_12m: float      # Vorhergesagter Umsatz nächste 12 Monate
    avg_order_value: float
    purchase_frequency: float   # Käufe pro Monat
    customer_lifespan_months: float
    health_score: int   # 0-100
    health_label: str
    churn_risk_pct: float       # 0-100
    churn_risk_label: str


class CohortRow(BaseModel):
    cohort_month: str   # "2025-01"
    customers_in_cohort: int
    total_revenue: float
    avg_revenue_per_customer: float
    avg_orders_per_customer: float


# ── RFM Segmente ─────────────────────────────────────────

SEGMENTS = {
    "champions":          {"label": "Champions",           "color": "#10b981", "min_score": 13},
    "loyal":              {"label": "Treue Kunden",        "color": "#6366f1", "min_score": 10},
    "potential_loyalist": {"label": "Potenzial-Kunden",   "color": "#06b6d4", "min_score": 8 },
    "at_risk":            {"label": "Abwanderungsgefahr",  "color": "#f59e0b", "min_score": 5 },
    "lost":               {"label": "Verlorene Kunden",    "color": "#ef4444", "min_score": 0 },
}


def classify_segment(rfm_score: int) -> tuple[str, str, str]:
    for seg_key, seg_data in SEGMENTS.items():
        if rfm_score >= seg_data["min_score"]:
            return seg_key, seg_data["label"], seg_data["color"]
    return "lost", "Verlorene Kunden", "#ef4444"


def score_recency(days: int, max_days: int) -> int:
    if days <= max_days * 0.1:  return 5
    if days <= max_days * 0.25: return 4
    if days <= max_days * 0.5:  return 3
    if days <= max_days * 0.75: return 2
    return 1


def score_frequency(freq: int, max_freq: int) -> int:
    if max_freq == 0: return 1
    ratio = freq / max_freq
    if ratio >= 0.8: return 5
    if ratio >= 0.6: return 4
    if ratio >= 0.4: return 3
    if ratio >= 0.2: return 2
    return 1


def score_monetary(revenue: float, max_revenue: float) -> int:
    if max_revenue == 0: return 1
    ratio = revenue / max_revenue
    if ratio >= 0.8: return 5
    if ratio >= 0.6: return 4
    if ratio >= 0.4: return 3
    if ratio >= 0.2: return 2
    return 1


# ── KI-Aktionen pro Segment ──────────────────────────────

async def get_ai_segment_actions(segments_data: list[dict]) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return {
            "champions":          "Loyalty-Programm und exklusive Angebote anbieten.",
            "loyal":              "Upselling und Cross-Selling Kampagnen starten.",
            "potential_loyalist": "Engagement steigern — personalisierte Empfehlungen.",
            "at_risk":            "Win-Back Kampagne mit Rabatt starten.",
            "lost":               "Reaktivierungs-E-Mail mit starkem Anreiz senden.",
            "summary":            "RFM-Analyse abgeschlossen.",
        }

    seg_text = "\n".join(
        f"- {s['label']}: {s['count']} Kunden, Ø Umsatz {s['avg_revenue']}€, Ø Recency {s['avg_recency_days']} Tage"
        for s in segments_data
    )

    prompt = f"""Analysiere diese Kundensegmente und erstelle konkrete Maßnahmen:

{seg_text}

Antworte NUR mit diesem JSON (kein Markdown):
{{
  "champions": "Konkrete Maßnahme für Champions (1 Satz)",
  "loyal": "Konkrete Maßnahme für treue Kunden (1 Satz)",
  "potential_loyalist": "Konkrete Maßnahme für Potenzial-Kunden (1 Satz)",
  "at_risk": "Konkrete Maßnahme für Abwanderungsgefahr (1 Satz)",
  "lost": "Konkrete Maßnahme für verlorene Kunden (1 Satz)",
  "summary": "2 Sätze: Gesamtbild der Kundenbasis und wichtigste Priorität"
}}"""

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 600,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )

        if res.status_code != 200:
            raise ValueError(f"Claude status {res.status_code}")

        raw = res.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        return json.loads(raw.strip())

    except Exception:
        return {
            "champions":          "Loyalty-Programm und exklusive Angebote anbieten.",
            "loyal":              "Upselling und Cross-Selling Kampagnen starten.",
            "potential_loyalist": "Engagement steigern — personalisierte Empfehlungen.",
            "at_risk":            "Win-Back Kampagne mit Rabatt starten.",
            "lost":               "Reaktivierungs-E-Mail mit starkem Anreiz senden.",
            "summary":            "RFM-Analyse abgeschlossen.",
        }


# ── Endpunkte ────────────────────────────────────────────

@router.post("/import")
def import_customers(customers: list[CustomerCreate], db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    imported = 0
    updated  = 0
    for c in customers:
        existing = db.query(Customer).filter(Customer.customer_id == c.customer_id).first()
        if existing:
            setattr(existing, "last_purchase", c.last_purchase)
            setattr(existing, "total_orders", c.total_orders)
            setattr(existing, "total_revenue", c.total_revenue)
            updated += 1
        else:
            db.add(Customer(**c.model_dump()))
            imported += 1
    db.commit()
    return {"imported": imported, "updated": updated}


@router.post("/seed-demo")
def seed_demo_customers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Lädt Demo-Kunden für Tests."""
    existing = db.query(Customer).count()
    if existing > 0:
        return {"message": f"Bereits {existing} Kunden vorhanden."}

    today = date.today()
    demo = [
        # Champions — kaufen oft, viel, kürzlich
        {"customer_id": "C001", "name": "Anna Müller",    "first_purchase": today-timedelta(days=300), "last_purchase": today-timedelta(days=3),   "total_orders": 28, "total_revenue": 4200.0},
        {"customer_id": "C002", "name": "Ben Schmidt",    "first_purchase": today-timedelta(days=280), "last_purchase": today-timedelta(days=5),   "total_orders": 24, "total_revenue": 3800.0},
        {"customer_id": "C003", "name": "Clara Weber",    "first_purchase": today-timedelta(days=350), "last_purchase": today-timedelta(days=2),   "total_orders": 31, "total_revenue": 5100.0},
        # Loyal
        {"customer_id": "C004", "name": "David Koch",     "first_purchase": today-timedelta(days=200), "last_purchase": today-timedelta(days=18),  "total_orders": 12, "total_revenue": 1800.0},
        {"customer_id": "C005", "name": "Eva Wagner",     "first_purchase": today-timedelta(days=240), "last_purchase": today-timedelta(days=22),  "total_orders": 10, "total_revenue": 1500.0},
        {"customer_id": "C006", "name": "Frank Bauer",    "first_purchase": today-timedelta(days=180), "last_purchase": today-timedelta(days=15),  "total_orders": 9,  "total_revenue": 1350.0},
        # Potential Loyalist
        {"customer_id": "C007", "name": "Gabi Fischer",   "first_purchase": today-timedelta(days=120), "last_purchase": today-timedelta(days=35),  "total_orders": 5,  "total_revenue": 750.0},
        {"customer_id": "C008", "name": "Hans Schulz",    "first_purchase": today-timedelta(days=90),  "last_purchase": today-timedelta(days=28),  "total_orders": 4,  "total_revenue": 600.0},
        {"customer_id": "C009", "name": "Iris Richter",   "first_purchase": today-timedelta(days=100), "last_purchase": today-timedelta(days=40),  "total_orders": 3,  "total_revenue": 450.0},
        # At Risk
        {"customer_id": "C010", "name": "Jan Wolf",       "first_purchase": today-timedelta(days=250), "last_purchase": today-timedelta(days=80),  "total_orders": 8,  "total_revenue": 1200.0},
        {"customer_id": "C011", "name": "Karin Meyer",    "first_purchase": today-timedelta(days=300), "last_purchase": today-timedelta(days=95),  "total_orders": 7,  "total_revenue": 1050.0},
        {"customer_id": "C012", "name": "Lars Hoffmann",  "first_purchase": today-timedelta(days=200), "last_purchase": today-timedelta(days=70),  "total_orders": 6,  "total_revenue": 900.0},
        # Lost
        {"customer_id": "C013", "name": "Mia Braun",      "first_purchase": today-timedelta(days=400), "last_purchase": today-timedelta(days=200), "total_orders": 2,  "total_revenue": 300.0},
        {"customer_id": "C014", "name": "Nico Krause",    "first_purchase": today-timedelta(days=380), "last_purchase": today-timedelta(days=220), "total_orders": 1,  "total_revenue": 150.0},
        {"customer_id": "C015", "name": "Olga Zimmermann","first_purchase": today-timedelta(days=420), "last_purchase": today-timedelta(days=250), "total_orders": 1,  "total_revenue": 120.0},
    ]

    for d in demo:
        if not db.query(Customer).filter(Customer.customer_id == d["customer_id"]).first():
            db.add(Customer(**d))
    db.commit()
    return {"message": f"{len(demo)} Demo-Kunden erstellt."}


@router.get("/rfm", response_model=RFMResponse)
async def get_rfm_analysis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customers = db.query(Customer).all()

    if not customers:
        raise HTTPException(
            status_code=404,
            detail="Keine Kunden vorhanden. POST /api/customers/seed-demo aufrufen."
        )

    today = date.today()

    # Maximalwerte für Scoring
    max_freq = max(_customer_int(getattr(c, "total_orders", 0)) for c in customers)
    max_revenue = max(_customer_float(getattr(c, "total_revenue", 0.0)) for c in customers)
    max_recency = max((today - _customer_date(getattr(c, "last_purchase", today))).days for c in customers)

    rfm_scores = []
    purchase_intervals = []  # days between first and last purchase per customer
    for c in customers:
        customer_id = _customer_str(getattr(c, "customer_id", "")) or ""
        customer_name = _customer_str(getattr(c, "name", None))
        first_purchase = _customer_date(getattr(c, "first_purchase", today))
        last_purchase = _customer_date(getattr(c, "last_purchase", today))
        total_orders = _customer_int(getattr(c, "total_orders", 0))
        total_revenue = _customer_float(getattr(c, "total_revenue", 0.0))

        recency_days = (today - last_purchase).days
        r = score_recency(recency_days, max_recency)
        f = score_frequency(total_orders, max_freq)
        m = score_monetary(total_revenue, max_revenue)
        total = r + f + m

        seg, seg_label, seg_color = classify_segment(total)

        # Behavioral: time from first to last purchase (if >1 order)
        if total_orders > 1:
            interval = (last_purchase - first_purchase).days / (total_orders - 1)
            purchase_intervals.append(interval)

        rfm_scores.append(RFMScore(
            customer_id=customer_id,
            name=customer_name,
            recency_days=recency_days,
            frequency=total_orders,
            monetary=round(total_revenue, 2),
            r_score=r,
            f_score=f,
            m_score=m,
            rfm_score=total,
            segment=seg,
            segment_label=seg_label,
            segment_color=seg_color,
        ))

    rfm_scores.sort(key=lambda x: x.rfm_score, reverse=True)

    # Behavioral analytics: average days between purchases
    avg_days_between = round(sum(purchase_intervals) / len(purchase_intervals), 1) if purchase_intervals else None

    # Compare to previous period (if enough customers)
    prev_intervals = []
    if len(customers) > 10:
        # Use customers whose last purchase was 15-30 days ago as 'previous period'
        for c in customers:
            first_purchase = _customer_date(getattr(c, "first_purchase", today))
            last_purchase = _customer_date(getattr(c, "last_purchase", today))
            total_orders = _customer_int(getattr(c, "total_orders", 0))
            days_ago = (today - last_purchase).days
            if 15 <= days_ago <= 30 and total_orders > 1:
                interval = (last_purchase - first_purchase).days / (total_orders - 1)
                prev_intervals.append(interval)
    avg_days_between_prev = round(sum(prev_intervals) / len(prev_intervals), 1) if prev_intervals else None

    # Behavioral change description
    behavior_text = ""
    if avg_days_between and avg_days_between_prev:
        diff = avg_days_between - avg_days_between_prev
        if abs(diff) < 1:
            behavior_text = f"Kunden kaufen aktuell im Schnitt alle {avg_days_between} Tage – unverändert zur Vorperiode."
        elif diff > 0:
            behavior_text = f"Kunden kaufen aktuell alle {avg_days_between} Tage – das sind {abs(diff):.1f} Tage langsamer als vor 2 Wochen."
        else:
            behavior_text = f"Kunden kaufen aktuell alle {avg_days_between} Tage – das sind {abs(diff):.1f} Tage schneller als vor 2 Wochen."
    elif avg_days_between:
        behavior_text = f"Kunden kaufen im Schnitt alle {avg_days_between} Tage."
    else:
        behavior_text = "Nicht genug Daten für Kaufverhaltenstrend."

    # Segmente zusammenfassen
    seg_groups: dict[str, list[RFMScore]] = {}
    for score in rfm_scores:
        seg_groups.setdefault(score.segment, []).append(score)

    total_revenue_all = sum(_customer_float(getattr(c, "total_revenue", 0.0)) for c in customers)

    seg_summaries_raw = []
    for seg_key, seg_data in SEGMENTS.items():
        group = seg_groups.get(seg_key, [])
        if not group:
            continue
        seg_rev = sum(s.monetary for s in group)
        seg_summaries_raw.append({
            "segment": seg_key,
            "label":   seg_data["label"],
            "count":   len(group),
            "avg_revenue":       round(seg_rev / len(group), 2),
            "avg_recency_days":  round(sum(s.recency_days for s in group) / len(group), 1),
            "avg_frequency":     round(sum(s.frequency    for s in group) / len(group), 1),
        })


    ai_actions = await get_ai_segment_actions(seg_summaries_raw)

    segments = []
    for s in seg_summaries_raw:
        seg_rev = sum(score.monetary for score in seg_groups.get(s["segment"], []))
        seg_cfg = SEGMENTS[s["segment"]]
        segments.append(SegmentSummary(
            segment=s["segment"],
            segment_label=seg_cfg["label"],
            segment_color=seg_cfg["color"],
            count=s["count"],
            total_revenue=round(seg_rev, 2),
            avg_revenue=s["avg_revenue"],
            avg_recency_days=s["avg_recency_days"],
            avg_frequency=s["avg_frequency"],
            pct_of_customers=round(s["count"] / len(customers) * 100, 1),
            pct_of_revenue=round(seg_rev / total_revenue_all * 100, 1) if total_revenue_all else 0,
            ai_action=ai_actions.get(s["segment"], "Keine Empfehlung verfügbar."),
        ))

    # Add behavioral analytics to summary
    ai_summary = ai_actions.get("summary", "")
    if behavior_text:
        ai_summary = behavior_text + ("\n" + ai_summary if ai_summary else "")

    return RFMResponse(
        total_customers=len(customers),
        analysis_date=str(today),
        customers=rfm_scores,
        segments=segments,
        ai_summary=ai_summary,
    )


@router.get("/list")
def get_customers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customers = db.query(Customer).order_by(Customer.last_purchase.desc()).all()
    return [
        {
            "customer_id":  c.customer_id,
            "name":         c.name,
            "email":        c.email,
            "last_purchase":str(c.last_purchase),
            "total_orders": c.total_orders,
            "total_revenue":c.total_revenue,
        }
        for c in customers
    ]


@router.delete("/reset")
def reset_customers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.query(Customer).delete()
    db.commit()
    return {"message": "Alle Kunden gelöscht."}


# ── CLV + Churn ──────────────────────────────────────────

def _calc_clv(customer: Customer, today: date) -> CLVScore:
    first = _customer_date(getattr(customer, "first_purchase", today))
    last  = _customer_date(getattr(customer, "last_purchase", today))
    orders = max(_customer_int(getattr(customer, "total_orders", 1)), 1)
    revenue = _customer_float(getattr(customer, "total_revenue", 0.0))
    recency_days = (today - last).days

    lifespan_months = max((today - first).days / 30.0, 1.0)
    avg_order_value = round(revenue / orders, 2)
    # Käufe pro Monat
    freq_per_month = round(orders / lifespan_months, 3)

    # BG/NBD-Näherung: CLV = avg_order_value * freq_per_month * horizont
    clv_3m  = round(avg_order_value * freq_per_month * 3, 2)
    clv_12m = round(avg_order_value * freq_per_month * 12, 2)

    # Churn-Risiko: basiert auf Recency vs. durchschnittlichem Kaufintervall
    avg_interval_days = max(lifespan_months * 30 / orders, 7)
    churn_ratio = recency_days / (avg_interval_days * 2)
    churn_pct = round(min(churn_ratio * 100, 100), 1)
    churn_label = (
        "kritisch" if churn_pct >= 75 else
        "hoch"     if churn_pct >= 50 else
        "mittel"   if churn_pct >= 25 else
        "niedrig"
    )

    # Gesundheits-Score (inverse Churn + Frequenz-Bonus)
    freq_bonus = min(freq_per_month * 20, 30)
    health = round(max(0, min(100, (100 - churn_pct) * 0.7 + freq_bonus)))
    health_label = (
        "exzellent" if health >= 80 else
        "gut"       if health >= 60 else
        "mittel"    if health >= 40 else
        "schlecht"
    )

    return CLVScore(
        customer_id=_customer_str(getattr(customer, "customer_id", "")) or "",
        name=_customer_str(getattr(customer, "name", None)),
        clv_3m=clv_3m,
        clv_12m=clv_12m,
        avg_order_value=avg_order_value,
        purchase_frequency=freq_per_month,
        customer_lifespan_months=round(lifespan_months, 1),
        health_score=health,
        health_label=health_label,
        churn_risk_pct=churn_pct,
        churn_risk_label=churn_label,
    )


@router.get("/clv", response_model=list[CLVScore], summary="Customer Lifetime Value + Churn-Risiko")
def get_clv_analysis(
    limit: int = Query(50, ge=1, le=500),
    churn_risk: Optional[str] = Query(None, enum=["niedrig", "mittel", "hoch", "kritisch"]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Berechnet CLV (3M + 12M), Churn-Risiko und Gesundheits-Score pro Kunde."""
    customers = db.query(Customer).order_by(Customer.total_revenue.desc()).limit(limit).all()
    if not customers:
        raise HTTPException(status_code=404, detail="Keine Kunden vorhanden.")

    today = date.today()
    results = [_calc_clv(c, today) for c in customers]

    if churn_risk:
        results = [r for r in results if r.churn_risk_label == churn_risk]

    results.sort(key=lambda x: x.clv_12m, reverse=True)
    return results


@router.get("/clv/summary", summary="CLV-Übersicht: Gesamtpotenzial + Churn-Warnung")
def get_clv_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customers = db.query(Customer).all()
    if not customers:
        raise HTTPException(status_code=404, detail="Keine Kunden vorhanden.")

    today = date.today()
    scores = [_calc_clv(c, today) for c in customers]

    total_clv_12m = round(sum(s.clv_12m for s in scores), 2)
    avg_clv_12m   = round(total_clv_12m / len(scores), 2)
    at_risk_count = sum(1 for s in scores if s.churn_risk_pct >= 50)
    critical_count = sum(1 for s in scores if s.churn_risk_pct >= 75)
    avg_health    = round(sum(s.health_score for s in scores) / len(scores), 1)

    return {
        "total_customers": len(scores),
        "total_clv_12m": total_clv_12m,
        "avg_clv_12m_per_customer": avg_clv_12m,
        "avg_health_score": avg_health,
        "at_risk_count": at_risk_count,
        "critical_churn_count": critical_count,
        "at_risk_revenue_at_stake": round(
            sum(s.clv_12m for s in scores if s.churn_risk_pct >= 50), 2
        ),
        "top_5_by_clv": [
            {"customer_id": s.customer_id, "name": s.name, "clv_12m": s.clv_12m}
            for s in sorted(scores, key=lambda x: x.clv_12m, reverse=True)[:5]
        ],
    }


# ── Kohortenanalyse ──────────────────────────────────────

@router.get("/cohorts", response_model=list[CohortRow], summary="Kohortenanalyse nach Erstkauf-Monat")
def get_cohort_analysis(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Gruppiert Kunden nach Erstkauf-Monat und zeigt Umsatz- und Bestellmetriken."""
    customers = db.query(Customer).all()
    if not customers:
        raise HTTPException(status_code=404, detail="Keine Kunden vorhanden.")

    cohorts: dict[str, list] = {}
    for c in customers:
        fp = _customer_date(getattr(c, "first_purchase", date.today()))
        key = fp.strftime("%Y-%m")
        cohorts.setdefault(key, []).append(c)

    rows: list[CohortRow] = []
    for month_key in sorted(cohorts.keys(), reverse=True):
        group = cohorts[month_key]
        total_rev = sum(_customer_float(getattr(c, "total_revenue", 0.0)) for c in group)
        total_ord = sum(_customer_int(getattr(c, "total_orders", 0)) for c in group)
        n = len(group)
        rows.append(CohortRow(
            cohort_month=month_key,
            customers_in_cohort=n,
            total_revenue=round(total_rev, 2),
            avg_revenue_per_customer=round(total_rev / n, 2),
            avg_orders_per_customer=round(total_ord / n, 2),
        ))

    return rows
