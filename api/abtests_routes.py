"""
A/B Test Tracking - Kampagnen vergleichen, Gewinner automatisch erkennen.
"""
from datetime import date, datetime, timedelta
import json
import math
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, Date, DateTime, Float, Integer, String
from sqlalchemy.orm import Session

from database import get_db
from models.base import Base
from api.auth_routes import User, get_current_user
from security_config import is_configured_secret

router = APIRouter(prefix="/api/abtests", tags=["abtests"])

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"

class ABTest(Base):
    __tablename__ = "ab_tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    hypothesis = Column(String, nullable=True)
    category = Column(String, nullable=False, default="marketing")
    status = Column(String, nullable=False, default="running")

    variant_a_name = Column(String, nullable=False, default="Kontrolle")
    variant_a_visitors = Column(Integer, default=0)
    variant_a_conversions = Column(Integer, default=0)
    variant_a_revenue = Column(Float, default=0.0)

    variant_b_name = Column(String, nullable=False, default="Variante B")
    variant_b_visitors = Column(Integer, default=0)
    variant_b_conversions = Column(Integer, default=0)
    variant_b_revenue = Column(Float, default=0.0)

    start_date = Column(Date, nullable=False, default=date.today)
    end_date = Column(Date, nullable=True)
    winner = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    archived = Column(Boolean, default=False, nullable=False)


class ABTestCreate(BaseModel):
    name: str
    description: Optional[str] = None
    hypothesis: Optional[str] = None
    category: str = "marketing"
    variant_a_name: str = "Kontrolle"
    variant_b_name: str = "Variante B"
    start_date: Optional[date] = None


class ABTestUpdate(BaseModel):
    variant_a_visitors: Optional[int] = None
    variant_a_conversions: Optional[int] = None
    variant_a_revenue: Optional[float] = None
    variant_b_visitors: Optional[int] = None
    variant_b_conversions: Optional[int] = None
    variant_b_revenue: Optional[float] = None
    status: Optional[str] = None


class VariantResult(BaseModel):
    name: str
    visitors: int
    conversions: int
    revenue: float
    conversion_rate: float
    avg_order_value: float
    revenue_per_visitor: float


class StatisticalSignificance(BaseModel):
    significant: bool
    confidence: float
    p_value: float
    min_sample_size: int
    current_sample: int
    verdict: str


class ABTestResult(BaseModel):
    id: int
    name: str
    description: Optional[str]
    hypothesis: Optional[str]
    category: str
    status: str
    start_date: str
    end_date: Optional[str]
    variant_a: VariantResult
    variant_b: VariantResult
    winner: Optional[str]
    winner_name: Optional[str]
    lift_pct: float
    significance: StatisticalSignificance
    ai_verdict: str
    ai_recommendation: str
    created_at: str


class SeedResult(BaseModel):
    created: int
    message: str


def calculate_significance(
    a_visitors: int,
    a_conversions: int,
    b_visitors: int,
    b_conversions: int,
) -> StatisticalSignificance:
    min_sample = 100

    if a_visitors == 0 or b_visitors == 0:
        return StatisticalSignificance(
            significant=False,
            confidence=0.0,
            p_value=1.0,
            min_sample_size=min_sample,
            current_sample=min(a_visitors, b_visitors),
            verdict="Zu wenig Daten fuer statistische Auswertung.",
        )

    p_a = a_conversions / a_visitors
    p_b = b_conversions / b_visitors
    p_pool = (a_conversions + b_conversions) / (a_visitors + b_visitors)

    if p_pool == 0 or p_pool == 1:
        return StatisticalSignificance(
            significant=False,
            confidence=0.0,
            p_value=1.0,
            min_sample_size=min_sample,
            current_sample=min(a_visitors, b_visitors),
            verdict="Keine Conversions in einer Variante - Test fortsetzen.",
        )

    se = math.sqrt(p_pool * (1 - p_pool) * (1 / a_visitors + 1 / b_visitors))
    if se == 0:
        return StatisticalSignificance(
            significant=False,
            confidence=0.0,
            p_value=1.0,
            min_sample_size=min_sample,
            current_sample=min(a_visitors, b_visitors),
            verdict="Standardfehler = 0 - mehr Daten sammeln.",
        )

    z_score = abs(p_b - p_a) / se

    def norm_cdf(value: float) -> float:
        t_val = 1 / (1 + 0.2316419 * value)
        poly = t_val * (
            0.319381530
            + t_val * (-0.356563782 + t_val * (1.781477937 + t_val * (-1.821255978 + t_val * 1.330274429)))
        )
        return 1 - (1 / math.sqrt(2 * math.pi)) * math.exp(-(value ** 2) / 2) * poly

    p_value = round(2 * (1 - norm_cdf(z_score)), 4)
    confidence = round((1 - p_value) * 100, 1)
    significant = confidence >= 95.0

    if significant:
        verdict = f"Statistisch signifikant bei {confidence}% Konfidenz - Gewinner kann bestimmt werden."
    elif confidence >= 80:
        verdict = f"Trend sichtbar ({confidence}% Konfidenz) - noch nicht signifikant, Test fortsetzen."
    elif min(a_visitors, b_visitors) < min_sample:
        verdict = f"Zu wenig Daten - mindestens {min_sample} Besucher pro Variante benoetigt."
    else:
        verdict = f"Kein signifikanter Unterschied ({confidence}% Konfidenz) - Varianten sind aehnlich."

    return StatisticalSignificance(
        significant=significant,
        confidence=confidence,
        p_value=p_value,
        min_sample_size=min_sample,
        current_sample=min(a_visitors, b_visitors),
        verdict=verdict,
    )


def determine_winner(
    variant_a: VariantResult,
    variant_b: VariantResult,
    significance: StatisticalSignificance,
) -> tuple[Optional[str], Optional[str]]:
    if not significance.significant:
        return None, None

    if variant_b.conversion_rate > variant_a.conversion_rate:
        return "b", variant_b.name
    if variant_a.conversion_rate > variant_b.conversion_rate:
        return "a", variant_a.name
    if variant_b.revenue_per_visitor > variant_a.revenue_per_visitor:
        return "b", variant_b.name
    return "a", variant_a.name


def calculate_lift(a_rate: float, b_rate: float) -> float:
    if a_rate == 0:
        return 0.0
    return round((b_rate - a_rate) / a_rate * 100, 2)


def build_variant(name: str, visitors: int, conversions: int, revenue: float) -> VariantResult:
    conversion_rate = round(conversions / visitors * 100, 2) if visitors > 0 else 0.0
    avg_order_value = round(revenue / conversions, 2) if conversions > 0 else 0.0
    revenue_per_visitor = round(revenue / visitors, 4) if visitors > 0 else 0.0
    return VariantResult(
        name=name,
        visitors=visitors,
        conversions=conversions,
        revenue=round(revenue, 2),
        conversion_rate=conversion_rate,
        avg_order_value=avg_order_value,
        revenue_per_visitor=revenue_per_visitor,
    )


async def get_ai_verdict(test: ABTest, result: dict) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return {
            "verdict": "KI-Analyse nicht verfuegbar - API Key setzen.",
            "recommendation": "Ergebnisse manuell interpretieren.",
        }

    prompt = f"""Analysiere diesen A/B-Test:

Test: {test.name}
Hypothese: {test.hypothesis or "Nicht angegeben"}
Kategorie: {test.category}

Variante A ({result['variant_a_name']}):
- Besucher: {result['a_visitors']}
- Conversions: {result['a_conversions']}
- Conv.-Rate: {result['a_conv_rate']}%
- Umsatz: EUR {result['a_revenue']}

Variante B ({result['variant_b_name']}):
- Besucher: {result['b_visitors']}
- Conversions: {result['b_conversions']}
- Conv.-Rate: {result['b_conv_rate']}%
- Umsatz: EUR {result['b_revenue']}

Statistik: {result['confidence']}% Konfidenz, {result['significant']}

Antworte NUR mit diesem JSON (kein Markdown):
{{
  "verdict": "2-3 Saetze: was zeigen die Daten, was ist der Grund fuer den Unterschied?",
  "recommendation": "1-2 Saetze: konkrete naechste Schritte basierend auf dem Ergebnis"
}}"""

    try:
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
            return {"verdict": "KI-Fehler.", "recommendation": "Manuell auswerten."}

        raw = response.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception:
        return {"verdict": "KI-Fehler.", "recommendation": "Manuell auswerten."}


def build_result(test: ABTest, ai_data: dict) -> ABTestResult:
    variant_a = build_variant(test.variant_a_name, test.variant_a_visitors, test.variant_a_conversions, test.variant_a_revenue)
    variant_b = build_variant(test.variant_b_name, test.variant_b_visitors, test.variant_b_conversions, test.variant_b_revenue)
    significance = calculate_significance(
        test.variant_a_visitors,
        test.variant_a_conversions,
        test.variant_b_visitors,
        test.variant_b_conversions,
    )
    winner_key, winner_name = determine_winner(variant_a, variant_b, significance)
    lift_pct = calculate_lift(variant_a.conversion_rate, variant_b.conversion_rate)

    return ABTestResult(
        id=test.id,
        name=test.name,
        description=test.description,
        hypothesis=test.hypothesis,
        category=test.category,
        status=test.status,
        start_date=str(test.start_date),
        end_date=str(test.end_date) if test.end_date else None,
        variant_a=variant_a,
        variant_b=variant_b,
        winner=winner_key,
        winner_name=winner_name,
        lift_pct=lift_pct,
        significance=significance,
        ai_verdict=ai_data.get("verdict", ""),
        ai_recommendation=ai_data.get("recommendation", ""),
        created_at=str(test.created_at),
    )


def _update_payload(model: ABTestUpdate) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


@router.post("/seed-demo", response_model=SeedResult)
def seed_demo(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(ABTest).count()
    if existing > 0:
        return SeedResult(created=0, message=f"Bereits {existing} Tests vorhanden.")

    today = date.today()
    demos = [
        ABTest(
            name="Neuer CTA Button - Farbe",
            description="Testet ob ein gruener Button mehr Conversions erzeugt als der blaue Standardbutton.",
            hypothesis="Ein gruener CTA-Button erzeugt 15% mehr Conversions als der blaue.",
            category="ux",
            status="completed",
            variant_a_name="Blau (Kontrolle)",
            variant_a_visitors=1240,
            variant_a_conversions=62,
            variant_a_revenue=4340.0,
            variant_b_name="Gruen (Variante)",
            variant_b_visitors=1198,
            variant_b_conversions=84,
            variant_b_revenue=5880.0,
            start_date=today - timedelta(days=21),
            end_date=today - timedelta(days=7),
        ),
        ABTest(
            name="Checkout - 1-Schritt vs. 3-Schritte",
            description="Vereinfachter 1-Schritt-Checkout vs. bestehender 3-Schritte-Prozess.",
            hypothesis="Weniger Schritte im Checkout reduzieren Abbrueche und erhoehen Conv.-Rate.",
            category="conversion",
            status="running",
            variant_a_name="3-Schritte (aktuell)",
            variant_a_visitors=890,
            variant_a_conversions=38,
            variant_a_revenue=2660.0,
            variant_b_name="1-Schritt (neu)",
            variant_b_visitors=872,
            variant_b_conversions=52,
            variant_b_revenue=3640.0,
            start_date=today - timedelta(days=10),
        ),
        ABTest(
            name="E-Mail Betreff - Personalisierung",
            description="Personalisierter Betreff (Name des Empfaengers) vs. generischer Betreff.",
            hypothesis="Personalisierter Betreff erhoeht die Oeffnungsrate um 20%.",
            category="marketing",
            status="running",
            variant_a_name="Generisch",
            variant_a_visitors=450,
            variant_a_conversions=31,
            variant_a_revenue=1550.0,
            variant_b_name="Personalisiert",
            variant_b_visitors=448,
            variant_b_conversions=38,
            variant_b_revenue=1900.0,
            start_date=today - timedelta(days=5),
        ),
        ABTest(
            name="Preis-Darstellung - Monatlich vs. Jaehrlich",
            description="Zeigt Preis monatlich oder aufgeteilt als Jahrespreis.",
            hypothesis="Jahrespreis-Darstellung erhoeht Upgrade-Rate auf hoehere Plaene.",
            category="pricing",
            status="paused",
            variant_a_name="Monatlich",
            variant_a_visitors=320,
            variant_a_conversions=18,
            variant_a_revenue=1440.0,
            variant_b_name="Jaehrlich",
            variant_b_visitors=318,
            variant_b_conversions=19,
            variant_b_revenue=1824.0,
            start_date=today - timedelta(days=15),
        ),
    ]

    for demo in demos:
        db.add(demo)
    db.commit()
    return SeedResult(created=len(demos), message=f"{len(demos)} Demo-Tests erstellt.")


@router.post("", response_model=dict)
def create_test(body: ABTestCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    valid_categories = {"marketing", "ux", "conversion", "pricing", "product"}
    if body.category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Kategorie muss eine von {valid_categories} sein.")

    test = ABTest(
        name=body.name,
        description=body.description,
        hypothesis=body.hypothesis,
        category=body.category,
        variant_a_name=body.variant_a_name,
        variant_b_name=body.variant_b_name,
        start_date=body.start_date or date.today(),
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    return {"id": test.id, "name": test.name, "status": test.status}


@router.get("", response_model=list[dict])
def get_tests(status: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(ABTest)
    if status:
        query = query.filter(ABTest.status == status)
    tests = query.order_by(ABTest.created_at.desc()).all()

    results = []
    for test in tests:
        variant_a = build_variant(test.variant_a_name, test.variant_a_visitors, test.variant_a_conversions, test.variant_a_revenue)
        variant_b = build_variant(test.variant_b_name, test.variant_b_visitors, test.variant_b_conversions, test.variant_b_revenue)
        significance = calculate_significance(
            test.variant_a_visitors,
            test.variant_a_conversions,
            test.variant_b_visitors,
            test.variant_b_conversions,
        )
        winner_key, winner_name = determine_winner(variant_a, variant_b, significance)
        lift_pct = calculate_lift(variant_a.conversion_rate, variant_b.conversion_rate)

        results.append(
            {
                "id": test.id,
                "name": test.name,
                "category": test.category,
                "status": test.status,
                "start_date": str(test.start_date),
                "variant_a": {
                    "name": variant_a.name,
                    "conversion_rate": variant_a.conversion_rate,
                    "visitors": variant_a.visitors,
                },
                "variant_b": {
                    "name": variant_b.name,
                    "conversion_rate": variant_b.conversion_rate,
                    "visitors": variant_b.visitors,
                },
                "winner": winner_key,
                "winner_name": winner_name,
                "lift_pct": lift_pct,
                "significant": significance.significant,
                "confidence": significance.confidence,
            }
        )

    return results


@router.get("/{test_id}", response_model=ABTestResult)
async def get_test(test_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test nicht gefunden.")

    significance = calculate_significance(
        test.variant_a_visitors,
        test.variant_a_conversions,
        test.variant_b_visitors,
        test.variant_b_conversions,
    )
    ai_data = await get_ai_verdict(
        test,
        {
            "variant_a_name": test.variant_a_name,
            "variant_b_name": test.variant_b_name,
            "a_visitors": test.variant_a_visitors,
            "a_conversions": test.variant_a_conversions,
            "a_conv_rate": round(test.variant_a_conversions / test.variant_a_visitors * 100, 2) if test.variant_a_visitors else 0,
            "a_revenue": test.variant_a_revenue,
            "b_visitors": test.variant_b_visitors,
            "b_conversions": test.variant_b_conversions,
            "b_conv_rate": round(test.variant_b_conversions / test.variant_b_visitors * 100, 2) if test.variant_b_visitors else 0,
            "b_revenue": test.variant_b_revenue,
            "confidence": significance.confidence,
            "significant": significance.significant,
        },
    )
    return build_result(test, ai_data)


@router.patch("/{test_id}")
def update_test(test_id: int, body: ABTestUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test nicht gefunden.")

    valid_statuses = {"running", "completed", "paused"}
    if body.status and body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status muss eine von {valid_statuses} sein.")

    for field, value in _update_payload(body).items():
        setattr(test, field, value)

    if body.status == "completed":
        test.end_date = date.today()

    db.commit()
    return {"id": test.id, "status": test.status}


@router.delete("/{test_id}")
def delete_test(test_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test nicht gefunden.")

    db.delete(test)
    db.commit()
    return {"message": "Test geloescht."}


# ── Event Recording ───────────────────────────────────────────────────────────

class RecordEvent(BaseModel):
    variant:  str           # "a" oder "b"
    event:    str           # "impression" | "conversion"
    revenue:  float = 0.0


@router.post("/{test_id}/record")
def record_event(
    test_id: int,
    body: RecordEvent,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Einzelnes Ereignis für eine Variante erfassen.
    impression  → visitors + 1
    conversion  → conversions + 1 (und revenue addieren)
    """
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test nicht gefunden.")

    if test.status != "running":
        raise HTTPException(status_code=400, detail="Nur laufende Tests akzeptieren Events.")

    v = body.variant.lower()
    if v not in ("a", "b"):
        raise HTTPException(status_code=400, detail="variant muss 'a' oder 'b' sein.")

    e = body.event.lower()
    if e not in ("impression", "conversion"):
        raise HTTPException(status_code=400, detail="event muss 'impression' oder 'conversion' sein.")

    if v == "a":
        if e == "impression":
            test.variant_a_visitors    = (test.variant_a_visitors    or 0) + 1
        else:
            test.variant_a_conversions = (test.variant_a_conversions or 0) + 1
            test.variant_a_revenue     = (test.variant_a_revenue     or 0.0) + body.revenue
    else:
        if e == "impression":
            test.variant_b_visitors    = (test.variant_b_visitors    or 0) + 1
        else:
            test.variant_b_conversions = (test.variant_b_conversions or 0) + 1
            test.variant_b_revenue     = (test.variant_b_revenue     or 0.0) + body.revenue

    db.commit()
    return {
        "test_id": test_id,
        "variant": v,
        "event":   e,
        "variant_a": {"visitors": test.variant_a_visitors, "conversions": test.variant_a_conversions},
        "variant_b": {"visitors": test.variant_b_visitors, "conversions": test.variant_b_conversions},
    }


# ── Quick Stats (ohne KI, sofort) ─────────────────────────────────────────────

@router.get("/{test_id}/stats")
def get_test_stats(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Schnelle statistische Auswertung ohne Claude-Aufruf.
    Liefert: Conversion-Rates, Lift, Konfidenz, Sample-Ratio-Mismatch-Check.
    """
    test = db.query(ABTest).filter(ABTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test nicht gefunden.")

    va = build_variant(test.variant_a_name, test.variant_a_visitors,
                       test.variant_a_conversions, test.variant_a_revenue)
    vb = build_variant(test.variant_b_name, test.variant_b_visitors,
                       test.variant_b_conversions, test.variant_b_revenue)
    sig = calculate_significance(
        test.variant_a_visitors, test.variant_a_conversions,
        test.variant_b_visitors, test.variant_b_conversions,
    )
    winner_key, winner_name = determine_winner(va, vb, sig)
    lift = calculate_lift(va.conversion_rate, vb.conversion_rate)

    # Sample Ratio Mismatch: erwarten 50/50 — χ²-Test (vereinfacht)
    total = (test.variant_a_visitors or 0) + (test.variant_b_visitors or 0)
    srm_warning = False
    if total >= 100:
        expected = total / 2
        chi2 = (
            ((test.variant_a_visitors - expected) ** 2 / expected) +
            ((test.variant_b_visitors - expected) ** 2 / expected)
        )
        srm_warning = chi2 > 3.841  # p < 0.05 mit 1 df

    # Konfidenz-Intervall für Conversion-Rate (Wilson-Score, 95 %)
    def _wilson_ci(conversions: int, visitors: int):
        if visitors == 0:
            return None, None
        import math
        z = 1.96
        p = conversions / visitors
        denom = 1 + z**2 / visitors
        center = (p + z**2 / (2 * visitors)) / denom
        spread = z * math.sqrt(p * (1 - p) / visitors + z**2 / (4 * visitors**2)) / denom
        return round((center - spread) * 100, 2), round((center + spread) * 100, 2)

    a_lo, a_hi = _wilson_ci(test.variant_a_conversions or 0, test.variant_a_visitors or 0)
    b_lo, b_hi = _wilson_ci(test.variant_b_conversions or 0, test.variant_b_visitors or 0)

    return {
        "id":     test_id,
        "name":   test.name,
        "status": test.status,
        "variant_a": {
            **va.model_dump(),
            "ci_low": a_lo, "ci_high": a_hi,
        },
        "variant_b": {
            **vb.model_dump(),
            "ci_low": b_lo, "ci_high": b_hi,
        },
        "lift_pct":       lift,
        "significant":    sig.significant,
        "confidence":     sig.confidence,
        "p_value":        sig.p_value,
        "winner":         winner_key,
        "winner_name":    winner_name,
        "srm_warning":    srm_warning,
        "srm_note":       "Sample Ratio Mismatch erkannt – prüfe Traffic-Aufteilung." if srm_warning else None,
        "min_sample_size": sig.min_sample_size,
        "current_sample":  sig.current_sample,
        "verdict":         sig.verdict,
    }
