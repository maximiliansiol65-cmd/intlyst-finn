from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from database import get_current_workspace_id
from services.tenant_guard import TenantContextError
from models.decision_problem import DecisionProblem
from models.daily_metrics import DailyMetrics
from services.external_signal_service import get_external_signals

METRIC_CONFIG = {
    "revenue": {
        "label": "Umsatz",
        "unit": "EUR",
        "high_threshold": 0.12,
        "critical_threshold": 0.22,
        "category": "revenue",
    },
    "cost": {
        "label": "Kosten",
        "unit": "EUR",
        "high_threshold": 0.10,
        "critical_threshold": 0.18,
        "category": "finance",
    },
    "profit": {
        "label": "Gewinn",
        "unit": "EUR",
        "high_threshold": 0.10,
        "critical_threshold": 0.18,
        "category": "finance",
    },
    "gross_margin": {
        "label": "Bruttomarge",
        "unit": "%",
        "high_threshold": 0.05,
        "critical_threshold": 0.10,
        "category": "finance",
    },
    "cashflow": {
        "label": "Cashflow",
        "unit": "EUR",
        "high_threshold": 0.10,
        "critical_threshold": 0.18,
        "category": "finance",
    },
    "liquidity": {
        "label": "Liquidität",
        "unit": "EUR",
        "high_threshold": 0.10,
        "critical_threshold": 0.18,
        "category": "finance",
    },
    "traffic": {
        "label": "Traffic",
        "unit": "sessions",
        "high_threshold": 0.15,
        "critical_threshold": 0.25,
        "category": "marketing",
    },
    "conversions": {
        "label": "Conversions",
        "unit": "orders",
        "high_threshold": 0.15,
        "critical_threshold": 0.25,
        "category": "sales",
    },
    "conversion_rate": {
        "label": "Conversion Rate",
        "unit": "ratio",
        "high_threshold": 0.08,
        "critical_threshold": 0.15,
        "category": "product",
    },
    "new_customers": {
        "label": "Neue Kunden",
        "unit": "customers",
        "high_threshold": 0.12,
        "critical_threshold": 0.22,
        "category": "growth",
    },
}

# Mapping für Ursachen → interne/externe Faktoren + Farbcode für Visualisierung
CAUSE_METADATA = {
    "marketing_acquisition": {"factor_type": "internal", "factor_label": "Marketing / Acquisition", "color": "#ef4444"},
    "campaign_performance": {"factor_type": "internal", "factor_label": "Marketing / Campaigns", "color": "#f97316"},
    "channel_mix": {"factor_type": "internal", "factor_label": "Kanal-Mix", "color": "#f59e0b"},
    "social_decline": {"factor_type": "internal", "factor_label": "Social Performance", "color": "#a855f7"},
    "seasonality": {"factor_type": "external", "factor_label": "Saisonalität", "color": "#22c55e"},
    "external_market": {"factor_type": "external", "factor_label": "Markt / Wettbewerb", "color": "#0ea5e9"},
    "funnel_conversion": {"factor_type": "internal", "factor_label": "Funnel / Checkout", "color": "#2563eb"},
    "checkout_or_ux": {"factor_type": "internal", "factor_label": "Checkout / UX", "color": "#2563eb"},
    "traffic_quality": {"factor_type": "internal", "factor_label": "Traffic-Qualität", "color": "#3b82f6"},
    "landing_page_quality": {"factor_type": "internal", "factor_label": "Landingpage", "color": "#10b981"},
    "low_intent_traffic": {"factor_type": "external", "factor_label": "Low-Intent Traffic", "color": "#8b5cf6"},
    "pricing_or_offer": {"factor_type": "internal", "factor_label": "Pricing / Angebot", "color": "#f43f5e"},
    "refunds_payments": {"factor_type": "internal", "factor_label": "Zahlungen / Refunds", "color": "#e11d48"},
    "customer_acquisition": {"factor_type": "internal", "factor_label": "Neukunden", "color": "#14b8a6"},
    "operational_shift": {"factor_type": "internal", "factor_label": "Operations", "color": "#64748b"},
    "crm_pipeline": {"factor_type": "internal", "factor_label": "CRM Pipeline", "color": "#0f172a"},
    "social_media": {"factor_type": "internal", "factor_label": "Social Media", "color": "#8b5cf6"},
    "traffic": {"factor_type": "internal", "factor_label": "Traffic", "color": "#f59e0b"},
    "conversion": {"factor_type": "internal", "factor_label": "Conversion", "color": "#2563eb"},
    "revenue_direct": {"factor_type": "internal", "factor_label": "Revenue", "color": "#ef4444"},
}

# Structured KPI system for the "single main problem" decision flow.
DECISION_KPI_CONFIG = {
    "revenue": {"label": "Umsatz", "source": "revenue", "importance": 10, "category": "Sales"},
    "traffic": {"label": "Traffic", "source": "traffic", "importance": 8, "category": "Website"},
    "customers": {"label": "Kunden", "source": "new_customers", "importance": 8, "category": "Sales"},
    "conversion": {"label": "Conversion", "source": "conversion_rate", "importance": 9, "category": "Website"},
    "social_media": {"label": "Social Media", "source": "traffic", "importance": 7, "category": "Social Media"},
    "orders": {"label": "Bestellungen", "source": "conversions", "importance": 9, "category": "Sales"},
}

SEVERITY_THRESHOLDS = {
    "small": -5.0,
    "medium": -8.0,
    "large": -12.0,
}


def build_decisions(events: list["DecisionEvent"]) -> list[dict[str, Any]]:
    """
    Liefert die Top 1-3 Entscheidungen nach Einfluss, mit Effekt, Aufwand, Priorität, Risiko.
    """
    ranked = sorted(events, key=lambda e: abs(e.delta_pct) * e.confidence, reverse=True)
    decisions = []
    for event in ranked[:3]:
        effekt = f"{event.metric_label} {'steigern' if event.direction == 'up' else 'stabilisieren'} um {abs(event.delta_pct):.1f}%"
        if event.metric in {"traffic", "conversion_rate"}:
            aufwand = 2.0
        elif event.metric == "revenue":
            aufwand = 3.5
        else:
            aufwand = 2.5
        prio_map = {"critical": "sehr hoch", "high": "hoch", "medium": "mittel", "low": "niedrig"}
        prioritaet = prio_map.get(event.severity, "mittel")
        risiko = "hoch" if event.direction == "down" or event.data_quality < 60 else "moderat"
        decisions.append({
            "id": f"decision:{event.id}",
            "title": f"{event.metric_label} {'steigern' if event.direction == 'up' else 'stabilisieren'}",
            "effect": effekt,
            "expected_effect_pct": round(event.delta_pct, 1),
            "effort_hours": aufwand,
            "priority": prioritaet,
            "risk": risiko,
            "rationale": event.summary,
            "category": event.category,
        })
    return decisions


@dataclass
class DecisionEvent:
    id: str
    metric: str
    metric_label: str
    category: str
    event_type: str
    severity: str
    direction: str
    current_value: float
    baseline_value: float
    delta_pct: float
    confidence: int
    data_quality: int
    window: str
    summary: str
    early_warning: bool
    forecast_window_days: int
    evidence: dict[str, Any]
    # Finanzfelder (optional, für direkte Verknüpfung)
    cost: float = 0.0
    profit: float = 0.0
    gross_margin: float = 0.0
    cashflow: float = 0.0
    liquidity: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        d = {
            "id": self.id,
            "metric": self.metric,
            "metric_label": self.metric_label,
            "category": self.category,
            "event_type": self.event_type,
            "severity": self.severity,
            "direction": self.direction,
            "current_value": round(self.current_value, 2),
            "baseline_value": round(self.baseline_value, 2),
            "delta_pct": round(self.delta_pct, 1),
            "confidence": self.confidence,
            "data_quality": self.data_quality,
            "window": self.window,
            "summary": self.summary,
            "early_warning": self.early_warning,
            "forecast_window_days": self.forecast_window_days,
            "evidence": self.evidence,
        }
        # Finanzfelder nur bei Bedarf ausgeben
        for f in ["cost", "profit", "gross_margin", "cashflow", "liquidity"]:
            v = getattr(self, f, None)
            if v is not None:
                d[f] = round(v, 2)
        return d


def _avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _pct_change(current: float, baseline: float) -> float:
    if baseline == 0:
        return 0.0
    return ((current - baseline) / baseline) * 100.0


def _trend_label(change_pct: float) -> str:
    if change_pct > 0.5:
        return "steigt"
    if change_pct < -0.5:
        return "faellt"
    return "gleich"


def _avg_metric(rows: list[DailyMetrics], field_name: str) -> float:
    if not rows:
        return 0.0
    values = [_safe_float(getattr(row, field_name, 0.0)) for row in rows]
    return _avg(values)


def _severity_from_change(change_pct: float) -> str:
    if change_pct <= SEVERITY_THRESHOLDS["large"]:
        return "grosses_problem"
    if change_pct <= SEVERITY_THRESHOLDS["medium"]:
        return "mittleres_problem"
    if change_pct <= SEVERITY_THRESHOLDS["small"]:
        return "kleines_problem"
    return "none"


def _priority_from_score(score: float) -> str:
    if score >= 100:
        return "High"
    if score >= 50:
        return "Medium"
    return "Low"


def _slice_windows(rows: list[DailyMetrics]) -> dict[str, list[DailyMetrics]]:
    if not rows:
        return {
            "today": [],
            "yesterday": [],
            "last_7d": [],
            "prev_7d": [],
            "last_30d": [],
            "prev_30d": [],
        }
    today = rows[-1].date
    yesterday = today - timedelta(days=1)
    return {
        "today": [row for row in rows if row.date == today],
        "yesterday": [row for row in rows if row.date == yesterday],
        "last_7d": [row for row in rows if row.date > today - timedelta(days=7)],
        "prev_7d": [row for row in rows if today - timedelta(days=14) < row.date <= today - timedelta(days=7)],
        "last_30d": [row for row in rows if row.date > today - timedelta(days=30)],
        "prev_30d": [row for row in rows if today - timedelta(days=60) < row.date <= today - timedelta(days=30)],
    }


def _build_kpi_snapshot(rows: list[DailyMetrics], metric_key: str, cfg: dict[str, Any], windows: dict[str, list[DailyMetrics]]) -> dict[str, Any]:
    source_field = cfg["source"]
    today_value = _avg_metric(windows["today"], source_field)
    yesterday_value = _avg_metric(windows["yesterday"], source_field)
    last_7d_value = _avg_metric(windows["last_7d"], source_field)
    last_30d_value = _avg_metric(windows["last_30d"], source_field)

    change_today_vs_yesterday = _pct_change(today_value, yesterday_value)
    change_week_vs_week = _pct_change(last_7d_value, _avg_metric(windows["prev_7d"], source_field))
    change_month_vs_month = _pct_change(last_30d_value, _avg_metric(windows["prev_30d"], source_field))
    severity = _severity_from_change(change_week_vs_week)
    problem_strength = max(0.0, abs(min(change_week_vs_week, 0.0)))
    score = problem_strength * int(cfg["importance"])

    return {
        "metric_key": metric_key,
        "label": cfg["label"],
        "source_metric": source_field,
        "category": cfg["category"],
        "importance": int(cfg["importance"]),
        "value_today": round(today_value, 4),
        "value_yesterday": round(yesterday_value, 4),
        "value_last_7d": round(last_7d_value, 4),
        "value_last_30d": round(last_30d_value, 4),
        "change_today_vs_yesterday_pct": round(change_today_vs_yesterday, 2),
        "change_week_vs_week_pct": round(change_week_vs_week, 2),
        "change_month_vs_month_pct": round(change_month_vs_month, 2),
        "trend": _trend_label(change_week_vs_week),
        "severity": severity,
        "problem_strength_pct": round(problem_strength, 2),
        "problem_score": round(score, 2),
        "priority": _priority_from_score(score),
    }


def _probable_cause_for_main_problem(kpi_items: list[dict[str, Any]], target_metric_key: str) -> dict[str, Any]:
    lookup = {item["metric_key"]: item for item in kpi_items}
    traffic_change = lookup.get("traffic", {}).get("change_week_vs_week_pct", 0.0)
    conversion_change = lookup.get("conversion", {}).get("change_week_vs_week_pct", 0.0)
    customers_change = lookup.get("customers", {}).get("change_week_vs_week_pct", 0.0)
    social_change = lookup.get("social_media", {}).get("change_week_vs_week_pct", 0.0)

    candidates = [
        ("traffic", traffic_change, "Traffic ruecklaeufig"),
        ("conversion", conversion_change, "Conversion ruecklaeufig"),
        ("customers", customers_change, "Kundenwachstum ruecklaeufig"),
        ("marketing", social_change, "Social/Marketing Signal ruecklaeufig"),
    ]
    candidates.sort(key=lambda item: item[1])  # Most negative first
    top = candidates[0]
    confidence = min(95.0, max(45.0, abs(float(top[1])) * 4.5))
    return {
        "target_metric": target_metric_key,
        "likely_cause": top[0],
        "reason": top[2],
        "confidence_pct": round(confidence, 1),
        "checks": {
            "traffic_change_pct": round(traffic_change, 2),
            "conversion_change_pct": round(conversion_change, 2),
            "customers_change_pct": round(customers_change, 2),
            "marketing_change_pct": round(social_change, 2),
        },
    }


def run_decision_system(db: Session, persist: bool = True, workspace_id: int | None = None) -> dict[str, Any]:
    if workspace_id is None:
        workspace_id = get_current_workspace_id()
    if workspace_id is None:
        raise TenantContextError(
            "run_decision_system called without workspace context. "
            "Pass workspace_id explicitly or set ContextVar before calling."
        )
    rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
        )
        .order_by(DailyMetrics.date.asc())
        .limit(120)
        .all()
    )
    if len(rows) < 2:
        return {
            "ran_at": datetime.utcnow().isoformat(),
            "status": "insufficient_data",
            "message": "Mindestens 2 Tage Daily Metrics erforderlich.",
            "kpis": [],
            "main_problem": None,
        }

    windows = _slice_windows(rows)
    kpi_items = [
        _build_kpi_snapshot(rows, metric_key, cfg, windows)
        for metric_key, cfg in DECISION_KPI_CONFIG.items()
    ]
    ranked = sorted(kpi_items, key=lambda item: item["problem_score"], reverse=True)
    main_problem = ranked[0] if ranked else None
    cause = _probable_cause_for_main_problem(kpi_items, main_problem["metric_key"]) if main_problem else None

    if main_problem and persist:
        now = datetime.utcnow()
        latest = (
            db.query(DecisionProblem)
            .filter(
                DecisionProblem.workspace_id == workspace_id,
                DecisionProblem.metric_key == main_problem["metric_key"],
            )
            .order_by(DecisionProblem.detected_at.desc())
            .first()
        )
        first_seen_at = latest.first_seen_at if latest else now
        row = DecisionProblem(
            workspace_id=workspace_id,
            metric_key=main_problem["metric_key"],
            problem_name=main_problem["label"],
            category=main_problem["category"],
            strength_pct=float(main_problem["problem_strength_pct"]),
            importance=int(main_problem["importance"]),
            problem_score=float(main_problem["problem_score"]),
            severity=main_problem["severity"],
            priority=main_problem["priority"],
            likely_cause=(cause or {}).get("likely_cause"),
            cause_confidence_pct=float((cause or {}).get("confidence_pct", 0.0)),
            detected_at=now,
            first_seen_at=first_seen_at,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        main_problem = {
            **main_problem,
            "record_id": row.id,
            "detected_at": row.detected_at.isoformat(),
            "since": row.first_seen_at.isoformat(),
            "likely_cause": row.likely_cause,
            "cause_confidence_pct": row.cause_confidence_pct,
        }
    elif main_problem:
        main_problem = {
            **main_problem,
            "detected_at": datetime.utcnow().isoformat(),
            "since": datetime.utcnow().isoformat(),
            "likely_cause": (cause or {}).get("likely_cause"),
            "cause_confidence_pct": (cause or {}).get("confidence_pct", 0.0),
        }

    return {
        "ran_at": datetime.utcnow().isoformat(),
        "status": "ok",
        "workflow": [
            "data_loaded",
            "changes_computed",
            "problems_detected",
            "scores_computed",
            "main_problem_selected",
        ],
        "kpis": kpi_items,
        "thresholds_pct": SEVERITY_THRESHOLDS,
        "main_problem": main_problem,
        "cause_analysis": cause,
    }


def list_problem_history(db: Session, limit: int = 30, workspace_id: int | None = None) -> list[dict[str, Any]]:
    if workspace_id is None:
        workspace_id = get_current_workspace_id()
    if workspace_id is None:
        raise TenantContextError("list_problem_history called without workspace context.")
    rows = (
        db.query(DecisionProblem)
        .filter(DecisionProblem.workspace_id == workspace_id)
        .order_by(DecisionProblem.detected_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return [
        {
            "id": row.id,
            "problem_name": row.problem_name,
            "metric_key": row.metric_key,
            "category": row.category,
            "strength_pct": round(float(row.strength_pct or 0.0), 2),
            "problem_score": round(float(row.problem_score or 0.0), 2),
            "severity": row.severity,
            "priority": row.priority,
            "likely_cause": row.likely_cause,
            "cause_confidence_pct": round(float(row.cause_confidence_pct or 0.0), 1),
            "detected_at": row.detected_at.isoformat() if row.detected_at else None,
            "since": row.first_seen_at.isoformat() if row.first_seen_at else None,
        }
        for row in rows
    ]


def _deadline_for_duration(duration_min: int) -> str:
    now = datetime.utcnow()
    if duration_min <= 10:
        return (now + timedelta(days=1)).date().isoformat()
    if duration_min <= 60:
        return (now + timedelta(days=2)).date().isoformat()
    return (now + timedelta(days=5)).date().isoformat()


def _effort_bucket(duration_min: int) -> str:
    if duration_min < 10:
        return "Quick Win"
    if duration_min <= 60:
        return "Normale Aufgabe"
    return "Grosse Aufgabe"


def _impact_level(impact_score: float) -> str:
    if impact_score >= 100:
        return "High Impact"
    if impact_score >= 50:
        return "Medium Impact"
    return "Low Impact"


def _cause_action_templates(cause: str) -> list[dict[str, Any]]:
    cause_key = (cause or "").lower()
    if cause_key == "traffic":
        return [
            {
                "title": "3 datenbasierte Social Posts veröffentlichen",
                "description": "Erstelle und veröffentliche heute 3 Posts auf den stärksten Kanälen mit klarem CTA auf die Top-Landingpage.",
                "why": "Schneller Reichweiten- und Traffic-Hebel ohne lange Vorlaufzeit.",
                "expected_effect": "+12% Traffic möglich",
                "expected_effect_pct": 12.0,
                "duration_min": 10,
            },
            {
                "title": "Performance-Kampagne mit 1 klarer Zielgruppe starten",
                "description": "Aktiviere eine fokussierte Kampagne mit begrenztem Budget und eindeutiger Conversion-Absicht.",
                "why": "Bringt kurzfristig qualifizierte Besucher zurück.",
                "expected_effect": "+9% Traffic möglich",
                "expected_effect_pct": 9.0,
                "duration_min": 45,
            },
            {
                "title": "SEO-Quick-Audit + Landingpage Speed verbessern",
                "description": "Prüfe Meta-Titel, interne Verlinkung und Ladezeit der wichtigsten Landingpage und behebe die größten Bremsen.",
                "why": "Verbessert organische Sichtbarkeit und reduziert Absprünge.",
                "expected_effect": "+6% Traffic möglich",
                "expected_effect_pct": 6.0,
                "duration_min": 90,
            },
        ]
    if cause_key == "customers":
        return [
            {
                "title": "Reaktivierungs-E-Mail an Bestandskunden senden",
                "description": "Sende eine personalisierte Reaktivierungs-Mail mit klarem Rückkehr-Angebot an inaktive Kunden.",
                "why": "Bestehende Kunden konvertieren meist günstiger als Neukunden.",
                "expected_effect": "+5% Umsatz möglich",
                "expected_effect_pct": 5.0,
                "duration_min": 10,
            },
            {
                "title": "Zeitlich begrenzte Rabattaktion aufsetzen",
                "description": "Erstelle eine 48h-Aktion für abwanderungsgefährdete Segmente mit klaren Bedingungen.",
                "why": "Aktiviert kaufbereite Kunden kurzfristig.",
                "expected_effect": "+7% Kundenrückgewinnung möglich",
                "expected_effect_pct": 7.0,
                "duration_min": 45,
            },
            {
                "title": "Automatisierte Reaktivierungssequenz starten",
                "description": "Lege eine 3-stufige E-Mail-Sequenz für Kunden ohne Kauf in den letzten 30 Tagen an.",
                "why": "Skaliert Wiederaktivierung nachhaltig.",
                "expected_effect": "+6% wiederkehrende Kunden möglich",
                "expected_effect_pct": 6.0,
                "duration_min": 75,
            },
        ]
    if cause_key == "marketing":
        return [
            {
                "title": "Beste Kampagne duplizieren und fokussieren",
                "description": "Dupliziere die effizienteste Kampagne und passe sie auf das stärkste Segment an.",
                "why": "Nutzen vorhandener Winner-Patterns reduziert Risiko.",
                "expected_effect": "+8% Reichweite möglich",
                "expected_effect_pct": 8.0,
                "duration_min": 30,
            },
            {
                "title": "Content-Plan für 7 Tage erstellen",
                "description": "Erzeuge 7 kurze Inhalte inkl. Hook, CTA und KPI-Ziel je Post.",
                "why": "Konstante Ausspielung stabilisiert Marketing-Signale.",
                "expected_effect": "+6% Engagement möglich",
                "expected_effect_pct": 6.0,
                "duration_min": 60,
            },
            {
                "title": "UTM-Tracking für alle aktiven Kanäle korrigieren",
                "description": "Prüfe UTM-Parameter, Benennungslogik und Tracking-Vollständigkeit.",
                "why": "Verhindert Fehlentscheidungen durch schlechte Datenqualität.",
                "expected_effect": "+4% bessere Attributionsgenauigkeit",
                "expected_effect_pct": 4.0,
                "duration_min": 20,
            },
        ]
    # Default: conversion
    return [
        {
            "title": "Produktseite mit klarem CTA optimieren",
            "description": "Schärfe Headline, Nutzenargumente und primären CTA oberhalb des Folds.",
            "why": "Direkter Hebel auf Conversion ohne zusätzlichen Traffic.",
            "expected_effect": "+8% Conversion möglich",
            "expected_effect_pct": 8.0,
            "duration_min": 30,
        },
        {
            "title": "Produktbilder und Vertrauenselemente verbessern",
            "description": "Ersetze schwache Visuals, ergänze Social Proof und FAQ gegen Kaufhemmnisse.",
            "why": "Reduziert Unsicherheit im Checkout-Prozess.",
            "expected_effect": "+6% Conversion möglich",
            "expected_effect_pct": 6.0,
            "duration_min": 45,
        },
        {
            "title": "Preis- und Angebotsstruktur testen",
            "description": "Teste eine klare Preisbotschaft oder Bundle-Variante auf der Hauptseite.",
            "why": "Preiswahrnehmung ist oft Haupttreiber für Kaufabbrüche.",
            "expected_effect": "+5% Umsatz möglich",
            "expected_effect_pct": 5.0,
            "duration_min": 75,
        },
    ]


def build_action_system(db: Session) -> dict[str, Any]:
    decision = run_decision_system(db, persist=True)
    main_problem = decision.get("main_problem")
    cause_analysis = decision.get("cause_analysis") or {}
    if not main_problem:
        return {
            "status": "no_problem",
            "main_problem": None,
            "cause": None,
            "top_actions": [],
            "main_task": None,
            "background_actions": [],
        }

    cause = cause_analysis.get("likely_cause") or "conversion"
    templates = _cause_action_templates(str(cause))
    impact_base = float(main_problem.get("problem_strength_pct", 0.0)) * float(main_problem.get("importance", 1))

    actions = []
    for idx, item in enumerate(templates):
        expected_effect_pct = float(item["expected_effect_pct"])
        impact_score = round(max(0.0, impact_base * (expected_effect_pct / 10.0)), 2)
        duration_min = int(item["duration_min"])
        priority = "High" if impact_score >= 100 else "Medium" if impact_score >= 50 else "Low"
        actions.append(
            {
                "rank": idx + 1,
                "action_id": f"act_{main_problem['metric_key']}_{idx + 1}",
                "title": item["title"],
                "description": item["description"],
                "why_important": item["why"],
                "goal": f"{main_problem['label']} stabilisieren und Trend drehen",
                "expected_effect": item["expected_effect"],
                "expected_effect_pct": expected_effect_pct,
                "impact_score": impact_score,
                "impact_level": _impact_level(impact_score),
                "priority": priority,
                "duration_min": duration_min,
                "duration_label": _effort_bucket(duration_min),
                "deadline": _deadline_for_duration(duration_min),
                "assignment_options": ["self", "team_member", "later"],
                "task_payload": {
                    "title": item["title"],
                    "description": (
                        f"{item['description']}\n\n"
                        f"Warum wichtig: {item['why']}\n"
                        f"Erwarteter Effekt: {item['expected_effect']}\n"
                        f"Ziel: {main_problem['label']} stabilisieren."
                    ),
                    "priority": priority.lower(),
                    "due_date": _deadline_for_duration(duration_min),
                },
            }
        )

    actions.sort(key=lambda a: a["impact_score"], reverse=True)
    top_actions = actions[:3]
    main_task = top_actions[0] if top_actions else None
    background_actions = actions[3:]

    return {
        "status": "ok",
        "problem": {
            "name": main_problem["label"],
            "strength_pct": main_problem["problem_strength_pct"],
            "since": main_problem.get("since"),
            "priority": main_problem.get("priority"),
        },
        "cause": {
            "name": cause_analysis.get("likely_cause"),
            "reason": cause_analysis.get("reason"),
            "confidence_pct": cause_analysis.get("confidence_pct"),
        },
        "main_problem": main_problem,
        "top_actions": top_actions,
        "main_task": main_task,
        "background_actions": background_actions,
    }


def _severity_for(metric: str, delta_ratio: float) -> str:
    cfg = METRIC_CONFIG[metric]
    magnitude = abs(delta_ratio)
    if magnitude >= cfg["critical_threshold"]:
        return "critical"
    if magnitude >= cfg["high_threshold"]:
        return "high"
    if magnitude >= cfg["high_threshold"] * 0.6:
        return "medium"
    return "low"


def _confidence(rows_count: int, baseline: float, current: float) -> int:
    if rows_count <= 3:
        return 55
    if baseline <= 0 and current <= 0:
        return 40
    if rows_count >= 21:
        return 88
    if rows_count >= 14:
        return 80
    return 68


def _data_quality(rows_count: int, metric_values: list[float]) -> int:
    if rows_count <= 1:
        return 25
    non_zero = len([v for v in metric_values if v != 0])
    coverage = non_zero / max(len(metric_values), 1)
    return max(35, min(100, int(coverage * 100)))


def _event_summary(metric_label: str, direction: str, delta_pct: float, window: str, current: float, baseline: float) -> str:
    direction_text = "steigt" if direction == "up" else "fällt"
    return (
        f"{metric_label} {direction_text} um {abs(delta_pct):.1f}% "
        f"gegenüber {window} ({current:.1f} vs. {baseline:.1f})."
    )


def _build_event(metric: str, rows: list[DailyMetrics], current_row: DailyMetrics, baseline_rows: list[DailyMetrics]) -> Optional[DecisionEvent]:
    metric_values = [_safe_float(getattr(r, metric, 0.0)) for r in rows]
    baseline_values = [_safe_float(getattr(r, metric, 0.0)) for r in baseline_rows]
    if not baseline_values:
        return None

    current_value = _safe_float(getattr(current_row, metric, 0.0))
    baseline_value = _avg(baseline_values)
    if baseline_value == 0:
        return None

    delta_ratio = (current_value - baseline_value) / baseline_value
    delta_pct = delta_ratio * 100
    severity = _severity_for(metric, delta_ratio)
    event_type = "anomaly" if severity in {"critical", "high"} else "trend"
    direction = "up" if delta_ratio >= 0 else "down"

    recent_avg = _avg([_safe_float(getattr(r, metric, 0.0)) for r in rows[-7:]]) if len(rows) >= 7 else current_value
    previous_avg = _avg([_safe_float(getattr(r, metric, 0.0)) for r in rows[-14:-7]]) if len(rows) >= 14 else baseline_value
    momentum_ratio = ((recent_avg - previous_avg) / previous_avg) if previous_avg else 0.0
    early_warning = abs(momentum_ratio) >= 0.08 and severity != "critical"
    forecast_window_days = 14 if early_warning else 0

    cfg = METRIC_CONFIG[metric]
    return DecisionEvent(
        id=f"{metric}:{current_row.date.isoformat()}",
        metric=metric,
        metric_label=cfg["label"],
        category=cfg["category"],
        event_type=event_type,
        severity=severity,
        direction=direction,
        current_value=current_value,
        baseline_value=baseline_value,
        delta_pct=delta_pct,
        confidence=_confidence(len(rows), baseline_value, current_value),
        data_quality=_data_quality(len(rows), metric_values),
        window="7 Tage Baseline",
        summary=_event_summary(cfg["label"], direction, delta_pct, "der 7-Tage-Baseline", current_value, baseline_value),
        early_warning=early_warning,
        forecast_window_days=forecast_window_days,
        evidence={
            "current_date": current_row.date.isoformat(),
            "baseline_days": len(baseline_rows),
            "momentum_pct": round(momentum_ratio * 100, 1),
            "recent_average": round(recent_avg, 2),
            "previous_average": round(previous_avg, 2),
        },
    )


def get_decision_events(db: Session, lookback_days: int = 30, workspace_id: int | None = None) -> list[DecisionEvent]:
    if workspace_id is None:
        workspace_id = get_current_workspace_id()
    if workspace_id is None:
        raise TenantContextError("get_decision_events called without workspace context.")
    since = date.today() - timedelta(days=lookback_days)
    rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= since,
        )
        .order_by(DailyMetrics.date.asc())
        .all()
    )
    if len(rows) < 8:
        return []

    current_row = rows[-1]
    baseline_rows = rows[-8:-1]

    events = []
    for metric in METRIC_CONFIG:
        event = _build_event(metric, rows, current_row, baseline_rows)
        if not event:
            continue
        if abs(event.delta_pct) < 4 and not event.early_warning:
            continue
        events.append(event)

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    events.sort(key=lambda item: (severity_order.get(item.severity, 9), -abs(item.delta_pct)))
    return events


def get_event_by_id(db: Session, event_id: str) -> Optional[DecisionEvent]:
    return next((event for event in get_decision_events(db) if event.id == event_id), None)


def _context_signal(context: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not context:
        return {}
    traffic_sources = context.get("traffic_sources") or {}
    top_channel = None
    top_channel_share = None
    if traffic_sources:
        top_channel, top_channel_share = max(traffic_sources.items(), key=lambda item: item[1])
    social = context.get("social") or {}
    instagram = social.get("instagram") or {}
    tiktok = social.get("tiktok") or {}
    crm = context.get("crm") or {}
    stripe = context.get("stripe") or {}
    external_signals = context.get("external_signals") or []

    return {
        "top_channel": top_channel,
        "top_channel_share": top_channel_share,
        "bounce_rate_pct": context.get("bounce_rate_pct"),
        "avg_session_duration_sec": context.get("avg_session_duration_sec"),
        "social_engagement_pct": instagram.get("avg_engagement_rate_pct"),
        "social_follower_growth_30d": instagram.get("follower_growth_30d"),
        "tiktok_completion_rate_pct": tiktok.get("avg_completion_rate_pct"),
        "crm_deal_close_rate": crm.get("deal_close_rate"),
        "crm_total_deal_value": crm.get("total_deal_value"),
        "crm_total_contacts": crm.get("total_contacts"),
        "stripe_refund_rate_pct": stripe.get("refund_rate_pct"),
        "stripe_failed_payments_30d": stripe.get("failed_payments_30d"),
        "external_signals": external_signals,
    }


def analyze_causes(
    event: DecisionEvent,
    all_events: list[DecisionEvent],
    context: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    def _cause_meta(code: str) -> dict[str, Any]:
        return CAUSE_METADATA.get(code, {"factor_type": "internal", "factor_label": "Operativ", "color": "#475569"})

    def _impact_band(probability_pct: float, delta_pct: float) -> tuple[float, str]:
        score = round(abs(delta_pct) * (probability_pct / 100.0), 2)
        if score >= 12:
            level = "hoch"
        elif score >= 6:
            level = "mittel"
        else:
            level = "niedrig"
        return score, level

    traffic_event = next((item for item in all_events if item.metric == "traffic"), None)
    conversion_event = next((item for item in all_events if item.metric == "conversion_rate"), None)
    new_customer_event = next((item for item in all_events if item.metric == "new_customers"), None)

    candidates: list[dict[str, Any]] = []
    signals = _context_signal(context)
    external_signals = signals.get("external_signals") or []
    top_external = next((item for item in external_signals if item.get("confidence", 0) >= 60), None)
    top_channel = signals.get("top_channel")
    top_channel_share = signals.get("top_channel_share")

    if event.metric == "revenue":
        if traffic_event and traffic_event.direction == event.direction:
            candidates.append({
                "cause": "marketing_acquisition",
                "label": "Marketing / Acquisition",
                "probability": 0.34,
                "evidence": "Traffic bewegt sich in dieselbe Richtung wie Umsatz.",
                "data_gaps": [],
            })
        if conversion_event and conversion_event.direction == event.direction:
            candidates.append({
                "cause": "funnel_conversion",
                "label": "Funnel / Checkout",
                "probability": 0.31,
                "evidence": "Conversion Rate verstärkt den Umsatztrend.",
                "data_gaps": [],
            })
        candidates.append({
            "cause": "pricing_or_offer",
            "label": "Pricing / Offer",
            "probability": 0.2,
            "evidence": "Umsatzänderung ohne vollständige Preis- und Kampagnendaten.",
            "data_gaps": ["Preisänderungen", "Rabatt-Historie"],
        })
        if top_channel and top_channel_share and event.direction == "down":
            candidates.append({
                "cause": "channel_mix",
                "label": "Kanal-Mix / Attribution",
                "probability": 0.26,
                "evidence": f"Top-Kanal {top_channel} ({top_channel_share:.0f}%) dominiert den Umsatztrend.",
                "data_gaps": ["Channel Cost", "Attribution Model"],
            })
        if signals.get("stripe_refund_rate_pct") and signals["stripe_refund_rate_pct"] > 2.5:
            candidates.append({
                "cause": "refunds_payments",
                "label": "Refunds / Zahlungsprobleme",
                "probability": 0.18,
                "evidence": f"Refund-Rate liegt bei {signals['stripe_refund_rate_pct']:.1f}%.",
                "data_gaps": ["Zahlungsanbieter-Logs"],
            })
    elif event.metric in {"traffic", "new_customers"}:
        candidates.append({
            "cause": "campaign_performance",
            "label": "Kampagnen-Performance",
            "probability": 0.38,
            "evidence": "Akquisitionsmetriken reagieren typischerweise zuerst auf Kampagnen.",
            "data_gaps": ["Ads-Spend", "Creative Performance"],
        })
        candidates.append({
            "cause": "seasonality",
            "label": "Saisonalität / Timing",
            "probability": 0.24,
            "evidence": "Zeitreihenmuster deuten auf kurzfristige Schwankung hin.",
            "data_gaps": ["Vorjahreswerte"],
        })
        if top_channel and top_channel_share:
            candidates.append({
                "cause": "channel_mix",
                "label": "Kanal-Mix / Traffic-Quelle",
                "probability": 0.2,
                "evidence": f"Top-Kanal {top_channel} ({top_channel_share:.0f}%) prägt Traffic & Neukunden.",
                "data_gaps": ["Channel Spend", "Attribution"],
            })
        if signals.get("social_engagement_pct") is not None and signals.get("social_engagement_pct", 0) < 1.5:
            candidates.append({
                "cause": "social_decline",
                "label": "Social Engagement",
                "probability": 0.16,
                "evidence": f"Social Engagement niedrig ({signals['social_engagement_pct']:.2f}%).",
                "data_gaps": ["Content Performance", "Posting Cadence"],
            })
    elif event.metric == "conversion_rate":
        candidates.append({
            "cause": "checkout_or_ux",
            "label": "Checkout / UX",
            "probability": 0.42,
            "evidence": "Conversion reagiert meist auf Funnel-Reibung oder Angebotsklarheit.",
            "data_gaps": ["Checkout Error Logs", "Session Recordings"],
        })
        candidates.append({
            "cause": "traffic_quality",
            "label": "Traffic-Qualität",
            "probability": 0.26,
            "evidence": "Wenn Traffic stabil bleibt, ist Qualitätsmix ein plausibler Treiber.",
            "data_gaps": ["Channel Mix", "Source/Medium"],
        })
        if signals.get("bounce_rate_pct") and signals["bounce_rate_pct"] > 55:
            candidates.append({
                "cause": "landing_page_quality",
                "label": "Landingpages / Relevanz",
                "probability": 0.22,
                "evidence": f"Bounce-Rate liegt bei {signals['bounce_rate_pct']:.1f}%.",
                "data_gaps": ["Top Landingpages", "Session Recordings"],
            })
        if signals.get("avg_session_duration_sec") and signals["avg_session_duration_sec"] < 40:
            candidates.append({
                "cause": "low_intent_traffic",
                "label": "Low-Intent Traffic",
                "probability": 0.18,
                "evidence": f"Ø Sessiondauer nur {signals['avg_session_duration_sec']:.0f}s.",
                "data_gaps": ["Channel Intent", "Keyword Quality"],
            })
    else:
        candidates.append({
            "cause": "operational_shift",
            "label": "Operative Veränderung",
            "probability": 0.28,
            "evidence": "Interne Prozessänderungen sind ein häufiger Treiber.",
            "data_gaps": ["Release Log", "Support Tickets"],
        })
        if signals.get("crm_deal_close_rate") is not None and signals.get("crm_deal_close_rate", 0) < 0.15:
            candidates.append({
                "cause": "crm_pipeline",
                "label": "CRM Pipeline",
                "probability": 0.18,
                "evidence": f"Deal Close Rate nur {signals['crm_deal_close_rate']:.1%}.",
                "data_gaps": ["Pipeline Stage Velocity"],
            })

    if new_customer_event and event.metric != "new_customers" and new_customer_event.direction == event.direction:
        candidates.append({
            "cause": "customer_acquisition",
            "label": "Neukundengewinnung",
            "probability": 0.18,
            "evidence": "Neue Kunden bewegen sich parallel zum Haupteffekt.",
            "data_gaps": [],
        })

    if top_external:
        candidates.append({
            "cause": "external_market",
            "label": "Externer Markt / Wettbewerb",
            "probability": 0.22,
            "evidence": f"Externes Signal: {top_external.get('title', 'Marktdruck')} ({top_external.get('source', 'extern')}).",
            "data_gaps": ["Wettbewerberpreise", "Branchennews", "Makrodaten"],
        })
    else:
        candidates.append({
            "cause": "external_market",
            "label": "Externer Markt / Wettbewerb",
            "probability": 0.14,
            "evidence": "Externe Daten sind noch nicht vollständig integriert, bleiben aber relevant.",
            "data_gaps": ["Wettbewerberpreise", "Branchennews", "Makrodaten"],
        })

    total = sum(item["probability"] for item in candidates) or 1.0
    normalized = []
    for item in candidates:
        normalized.append({
            **item,
            "probability": round((item["probability"] / total) * 100, 1),
        })

    # Impact-Scoring und Metadaten für CEO-taugliche Darstellung
    enriched = []
    for item in normalized:
        score, level = _impact_band(item["probability"], event.delta_pct)
        meta = _cause_meta(item["cause"])
        enriched.append(
            {
                **item,
                "impact_score": score,
                "impact_level": level,
                "factor_type": meta["factor_type"],
                "factor_label": meta["factor_label"],
                "color": meta["color"],
                "direction": "negativ" if event.direction == "down" else "positiv",
                "metric": event.metric,
            }
        )

    normalized.sort(key=lambda item: item["probability"], reverse=True)
    enriched.sort(key=lambda item: item["probability"], reverse=True)
    return enriched[:4]


def build_cause_overview(
    events: list["DecisionEvent"],
    context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if not events:
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "items": [],
            "counts": {"critical": 0, "high": 0, "medium": 0, "low": 0},
        }

    cause_items = []
    heatmap: list[dict[str, Any]] = []
    for event in events:
        causes = analyze_causes(event, events, context)
        top_labels = " und ".join([c["label"] for c in causes[:2]]) if causes else "unbekannt"
        summary = (
            f"{event.metric_label} ist um {abs(event.delta_pct):.1f}% "
            f"{'gestiegen' if event.direction == 'up' else 'gefallen'}, hauptsächlich wegen {top_labels}."
        )
        cause_tree = [
            {
                "name": cause["label"],
                "value": cause.get("impact_score"),
                "impact_level": cause.get("impact_level"),
                "factor_type": cause.get("factor_type"),
                "color": cause.get("color"),
            }
            for cause in causes
        ]
        heatmap.extend(
            [
                {
                    "metric": event.metric,
                    "metric_label": event.metric_label,
                    "cause": cause["label"],
                    "factor_type": cause.get("factor_type"),
                    "impact_level": cause.get("impact_level"),
                    "impact_score": cause.get("impact_score"),
                    "probability_pct": cause.get("probability"),
                }
                for cause in causes
            ]
        )
        cause_items.append(
            {
                "event_id": event.id,
                "metric": event.metric,
                "metric_label": event.metric_label,
                "direction": event.direction,
                "delta_pct": round(event.delta_pct, 1),
                "severity": event.severity,
                "confidence": event.confidence,
                "data_quality": event.data_quality,
                "summary": summary,
                "top_causes": causes,
                "cause_tree": {"name": event.metric_label, "children": cause_tree},
                "history": {
                    "current": round(event.current_value, 2),
                    "baseline": round(event.baseline_value, 2),
                    "window": event.window,
                },
            }
        )

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    cause_items.sort(key=lambda item: severity_order.get(item["severity"], 9))

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "items": cause_items,
        "counts": {
            "critical": len([item for item in cause_items if item["severity"] == "critical"]),
            "high": len([item for item in cause_items if item["severity"] == "high"]),
            "medium": len([item for item in cause_items if item["severity"] == "medium"]),
            "low": len([item for item in cause_items if item["severity"] == "low"]),
        },
        "heatmap": heatmap,
    }


def _metric_benchmark(metric: str) -> dict[str, Any]:
    """Conservative industry benchmarks used to contextualize effects."""
    defaults = {
        "revenue": {"industry_median_pct": 6.0, "top_quartile_pct": 12.0},
        "traffic": {"industry_median_pct": 8.0, "top_quartile_pct": 15.0},
        "conversion_rate": {"industry_median_pct": 4.5, "top_quartile_pct": 7.5},
        "new_customers": {"industry_median_pct": 5.0, "top_quartile_pct": 9.0},
        "cost": {"industry_median_pct": -4.0, "top_quartile_pct": -7.5},
        "profit": {"industry_median_pct": 4.0, "top_quartile_pct": 9.0},
        "gross_margin": {"industry_median_pct": 2.5, "top_quartile_pct": 5.5},
        "cashflow": {"industry_median_pct": 3.0, "top_quartile_pct": 6.0},
    }
    return defaults.get(metric, {"industry_median_pct": 5.0, "top_quartile_pct": 8.0})


def _customer_behavior_signal(metric: str, context: Optional[dict[str, Any]]) -> dict[str, Any]:
    ctx = context or {}
    marketing = ctx.get("social") or {}
    traffic_sources = ctx.get("traffic_sources") or {}
    bounce_rate = ctx.get("bounce_rate_pct")
    session_duration = ctx.get("avg_session_duration_sec")

    if metric == "traffic":
        top_channel = None
        top_share = None
        if traffic_sources:
            top_channel, top_share = max(traffic_sources.items(), key=lambda item: item[1])
        return {
            "signal": "channel_mix",
            "detail": f"Top-Kanal {top_channel} ({top_share:.0f}%)" if top_channel else "Kanal-Mix verteilt",
            "confidence_pct": 72 if top_channel else 55,
        }

    if metric == "conversion_rate":
        if bounce_rate and bounce_rate > 55:
            return {"signal": "high_bounce", "detail": f"Bounce-Rate {bounce_rate:.1f}%", "confidence_pct": 78}
        if session_duration and session_duration < 45:
            return {"signal": "low_intent", "detail": f"Ø Session {session_duration:.0f}s", "confidence_pct": 64}
        return {"signal": "steady", "detail": "Keine klaren UX-Signale", "confidence_pct": 48}

    if metric == "new_customers":
        ig = (marketing.get("instagram") or {}).get("avg_engagement_rate_pct")
        return {
            "signal": "engagement",
            "detail": f"IG Engagement {ig:.2f}%" if ig is not None else "Engagement neutral",
            "confidence_pct": 60 if ig else 45,
        }

    return {"signal": "neutral", "detail": "Keine spezifischen Verhaltenssignale", "confidence_pct": 40}


def _trend_signal(event: DecisionEvent) -> dict[str, Any]:
    momentum_pct = (event.evidence or {}).get("momentum_pct", 0.0)
    return {
        "momentum_pct": momentum_pct,
        "direction": "beschleunigt" if momentum_pct > 0 else "abkühlend" if momentum_pct < 0 else "stabil",
    }


def _projected_effect(event: DecisionEvent, impact_pct: float) -> dict[str, Any]:
    projected = event.current_value * (1 + (impact_pct / 100.0))
    return {
        "metric": event.metric,
        "baseline": round(event.baseline_value, 2),
        "current": round(event.current_value, 2),
        "uplift_pct": round(impact_pct, 1),
        "projected_value": round(projected, 2),
        "confidence_pct": min(95.0, round(event.confidence * 0.65 + 25, 1)),
        "time_to_impact_days": 7 if impact_pct >= 15 else 14,
    }


def _safe_number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _priority_letter(priority: str) -> str:
    return {"high": "A", "medium": "B", "low": "C"}.get(priority, "B")


def _pretty_role(role: Optional[str]) -> str:
    mapping = {
        "owner": "Geschaeftsfuehrung",
        "admin": "Geschaeftsfuehrung",
        "manager": "Management",
        "marketing": "Marketing-Leitung",
        "sales": "Vertriebsleitung",
        "operations": "Operative Leitung",
        "finance": "Finanzleitung",
    }
    return mapping.get(str(role or "").lower(), "Management")


def _industry_copy(industry: Optional[str]) -> str:
    key = str(industry or "ecommerce").lower()
    mapping = {
        "ecommerce": "im Onlinehandel",
        "retail": "im Handel",
        "saas": "im SaaS-Vertrieb",
        "service": "im Dienstleistungsgeschaeft",
        "hospitality": "im Gastgewerbe",
    }
    return mapping.get(key, f"in der Branche {industry}")


def _format_money(value: float) -> str:
    return f"EUR {value:,.0f}".replace(",", ".")


def _segment_blueprints(context: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    commerce = (context or {}).get("commerce") or {}
    top_customers = commerce.get("top_customers") or []
    has_high_value = len(top_customers) > 0
    return [
        {"recipient": "High-LTV Kunden (45-120 Tage inaktiv)" if has_high_value else "Bestandskunden mit hohem Warenkorbwert", "angle": "Reaktivierung", "cta": "Jetzt exklusives Angebot sichern"},
        {"recipient": "Warenkorbabbrecher der letzten 7 Tage", "angle": "Checkout-Rettung", "cta": "Bestellung jetzt abschliessen"},
        {"recipient": "Premium-Leads mit hoher Kaufwahrscheinlichkeit", "angle": "Lead-Konvertierung", "cta": "Beratung oder Angebot anfordern"},
        {"recipient": "Erstkauf-Kunden aus den letzten 30 Tagen", "angle": "Zweitkauf-Beschleunigung", "cta": "Passendes Folgeprodukt ansehen"},
        {"recipient": "Kunden mit ueberdurchschnittlichem AOV", "angle": "Upsell auf hoeheren Warenkorb", "cta": "Premium-Bundle ansehen"},
        {"recipient": "Deals oder Anfragen ohne Abschluss in 14 Tagen", "angle": "Abschluss beschleunigen", "cta": "Vorteil jetzt aktivieren"},
        {"recipient": "VIP-Kunden und Wiederkaeufer", "angle": "Exklusiver Vorabzugang", "cta": "Vorabzugang nutzen"},
        {"recipient": "Besuchersegment mit hoher Reichweite und niedriger Conversion", "angle": "Conversion-Upgrade", "cta": "Angebot mit klarem Vorteil ansehen"},
        {"recipient": "Preis-sensitive Leads mit wiederholten Besuchen", "angle": "Wertargument statt Rabattstreuung", "cta": "Angebot mit Nutzen pruefen"},
        {"recipient": "Newsletter-Abonnenten ohne Klick in 60 Tagen", "angle": "Interesse zurueckholen", "cta": "Relevante Auswahl ansehen"},
    ]


def _email_target_kpi(event: DecisionEvent, priority: str, idx: int) -> str:
    impact = min(18, max(6, int(abs(event.delta_pct) * 0.8) + (2 if priority == "high" else 0) - idx))
    mapping = {
        "revenue": "Umsatz",
        "conversion_rate": "Conversion",
        "traffic": "Leads",
        "new_customers": "Neukunden",
        "profit": "Deckungsbeitrag",
    }
    return f"{mapping.get(event.metric, event.metric_label)} +{max(4, impact)}%"


def _email_effect_estimate(event: DecisionEvent, context: Optional[dict[str, Any]], idx: int) -> dict[str, Any]:
    commerce = (context or {}).get("commerce") or {}
    aov = max(45.0, _safe_number(commerce.get("avg_order_value"), 95.0))
    total_revenue = max(2000.0, _safe_number(commerce.get("total_revenue_30d"), event.current_value * 30))
    revenue_gain = max(600.0, total_revenue * (0.018 + idx * 0.003))
    leads_gain = max(8, int(revenue_gain / max(40.0, aov * 0.6)))
    return {
        "revenue_label": f"+{_format_money(revenue_gain)} Umsatz in 14 Tagen",
        "lead_label": f"+{leads_gain}% mehr qualifizierte Reaktionen",
    }


def _compose_email_copy(
    event: DecisionEvent,
    segment: dict[str, Any],
    context: Optional[dict[str, Any]],
    target_kpi: str,
    effect: dict[str, Any],
) -> dict[str, Any]:
    company = (context or {}).get("company_name") or "dein Unternehmen"
    role = _pretty_role((context or {}).get("company_role"))
    industry = _industry_copy((context or {}).get("industry"))
    perf = (context or {}).get("email_performance") or {}
    open_rate = _safe_number(perf.get("avg_open_rate"), 22.0)
    click_rate = _safe_number(perf.get("avg_click_rate"), 2.4)
    intro = (
        f"Die Auswertung der letzten 30 Tage zeigt bei {event.metric_label.lower()} Handlungsbedarf. "
        f"Fuer {segment['recipient']} ist jetzt der direkteste Umsatzhebel verfuegbar."
    )
    message = (
        f"Wir sprechen diese Zielgruppe mit einem klaren Anlass an: {segment['angle'].lower()}. "
        f"Die Botschaft ist auf eine schnelle Reaktion und messbare Conversion ausgelegt."
    )
    value = (
        f"Wenn die E-Mail mindestens die aktuelle Basis von {open_rate:.1f}% Oeffnungsrate und {click_rate:.1f}% Klickrate erreicht, "
        f"ist kurzfristig {effect['revenue_label']} realistisch."
    )
    return {
        "subject_line": f"{segment['angle']}: konkreter Vorteil fuer {segment['recipient'].split('(')[0].strip()}"[:120],
        "preheader": f"Fuer {role} bei {company}: Fokus auf {target_kpi}, basierend auf den letzten 30 Tagen {industry}."[:160],
        "email_text": f"Einleitung: {intro}\nHauptbotschaft: {message}\nNutzenversprechen: {value}\nCTA: {segment['cta']}",
        "why_this_email": f"Diese E-Mail zahlt direkt auf {target_kpi} ein und adressiert das Segment mit dem schnellsten Umsatzhebel fuer die naechsten 14 Tage.",
        "next_best_step": "Reminder nach 48 Stunden mit FAQ- oder Vertrauensbaustein; danach Deal-Trigger fuer Nicht-Klicker.",
    }


def _build_email_suggestions(
    event: DecisionEvent,
    context: Optional[dict[str, Any]],
    priority: str,
) -> list[dict[str, Any]]:
    suggestions = []
    for idx, segment in enumerate(_segment_blueprints(context)):
        bucket = "A" if idx < 3 and priority == "high" else "B" if idx < 7 else "C"
        target_kpi = _email_target_kpi(event, priority, idx)
        effect = _email_effect_estimate(event, context, idx)
        copy = _compose_email_copy(event, segment, context, target_kpi, effect)
        suggestions.append({
            "title": f"{segment['angle']} fuer {segment['recipient']}",
            "priority": bucket,
            "recipient": segment["recipient"],
            "target_kpi": target_kpi,
            "estimated_effect": effect["revenue_label"] if bucket in {"A", "B"} else effect["lead_label"],
            **copy,
        })
    return suggestions


def _step_blueprints(metric: str, action_type: str, systems: list[str], is_primary: bool) -> list[dict[str, Any]]:
    steps = [
        {
            "title": "Diagnose vertiefen",
            "owner_role": "data" if metric != "traffic" else "marketing",
            "description": "Top-Treiber mit historischen Daten + Benchmarks verifizieren; Segment-Drilldown sichern.",
            "duration_hours": 0.5,
            "systems": [s for s in systems if s.startswith("intlyst")][:1] or ["intlyst_tasks"],
        },
        {
            "title": "Maßnahme entwerfen",
            "owner_role": "marketing" if action_type in {"strategy_bundle", "email_draft"} else "operations",
            "description": "Konkreten Hebel formulieren, Ziel-KPI setzen, Guardrails ergänzen.",
            "duration_hours": 0.75,
            "systems": systems[:2] if systems else ["slack"],
        },
        {
            "title": "Launch & Tracking",
            "owner_role": "operations",
            "description": "1-Klick auslösen oder Task starten; Live-KPIs anbinden und Review-Termin setzen.",
            "duration_hours": 0.5,
            "systems": systems,
        },
    ]
    if is_primary:
        steps.insert(0, {
            "title": "Freigabe sichern",
            "owner_role": "management",
            "description": "Auto-Execution prüfen, Budget/Limits bestätigen, Risiko-Score dokumentieren.",
            "duration_hours": 0.25,
            "systems": ["slack", "notion"] if "notion" in systems else ["slack"],
        })
    return steps


def build_recommendations(
    events: list[DecisionEvent],
    context: Optional[dict[str, Any]] = None,
) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    ranked_events = sorted(events[:5], key=lambda event: abs(event.delta_pct) * event.confidence, reverse=True)

    for idx, event in enumerate(ranked_events):
        top_causes = analyze_causes(event, events, context)
        lead_cause = top_causes[0]["label"] if top_causes else "Operatives Team"
        priority = "high" if event.severity in {"critical", "high"} else "medium"
        impact = min(30, max(8, int(abs(event.delta_pct) * 0.9)))
        risk = 28 if event.direction == "down" else 18
        hours = 2.0 if event.metric in {"traffic", "conversion_rate"} else 3.5
        is_primary_one_click = idx == 0
        action_type = "strategy_bundle" if is_primary_one_click else "email_draft" if event.category in {"marketing", "growth"} else "report" if event.severity == "medium" else "task"
        execution_plan = {
            "systems": (
                ["intlyst_tasks", "intlyst_email_draft", "social_drafts", "intlyst_reports", "hubspot", "mailchimp", "slack", "notion", "trello", "webhook_feedback"]
                if is_primary_one_click
                else ["intlyst_email_draft", "mailchimp", "slack"] if action_type == "email_draft"
                else ["intlyst_reports", "notion", "slack"] if action_type == "report"
                else ["intlyst_tasks", "hubspot", "trello", "slack"]
            ),
            "rollout_steps": [
                "Vorbereitete Assets prüfen",
                "Freigeben und Strategie starten",
                "Wirkung tracken und Folgeaktion ableiten",
            ],
            "success_metrics": ["reach_uplift", "new_customers", "revenue_uplift"] if is_primary_one_click else ["execution_success"],
        }
        benchmark = _metric_benchmark(event.metric)
        customer_signal = _customer_behavior_signal(event.metric, context)
        trend_signal = _trend_signal(event)
        projected_effect = _projected_effect(event, impact)
        steps = _step_blueprints(event.metric, action_type, execution_plan["systems"], is_primary_one_click)
        email_suggestions = _build_email_suggestions(event, context, priority)
        primary_email = email_suggestions[0]
        one_click_payload = {
            "title": f"{event.metric_label} jetzt verbessern",
            "description": f"Auto-Strategie für {event.metric_label.lower()} mit klaren KPI-Zielen.",
            "category": event.category,
            "priority": priority,
            "impact_score": min(100, impact * 2.8),
            "risk_score": risk,
            "estimated_hours": hours,
            "execution_type": action_type,
            "target_systems": execution_plan["systems"],
            "recommendation_id": f"rec:{event.id}",
            "template_name": action_type,
        }
        prepared_assets = {
            "email": {
                "title": primary_email["title"],
                "priority": primary_email["priority"],
                "recipient": primary_email["recipient"],
                "target_kpi": primary_email["target_kpi"],
                "estimated_effect": primary_email["estimated_effect"],
                "subject": primary_email["subject_line"],
                "preview": primary_email["preheader"],
                "preheader": primary_email["preheader"],
                "body": primary_email["email_text"],
                "why_this_email": primary_email["why_this_email"],
                "next_best_step": primary_email["next_best_step"],
                "persona_role": _pretty_role((context or {}).get("company_role")),
                "industry": (context or {}).get("industry") or "ecommerce",
            },
            "email_suggestions": email_suggestions,
            "social_posts": [
                {"channel": "linkedin", "preview": f"{event.metric_label} aktiv verbessern: jetzt Strategie umsetzen."},
                {"channel": "instagram", "preview": f"Fokus auf {event.metric_label.lower()} und schnelle Wirkung."},
            ],
            "team_tasks": [
                {"title": f"{event.metric_label} Sprint starten", "owner_role": "operations"},
                {"title": f"{event.metric_label} Content/Draft prüfen", "owner_role": "marketing"},
            ],
            "timeline": [
                {"phase": "0-2h", "goal": "Assets freigeben"},
                {"phase": "24h", "goal": "erste Wirkung messen"},
                {"phase": "7 Tage", "goal": "Outcome bewerten"},
            ],
        }

        # Finanz-KI Empfehlungen ergänzen
        finance_recs = []
        if event.metric == "revenue" and event.direction == "down":
            finance_recs.append({
                "title": "Preisanpassung prüfen",
                "description": "Analysiere, ob eine Preisanpassung sinnvoll ist, um Umsatzrückgänge abzufedern.",
                "effect": "Umsatzsteigerung",
                "effort": "mittel",
                "priority": "hoch",
                "risk": "mittel",
            })
            finance_recs.append({
                "title": "Kostenstruktur prüfen",
                "description": "Überprüfe die Kostenstruktur, um Einsparpotenziale zu identifizieren und die Marge zu schützen.",
                "effect": "Kostenreduktion, Margensicherung",
                "effort": "mittel",
                "priority": "hoch",
                "risk": "niedrig",
            })
        if event.metric == "cost" and event.direction == "up":
            finance_recs.append({
                "title": "Kosten senken",
                "description": "Identifiziere Einsparpotenziale bei variablen und fixen Kosten.",
                "effect": "Kostenreduktion",
                "effort": "mittel",
                "priority": "hoch",
                "risk": "niedrig",
            })
            finance_recs.append({
                "title": "Budget neu verteilen",
                "description": "Optimiere die Budgetverteilung, um Kostenanstiege abzufedern und Effizienz zu steigern.",
                "effect": "Effizienzsteigerung",
                "effort": "mittel",
                "priority": "mittel",
                "risk": "niedrig",
            })
        if event.metric == "profit" and event.direction == "down":
            finance_recs.append({
                "title": "Margenoptimierung",
                "description": "Analysiere Produkt- und Kostenstruktur, um die Bruttomarge zu verbessern.",
                "effect": "Margensteigerung",
                "effort": "mittel",
                "priority": "hoch",
                "risk": "mittel",
            })
            finance_recs.append({
                "title": "Preisanpassung prüfen",
                "description": "Prüfe, ob eine Preisanpassung zur Gewinnsteigerung beitragen kann.",
                "effect": "Gewinnsteigerung",
                "effort": "mittel",
                "priority": "mittel",
                "risk": "mittel",
            })
        if event.metric == "gross_margin" and event.direction == "down":
            finance_recs.append({
                "title": "Kostenstruktur optimieren",
                "description": "Reduziere Einkaufspreise oder Produktionskosten, um die Bruttomarge zu verbessern.",
                "effect": "Bruttomargensteigerung",
                "effort": "mittel",
                "priority": "hoch",
                "risk": "niedrig",
            })
            finance_recs.append({
                "title": "Preisanpassung prüfen",
                "description": "Prüfe, ob eine Preisanpassung zur Margenverbesserung beitragen kann.",
                "effect": "Bruttomargensteigerung",
                "effort": "mittel",
                "priority": "mittel",
                "risk": "mittel",
            })
        if event.metric == "cashflow" and event.direction == "down":
            finance_recs.append({
                "title": "Liquiditätsmanagement verbessern",
                "description": "Optimiere Zahlungsziele, Forderungsmanagement und Ausgabenplanung, um den Cashflow zu stabilisieren.",
                "effect": "Cashflow-Verbesserung",
                "effort": "mittel",
                "priority": "hoch",
                "risk": "mittel",
            })
        if event.metric == "liquidity" and event.direction == "down":
            finance_recs.append({
                "title": "Finanzierungsmöglichkeiten prüfen",
                "description": "Prüfe Kreditlinien, Factoring oder Investoren zur Überbrückung von Liquiditätsengpässen.",
                "effect": "Liquiditätssicherung",
                "effort": "hoch",
                "priority": "hoch",
                "risk": "hoch",
            })

        recommendations.append({
            "id": f"rec:{event.id}",
            "event_id": event.id,
            "metric": event.metric,
            "direction": event.direction,
            "title": f"{event.metric_label} {'stabilisieren' if event.direction == 'down' else 'skalieren'}",
            "description": f"Reagiere auf {event.metric_label.lower()} mit Fokus auf {lead_cause.lower()}.",
            "category": event.category,
            "priority": priority,
            "priority_class": _priority_letter(priority),
            "expected_impact_pct": impact,
            "impact_score": min(100, impact * 2.8),
            "risk_score": risk,
            "estimated_hours": hours,
            "roi_label": "hoch" if impact >= 15 else "mittel",
            "owner_role": "marketing" if event.category in {"marketing", "growth"} else "operations",
            "action_type": action_type,
            "is_primary_one_click": is_primary_one_click,
            "expected_new_customers": max(1, int(impact / 6)),
            "expected_reach_uplift_pct": round(impact * 0.5, 1),
            "expected_revenue_uplift_pct": round(impact * 0.35, 1),
            "rationale": event.summary,
            "causes": top_causes,
            "prepared_assets": prepared_assets,
            "execution_plan": execution_plan,
            "finance_recommendations": finance_recs,
            "company_fit": {
                "historical_trend_pct": round(event.delta_pct, 1),
                "industry_benchmark_gap_pct": round(impact - benchmark.get("industry_median_pct", 0.0), 1),
                "customer_behavior": customer_signal,
                "trend": trend_signal,
            },
            "expected_effect_detail": projected_effect,
            "steps": steps,
            "one_click": {
                "enabled": True,
                "is_primary": is_primary_one_click,
                "execution_type": action_type,
                "target_systems": execution_plan["systems"],
                "action_request": one_click_payload,
            },
            "editable_fields": ["title", "priority", "impact_score", "risk_score", "steps", "target_systems", "description"],
        })

    return recommendations


def build_ceo_briefing(db: Session) -> dict[str, Any]:
    events = get_decision_events(db)
    recommendations = build_recommendations(events)
    external_signals = get_external_signals("ecommerce")
    today = datetime.utcnow().isoformat()
    critical_count = len([event for event in events if event.severity == "critical"])
    summary = (
        f"{critical_count} kritische Signale" if critical_count
        else f"{len(events)} relevante Signale erkannt"
    )
    # Top Finanz-KPIs und Empfehlungen extrahieren
    finance_metrics = ["cost", "profit", "gross_margin", "cashflow", "liquidity"]
    finance_events = [e for e in events if e.metric in finance_metrics]
    finance_recommendations = []
    for rec in recommendations:
        if rec.get("finance_recommendations"):
            finance_recommendations.append({
                "event_id": rec["event_id"],
                "metric": next((e.metric for e in finance_events if e.id == rec["event_id"]), None),
                "metric_label": next((e.metric_label for e in finance_events if e.id == rec["event_id"]), None),
                "recommendations": rec["finance_recommendations"],
            })

    return {
        "generated_at": today,
        "summary": summary,
        "counts": {
            "events": len(events),
            "critical": critical_count,
            "early_warnings": len([event for event in events if event.early_warning]),
            "recommendations": len(recommendations),
            "external_signals": len(external_signals),
        },
        "events": [event.to_dict() for event in events],
        "recommendations": recommendations,
        "external_signals": external_signals,
        "finance_dashboard": {
            "top_finance_kpis": [e.to_dict() for e in finance_events],
            "top_finance_recommendations": finance_recommendations,
        },
    }
