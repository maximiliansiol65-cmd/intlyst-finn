from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from services.kpi_service import get_kpi_report, parse_csv_data, set_uploaded_data
from services.alert_service import generate_alerts
from api.ai_routes import call_claude, build_data_context
from services.seed_timeseries import seed_timeseries
from api.auth_routes import User, get_current_user
from security_config import is_production_environment

router = APIRouter(prefix="", tags=["kpis"])

# Maximale Upload-Dateigröße: 10 MB
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


# ─── helpers ────────────────────────────────────────────────────────────────

def to_float(val, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _avg(values: list) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


def _trend(values: list) -> float:
    if len(values) < 2:
        return 0.0
    mid = len(values) // 2
    first_half = values[:mid]
    second_half = values[mid:]
    avg_first = sum(first_half) / len(first_half)
    avg_second = sum(second_half) / len(second_half)
    if avg_first == 0:
        return 0.0
    return round((avg_second - avg_first) / avg_first * 100, 2)


# ─── KPI snapshot model ──────────────────────────────────────────────────────

class KpiSnapshot(BaseModel):
    period_start: str
    period_end: str
    avg_revenue: float
    avg_traffic: float
    avg_conversions: float
    avg_conversion_rate: float
    avg_new_customers: float
    revenue_trend_pct: float
    traffic_trend_pct: float
    conversion_rate_trend_pct: float
    total_revenue: float
    open_goals: int
    completed_goals: int
    summary_text: str


# ─── legacy KPI service bridge ───────────────────────────────────────────────

import asyncio
import json

async def _build_kpi_response():
    report = get_kpi_report()
    alerts = generate_alerts(report["growth"])
    # Kontext für Claude bauen
    context = build_data_context(report)
    system_prompt = (
        "Du bist ein KI-Analyst. Analysiere die folgenden KPI-Daten und generiere maximal 3 priorisierte, umsetzbare Empfehlungen als JSON-Liste. Jede Empfehlung soll ein Feld 'title', 'description', 'rationale', 'expected_result', 'impact_pct', 'priority', 'category' enthalten. Antworte nur mit JSON."
    )
    user_prompt = f"KPI-Daten:\n{context}"

    def _fallback_recommendations() -> list:
        growth = report.get("growth", {}) or {}
        kpis = report.get("kpis", {}) or {}

        revenue_growth = to_float(growth.get("revenue_growth", 0.0), 0.0)
        traffic_growth = to_float(growth.get("traffic_growth", 0.0), 0.0)
        conversion_rate = to_float(kpis.get("conversion_rate", 0.0), 0.0)

        recs = []
        if revenue_growth <= -0.05:
            recs.append({
                "title": "Umsatz stabilisieren: Top-Kanal fokussieren",
                "description": "Umsatz fällt deutlich. Fokussiere dich für 48h auf den Kanal mit der höchsten Conversion und stoppe schwache Kampagnen. Prüfe außerdem Pricing/Angebot und Landingpage-Friktion.",
                "rationale": "Schneller Hebel über Budget- und Fokus-Shift, bevor größere strukturelle Maßnahmen greifen.",
                "expected_effect": "Schnelle Stabilisierung des Umsatzes, weniger Budgetverschwendung.",
                "impact_pct": 8,
                "priority": "high",
                "category": "marketing",
                "timeframe": "immediate",
                "kpi_affected": ["revenue", "conversion_rate"],
                "auto_task_title": "Umsatz-Notfallplan: Kampagnen & Landingpage prüfen",
            })
        if traffic_growth <= -0.10:
            recs.append({
                "title": "Traffic-Recovery: Kanal-Mix und Content-Refresh",
                "description": "Traffic sinkt. Prüfe sofort die Top-Traffic-Quellen (SEO/Ads/Social) auf Ausfälle, Tracking-Änderungen und Budget-Shifts. Starte parallel 2-3 schnelle Content/Posting-Aktionen.",
                "rationale": "Traffic-Drops sind häufig kanal- oder trackingbedingt und lassen sich kurzfristig korrigieren.",
                "expected_effect": "Mehr Sessions und wieder stabile Top-of-Funnel-Zufuhr.",
                "impact_pct": 10,
                "priority": "high",
                "category": "traffic",
                "timeframe": "immediate",
                "kpi_affected": ["traffic"],
                "auto_task_title": "Traffic-Drop analysieren + Sofortmaßnahmen starten",
            })
        if conversion_rate <= 0.02 and to_float(kpis.get("traffic", 0.0), 0.0) > 50:
            recs.append({
                "title": "Conversion-Boost: 1 Landingpage A/B Test",
                "description": "Conversion Rate ist niedrig bei ausreichend Traffic. Teste eine klare Value-Prop, kürzere Formulare und stärkere Trust-Elemente. Starte mit 1 A/B Test und einem schnellen UI-Fix.",
                "rationale": "Bei genügend Traffic bringt CR-Optimierung sehr schnell messbaren Umsatzhebel.",
                "expected_effect": "Mehr Conversions ohne zusätzlichen Traffic-Einkauf.",
                "impact_pct": 5,
                "priority": "medium",
                "category": "conversion",
                "timeframe": "this_week",
                "kpi_affected": ["conversion_rate", "conversions"],
                "auto_task_title": "A/B Test Landingpage (Value-Prop + CTA)",
            })
        if not recs:
            recs.append({
                "title": "Stabil: Nächster Growth-Schritt vorbereiten",
                "description": "KPIs sind aktuell stabil. Nutze das Momentum: plane einen kleinen A/B Test oder ein kurzes Kampagnen-Experiment und lege Tracking für die Wirkung an.",
                "rationale": "Kontinuierliche kleine Experimente schlagen seltene große Aktionen.",
                "expected_effect": "Schrittweise Verbesserung von Traffic, CR oder Umsatz.",
                "impact_pct": 3,
                "priority": "low",
                "category": "growth",
                "timeframe": "this_week",
                "kpi_affected": ["revenue", "traffic", "conversion_rate"],
                "auto_task_title": "Mini-Experiment planen (A/B Test oder Kampagne)",
            })
        return recs[:3]

    try:
        raw = await call_claude(system_prompt, user_prompt, max_tokens=1200)
        recommendations = json.loads(raw)
    except Exception as e:
        # Provide deterministic recommendations so the UI stays useful without external AI.
        recommendations = _fallback_recommendations()

    return {
        "kpis": report["kpis"],
        "growth": report["growth"],
        "trends": report["trends"],
        "age_distribution": report["age_distribution"],
        "segment_performance": report["segment_performance"],
        "alerts": alerts,
        "recommendations": recommendations,
        "insights": report["insights"],
    }


@router.get("/kpis", summary="Get KPI dashboard report")
async def get_kpis(current_user: User = Depends(get_current_user)):
    return await _build_kpi_response()


@router.get("/api/kpi", summary="Get KPI dashboard report (frontend path)")
async def get_kpi_frontend_alias(current_user: User = Depends(get_current_user)):
    return await _build_kpi_response()


@router.get("/api/kpis", summary="Get KPI dashboard report (plural alias)")
async def get_kpis_frontend_alias(current_user: User = Depends(get_current_user)):
    return await _build_kpi_response()


@router.post("/upload-csv", summary="Upload CSV user data for KPI analysis")
async def upload_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    # Dateityp prüfen
    allowed_types = {"text/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Ungültiger Dateityp. Bitte eine CSV-Datei hochladen.")

    # Dateiname validieren
    filename = file.filename or ""
    if not filename.lower().endswith((".csv", ".txt")):
        raise HTTPException(status_code=400, detail="Dateiname muss auf .csv oder .txt enden.")

    # Größenlimit erzwingen (chunk-weise lesen)
    chunks = []
    total = 0
    while True:
        chunk = await file.read(65536)  # 64 KB pro Chunk
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Datei zu groß. Maximum: {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)

    contents = b"".join(chunks)
    if not contents:
        raise HTTPException(status_code=400, detail="Leere Datei hochgeladen.")

    try:
        parsed = parse_csv_data(contents)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="CSV-Parsing fehlgeschlagen. Benötigte Spalten: user_id, age, revenue, converted.",
        )

    if not parsed:
        raise HTTPException(status_code=400, detail="Keine gültigen Daten in der CSV gefunden.")

    set_uploaded_data(parsed)
    return {"message": "CSV erfolgreich hochgeladen.", "rows": len(parsed)}


@router.post("/seed-timeseries", summary="Seed 30 days of dummy metrics data")
def seed_dummy_timeseries(current_user: User = Depends(get_current_user)):
    """Nur in Entwicklungsumgebungen verfügbar."""
    if is_production_environment():
        raise HTTPException(status_code=403, detail="In Produktion nicht verfügbar.")
    inserted = seed_timeseries()
    return {"message": "Timeseries seeding abgeschlossen.", "inserted_rows": inserted}


# ─── KPI snapshot (DB-based, AI-ready) ──────────────────────────────────────

@router.get("/api/kpi/snapshot", response_model=KpiSnapshot, summary="KPI Snapshot 30d (AI-ready)")
def get_kpi_snapshot(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    window_start = today - timedelta(days=30)

    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= window_start)
        .order_by(DailyMetrics.date)
        .all()
    )

    revenues      = [to_float(getattr(r, "revenue", 0)) for r in rows]
    traffics      = [to_float(getattr(r, "traffic", 0)) for r in rows]
    conversions   = [to_float(getattr(r, "conversions", 0)) for r in rows]
    conv_rates    = [to_float(getattr(r, "conversion_rate", 0)) for r in rows]
    new_customers = [to_float(getattr(r, "new_customers", 0)) for r in rows]

    avg_revenue         = _avg(revenues)
    avg_traffic         = _avg(traffics)
    avg_conversions     = _avg(conversions)
    avg_conversion_rate = _avg(conv_rates)
    avg_new_customers   = _avg(new_customers)
    total_revenue       = round(sum(revenues), 2)
    revenue_trend       = _trend(revenues)
    traffic_trend       = _trend(traffics)
    cr_trend            = _trend(conv_rates)

    goals = db.query(Goal).all()
    open_goals      = sum(1 for g in goals if str(getattr(g, "status", "")) != "completed")
    completed_goals = sum(1 for g in goals if str(getattr(g, "status", "")) == "completed")

    rev_dir = "steigend" if revenue_trend > 0 else ("fallend" if revenue_trend < 0 else "stabil")
    tr_dir  = "steigend" if traffic_trend > 0 else ("fallend" if traffic_trend < 0 else "stabil")
    cr_dir  = "steigend" if cr_trend > 0 else ("fallend" if cr_trend < 0 else "stabil")

    summary_text = (
        f"KPI-Snapshot ({window_start} bis {today}): "
        f"Durchschnittlicher Umsatz {avg_revenue:.2f}€/Tag (Trend: {rev_dir}, {revenue_trend:+.1f}%). "
        f"Traffic {avg_traffic:.0f} Besucher/Tag (Trend: {tr_dir}, {traffic_trend:+.1f}%). "
        f"Conversion Rate {avg_conversion_rate:.2f}% (Trend: {cr_dir}, {cr_trend:+.1f}%). "
        f"Neue Kunden: {avg_new_customers:.1f}/Tag. "
        f"Gesamtumsatz im Zeitraum: {total_revenue:.2f}€. "
        f"Offene Ziele: {open_goals}, abgeschlossene Ziele: {completed_goals}."
    )

    return KpiSnapshot(
        period_start=str(window_start),
        period_end=str(today),
        avg_revenue=avg_revenue,
        avg_traffic=avg_traffic,
        avg_conversions=avg_conversions,
        avg_conversion_rate=avg_conversion_rate,
        avg_new_customers=avg_new_customers,
        revenue_trend_pct=revenue_trend,
        traffic_trend_pct=traffic_trend,
        conversion_rate_trend_pct=cr_trend,
        total_revenue=total_revenue,
        open_goals=open_goals,
        completed_goals=completed_goals,
        summary_text=summary_text,
    )
