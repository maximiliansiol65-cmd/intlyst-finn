"""
Intlyst KI-Engine - High-Level Business Analyst
Analysiert vorhandene Daten und liefert priorisierte Erkenntnisse.
"""

from datetime import date, datetime, timedelta
import json
import os
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from models.daily_metrics import DailyMetrics
from models.task import Task
from security_config import is_configured_secret
from services.analysis_service import (
    build_intlyst_dataset,
    contains_numeric_signal,
    score_alert_quality,
    score_automation_quality,
    score_pattern_quality,
    score_recommendation_quality,
)


router = APIRouter(prefix="/api/intlyst", tags=["intlyst"])

CLAUDE_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"

INTLYST_SYSTEM = """Du bist ein High-Level Business-Analyst und KI-Optimizer fuer Intlyst.
Du arbeitest auf Basis aller vorhandenen Datenquellen, Analysen und Prozesse im System.
Deine Aufgabe ist es, alle vorhandenen Daten tiefgreifend zu analysieren, neue Muster zu erkennen,
Strategien abzuleiten und automatisch priorisierte Empfehlungen zu generieren,
sodass das Unternehmen einen klaren Wettbewerbsvorsprung erhaelt.

Regeln:
- Alle Empfehlungen sind ausschliesslich datenbasiert - keine Vermutungen
- Output immer klar, professionell und direkt umsetzbar
- Priorisiere nach Impact und Dringlichkeit
- Antworte NUR mit validem JSON - kein Markdown, kein erklaerender Text ausserhalb"""


class IntlystAlert(BaseModel):
    id: str
    type: str
    title: str
    description: str
    metric: str
    current_value: float
    threshold: float
    deviation_pct: float
    priority: str
    action: str
    auto_task: bool
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class IntlystRecommendation(BaseModel):
    id: str
    title: str
    description: str
    rationale: str
    expected_effect: str
    impact_pct: float
    priority: str
    category: str
    timeframe: str
    effort: str
    auto_task_title: str
    kpi_affected: list[str]
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class IntlystPattern(BaseModel):
    id: str
    type: str
    title: str
    description: str
    metrics: list[str]
    confidence: int
    implication: str
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class IntlystAutomation(BaseModel):
    id: str
    title: str
    description: str
    trigger: str
    action: str
    expected_saving: str
    complexity: str
    quality_score: Optional[int] = None
    quality_label: Optional[str] = None


class IntlystFullResponse(BaseModel):
    generated_at: str
    data_period: str
    executive_summary: str
    health_score: int
    alerts: list[IntlystAlert]
    recommendations: list[IntlystRecommendation]
    patterns: list[IntlystPattern]
    automations: list[IntlystAutomation]
    dashboard_improvements: list[str]
    auto_created_tasks: int


def _to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def _safe_json_object(raw_text: str) -> dict:
    raw = (raw_text or "").strip()
    if not raw:
        return {}

    if raw.startswith("```"):
        parts = raw.split("```")
        if len(parts) >= 2:
            raw = parts[1]
    if raw.startswith("json"):
        raw = raw[4:].strip()

    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start < 0 or end <= start:
        return {}

    try:
        data = json.loads(raw[start:end])
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def _call_intlyst_with_regeneration(context: str, prompt: str, issue: str, max_tokens: int = 3000) -> dict:
    retry_prompt = (
        f"{prompt}\n\n"
        "REGENERATIONS-HINWEIS:\n"
        f"Die vorige Antwort war qualitativ unzureichend: {issue}\n"
        "Erzeuge die Antwort komplett neu, mit staerkeren Zahlenbelegen, klareren Handlungen und ohne generische Aussagen."
    )
    return await call_intlyst(context, retry_prompt, max_tokens=max_tokens)


def load_all_data(db: Session) -> dict:
    return build_intlyst_dataset(db)


async def call_intlyst(context: str, prompt: str, max_tokens: int = 3000) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return {}

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            CLAUDE_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": max_tokens,
                "system": INTLYST_SYSTEM,
                "messages": [{"role": "user", "content": f"{context}\n\n{prompt}"}],
            },
        )

    if response.status_code != 200:
        return {}

    content = response.json().get("content", [])
    if not content:
        return {}
    raw_text = str(content[0].get("text", ""))
    return _safe_json_object(raw_text)


async def auto_create_tasks(recs: list[dict], db: Session) -> int:
    count = 0
    for rec in recs:
        if rec.get("priority") == "high" and rec.get("auto_task_title"):
            existing = db.query(Task).filter(Task.title == rec["auto_task_title"]).first()
            if existing:
                continue

            db.add(
                Task(
                    title=str(rec["auto_task_title"]),
                    description=(
                        f"{rec.get('description', '')}\n\n"
                        f"Erwarteter Effekt: {rec.get('expected_effect', '')}"
                    ),
                    priority="high",
                    status="open",
                    created_by="intlyst",
                )
            )
            count += 1

    if count > 0:
        db.commit()
    return count


def _validated_alerts(items: list[dict], snapshot: dict) -> list[dict]:
    valid: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip().lower()
        metric = str(item.get("metric", "")).strip().lower()
        if not title or not metric or not item.get("action"):
            continue
        if (title, metric) in seen:
            continue
        if not contains_numeric_signal(str(item.get("description", "")) + str(item.get("deviation_pct", ""))):
            continue
        scored = score_alert_quality(item, snapshot)
        if int(scored.get("quality_score", 0) or 0) < 58:
            continue
        seen.add((title, metric))
        valid.append(scored)
    return valid[:4]


def _validated_intlyst_recommendations(items: list[dict], snapshot: dict) -> list[dict]:
    valid: list[dict] = []
    seen_titles: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip().lower()
        if not title or title in seen_titles:
            continue
        if float(item.get("impact_pct", 0) or 0) <= 0:
            continue
        if len(str(item.get("description", "")).strip()) < 20:
            continue
        if not contains_numeric_signal(str(item.get("rationale", ""))):
            continue
        scored = score_recommendation_quality(item, snapshot)
        if int(scored.get("quality_score", 0) or 0) < 60:
            continue
        seen_titles.add(title)
        valid.append(scored)
    valid.sort(key=lambda item: float(item.get("impact_pct", 0) or 0), reverse=True)
    return valid[:5]


def _validated_patterns(items: list[dict], snapshot: dict) -> list[dict]:
    valid: list[dict] = []
    seen_titles: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip().lower()
        if not title or title in seen_titles:
            continue
        if len(str(item.get("description", "")).strip()) < 18 or int(item.get("confidence", 0) or 0) < 50:
            continue
        scored = score_pattern_quality(item, snapshot)
        if int(scored.get("quality_score", 0) or 0) < 55:
            continue
        seen_titles.add(title)
        valid.append(scored)
    return valid[:4]


def _validated_automations(items: list[dict], snapshot: dict) -> list[dict]:
    valid: list[dict] = []
    seen_titles: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip().lower()
        if not title or title in seen_titles:
            continue
        if len(str(item.get("action", "")).strip()) < 10 or len(str(item.get("trigger", "")).strip()) < 8:
            continue
        scored = score_automation_quality(item, snapshot)
        if int(scored.get("quality_score", 0) or 0) < 50:
            continue
        seen_titles.add(title)
        valid.append(scored)
    return valid[:3]


def _intlyst_issue(
    alerts: list[dict],
    recommendations: list[dict],
    patterns: list[dict],
    automations: list[dict],
) -> Optional[str]:
    if len(recommendations) < 3:
        return f"Es wurden nur {len(recommendations)} valide Empfehlungen geliefert, benoetigt sind mindestens 3."
    if len(patterns) < 1:
        return "Es wurde kein valides Muster geliefert."
    recommendation_quality = sum(int(item.get("quality_score", 0) or 0) for item in recommendations) / max(len(recommendations), 1)
    if recommendation_quality < 68:
        return f"Die durchschnittliche Empfehlungsqualitaet ist mit {recommendation_quality:.1f} zu niedrig."
    if alerts and sum(int(item.get("quality_score", 0) or 0) for item in alerts) / len(alerts) < 60:
        return "Die Alerts sind zu schwach belegt."
    if automations and sum(int(item.get("quality_score", 0) or 0) for item in automations) / len(automations) < 55:
        return "Die Automationsvorschlaege sind zu generisch."
    return None


@router.get("/analyze", response_model=IntlystFullResponse)
async def full_analysis(auto_tasks: bool = True, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    loaded = load_all_data(db)
    context = loaded["context"]
    snapshot = loaded.get("snapshots", {}).get("30d", {}) if isinstance(loaded.get("snapshots"), dict) else {}

    prompt = """Fuehre eine vollstaendige High-Level Analyse aller Geschaeftsdaten durch.

Antworte NUR mit diesem JSON:
{
  "executive_summary": "4-5 Saetze: Gesamtlage, wichtigste Erkenntnisse, Top-Prioritaet - praezise und datenbasiert",
  "health_score": 72,
  "alerts": [
    {
      "id": "alert-001",
      "type": "critical|warning|opportunity|info",
      "title": "Titel (max 6 Woerter)",
      "description": "Was passiert und warum - mit konkreten Zahlen",
      "metric": "revenue|traffic|conversion_rate|new_customers",
      "current_value": 1250.0,
      "threshold": 1500.0,
      "deviation_pct": -16.7,
      "priority": "high|medium|low",
      "action": "Konkrete Sofortmassnahme",
      "auto_task": true
    }
  ],
  "recommendations": [
    {
      "id": "rec-001",
      "title": "Handlungstitel (max 6 Woerter)",
      "description": "Was genau zu tun ist",
      "rationale": "Warum - basierend auf konkreten Datenpunkten",
      "expected_effect": "Messbares erwartetes Ergebnis",
      "impact_pct": 18.5,
      "priority": "high|medium|low",
      "category": "marketing|product|sales|operations|finance",
      "timeframe": "immediate|this_week|this_month|this_quarter",
      "effort": "low|medium|high",
      "auto_task_title": "Task-Titel der automatisch erstellt wird",
      "kpi_affected": ["revenue", "conversion_rate"]
    }
  ],
  "patterns": [
    {
      "id": "pat-001",
      "type": "trend|anomaly|correlation|cycle",
      "title": "Muster-Name",
      "description": "Was das Muster ist und warum es wichtig ist",
      "metrics": ["revenue", "traffic"],
      "confidence": 85,
      "implication": "Was das fuer das Unternehmen bedeutet"
    }
  ],
  "automations": [
    {
      "id": "aut-001",
      "title": "Automatisierung-Name",
      "description": "Was automatisiert werden soll",
      "trigger": "Ausloeser (z.B. KPI faellt unter X)",
      "action": "Was automatisch passiert",
      "expected_saving": "Erwartete Zeitersparnis oder Effizienzgewinn",
      "complexity": "low|medium|high"
    }
  ],
  "dashboard_improvements": [
    "Verbesserungsvorschlag 1 fuer Dashboard/Reports",
    "Verbesserungsvorschlag 2"
  ]
}

Regeln:
- 2-4 Alerts (nur wenn wirklich Handlungsbedarf)
- 3-5 Recommendations, nach impact_pct absteigend
- 2-4 Patterns (echte Muster aus den Daten)
- 2-3 Automations (konkrete, umsetzbare Vorschlaege)
- 2-3 Dashboard-Verbesserungen
- health_score: 0-100 basierend auf allen Metriken
- Nur Empfehlungen mit auto_task: true bekommen einen auto_task_title
- Nutze nach Moeglichkeit Effizienzkennzahlen, Zielabweichungen, Korrelationen und Wochentagsmuster.
- Jede Empfehlung und jeder Alert braucht eine kausale Begruendung: Signal -> Risiko/Chance -> Handlung."""

    data = await call_intlyst(context, prompt, max_tokens=3000)

    if not data:
        data = {
            "executive_summary": "API Key fehlt oder Analyse nicht verfuegbar.",
            "health_score": 0,
            "alerts": [],
            "recommendations": [],
            "patterns": [],
            "automations": [],
            "dashboard_improvements": [],
        }

    alerts = _validated_alerts(data.get("alerts", []), snapshot)
    recommendations = _validated_intlyst_recommendations(data.get("recommendations", []), snapshot)
    patterns = _validated_patterns(data.get("patterns", []), snapshot)
    automations = _validated_automations(data.get("automations", []), snapshot)
    dashboard_improvements = [str(item).strip() for item in data.get("dashboard_improvements", []) if str(item).strip()][:3]
    issue = _intlyst_issue(alerts, recommendations, patterns, automations)

    if issue and is_configured_secret(os.getenv("ANTHROPIC_API_KEY", ""), prefixes=("sk-ant-",), min_length=20):
        regenerated = await _call_intlyst_with_regeneration(context, prompt, issue, max_tokens=3000)
        if regenerated:
            data = regenerated
            alerts = _validated_alerts(data.get("alerts", []), snapshot)
            recommendations = _validated_intlyst_recommendations(data.get("recommendations", []), snapshot)
            patterns = _validated_patterns(data.get("patterns", []), snapshot)
            automations = _validated_automations(data.get("automations", []), snapshot)
            dashboard_improvements = [str(item).strip() for item in data.get("dashboard_improvements", []) if str(item).strip()][:3]

    auto_count = 0
    if auto_tasks and recommendations:
        auto_count = await auto_create_tasks(recommendations, db)

    return IntlystFullResponse(
        generated_at=datetime.utcnow().isoformat(),
        data_period=str(loaded.get("period", "")),
        executive_summary=str(data.get("executive_summary", "")),
        health_score=max(0, min(100, int(data.get("health_score", 50) or 50))),
        alerts=[IntlystAlert(**alert) for alert in alerts],
        recommendations=[IntlystRecommendation(**recommendation) for recommendation in recommendations],
        patterns=[IntlystPattern(**pattern) for pattern in patterns],
        automations=[IntlystAutomation(**automation) for automation in automations],
        dashboard_improvements=dashboard_improvements,
        auto_created_tasks=auto_count,
    )


@router.get("/quick-alerts")
async def quick_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= today - timedelta(days=14))
        .order_by(DailyMetrics.date)
        .all()
    )

    if not rows:
        return {"alerts": [], "count": 0}

    alerts: list[dict] = []
    rev_avg = sum(_to_float(r.revenue) for r in rows) / len(rows)
    tr_avg = sum(_to_float(r.traffic) for r in rows) / len(rows)

    yesterday = rows[-1]
    for metric, val, avg, label in [
        ("revenue", _to_float(yesterday.revenue), rev_avg, "Umsatz"),
        ("traffic", _to_float(yesterday.traffic), tr_avg, "Traffic"),
    ]:
        if avg == 0:
            continue
        dev = (val - avg) / avg * 100
        if dev <= -20:
            alerts.append(
                {
                    "metric": metric,
                    "label": label,
                    "value": round(val, 2),
                    "avg": round(avg, 2),
                    "dev_pct": round(dev, 1),
                    "severity": "high" if dev <= -35 else "medium",
                }
            )

    overdue = (
        db.query(Task)
        .filter(Task.status != "done", Task.due_date.isnot(None), Task.due_date < today)
        .count()
    )

    if overdue > 0:
        alerts.append(
            {
                "metric": "tasks",
                "label": "Ueberfaellige Tasks",
                "value": overdue,
                "avg": 0,
                "dev_pct": 0,
                "severity": "high" if overdue >= 3 else "medium",
            }
        )

    return {"alerts": alerts, "count": len(alerts)}


@router.get("/patterns")
async def detect_patterns(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= date.today() - timedelta(days=30))
        .order_by(DailyMetrics.date)
        .all()
    )

    if len(rows) < 7:
        return {"patterns": []}

    patterns: list[dict] = []
    rev_vals = [_to_float(r.revenue) for r in rows]

    by_weekday: dict[int, list[float]] = {}
    for row in rows:
        weekday = row.date.weekday()
        by_weekday.setdefault(weekday, []).append(_to_float(row.revenue))

    avg_by_day = {weekday: sum(vals) / len(vals) for weekday, vals in by_weekday.items() if vals}
    if avg_by_day:
        best_day = max(avg_by_day, key=avg_by_day.get)
        worst_day = min(avg_by_day, key=avg_by_day.get)
        days_de = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
        if avg_by_day[best_day] > avg_by_day[worst_day] * 1.3:
            patterns.append(
                {
                    "type": "cycle",
                    "title": "Wochentags-Zyklus erkannt",
                    "description": (
                        f"{days_de[best_day]} ist umsatzstaerkster Tag (O EUR{avg_by_day[best_day]:.2f}), "
                        f"{days_de[worst_day]} schwaechster (O EUR{avg_by_day[worst_day]:.2f})"
                    ),
                    "confidence": 80,
                }
            )

    half = len(rev_vals) // 2
    recent_avg = sum(rev_vals[half:]) / max(len(rev_vals[half:]), 1)
    old_avg = sum(rev_vals[:half]) / max(len(rev_vals[:half]), 1)
    trend = ((recent_avg - old_avg) / old_avg * 100) if old_avg else 0

    if abs(trend) > 10:
        patterns.append(
            {
                "type": "trend",
                "title": f"Umsatz-Trend: {'+' if trend > 0 else ''}{trend:.1f}%",
                "description": (
                    f"In der zweiten Monatshaelfte liegt der Umsatz {'ueber' if trend > 0 else 'unter'} "
                    f"der ersten Haelfte"
                ),
                "confidence": 75,
            }
        )

    return {"patterns": patterns}