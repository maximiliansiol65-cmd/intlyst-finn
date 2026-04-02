"""
forecast_service.py
Persists forecast results plus KPI diagnosis for forecast learning, root-cause review,
hidden-problem detection, and CEO-ready follow-up actions.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any, cast

from sqlalchemy.orm import Session

from models.daily_metrics import DailyMetrics
from models.decision_problem import DecisionProblem
from models.forecast_record import ForecastRecord
from services.analysis_service import build_metric_snapshot
from services.insight_service import create_insight

logger = logging.getLogger(__name__)

_METRIC_ROLE = {
    "revenue": ("ceo", "ceo"),
    "traffic": ("cmo", "cmo"),
    "conversions": ("coo", "coo"),
    "conversion_rate": ("coo", "coo"),
    "new_customers": ("cmo", "strategist"),
}

_METRIC_LABEL = {
    "revenue": "Umsatz",
    "traffic": "Traffic",
    "conversions": "Conversions",
    "conversion_rate": "Conversion Rate",
    "new_customers": "Neue Kunden",
}


def _to_float(value: Any) -> float:
    try:
        return float(value or 0.0)
    except Exception:
        return 0.0


def _period_delta(values: list[float], days: int) -> float:
    if len(values) < days * 2 or days <= 0:
        return 0.0
    recent = values[-days:]
    previous = values[-days * 2 : -days]
    prev_avg = sum(previous) / len(previous) if previous else 0.0
    recent_avg = sum(recent) / len(recent) if recent else 0.0
    return ((recent_avg - prev_avg) / prev_avg * 100) if prev_avg else 0.0


def _normalize_priority(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def _load_metric_rows(db: Session, days: int = 120) -> list[DailyMetrics]:
    since = date.today() - timedelta(days=days)
    return (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )


def _metric_series(rows: list[DailyMetrics], kpi_name: str) -> list[float]:
    getter = {
        "revenue": lambda row: _to_float(row.revenue),
        "traffic": lambda row: _to_float(row.traffic),
        "conversions": lambda row: _to_float(row.conversions),
        "conversion_rate": lambda row: _to_float(row.conversion_rate) * 100,
        "new_customers": lambda row: _to_float(row.new_customers),
    }.get(kpi_name, lambda _row: 0.0)
    return [getter(row) for row in rows]


def _benchmark_note(kpi_name: str, snapshot: dict) -> str:
    revenue = snapshot.get("revenue", {})
    traffic = snapshot.get("traffic", {})
    conversion = snapshot.get("conversion_rate", {})
    if kpi_name == "revenue":
        return (
            f"Interner Vergleich: Umsatztrend {float(revenue.get('trend_pct', 0) or 0):+.1f}% "
            f"bei Conversion-Trend {float(conversion.get('trend_pct', 0) or 0):+.1f}%."
        )
    if kpi_name == "traffic":
        return (
            f"Interner Vergleich: Traffic-Trend {float(traffic.get('trend_pct', 0) or 0):+.1f}% "
            f"gegen Umsatztrend {float(revenue.get('trend_pct', 0) or 0):+.1f}%."
        )
    if kpi_name == "conversion_rate":
        return (
            f"Interner Vergleich: Conversion {float(conversion.get('avg', 0) or 0):.2f}% "
            f"bei Umsatz pro Visit EUR {float(snapshot.get('revenue_per_visit', {}).get('avg', 0) or 0):.4f}."
        )
    if kpi_name == "new_customers":
        return (
            f"Interner Vergleich: Neue Kunden Trend {float(snapshot.get('new_customers', {}).get('trend_pct', 0) or 0):+.1f}% "
            f"bei Capture Rate {float(snapshot.get('customer_capture_rate', {}).get('avg', 0) or 0):.1f}%."
        )
    return "Interner Benchmark basiert auf Verlauf, Zielbild und Forecast-Abweichung."


def _hidden_problems(snapshot: dict) -> list[dict[str, Any]]:
    revenue_trend = _to_float(snapshot.get("revenue", {}).get("trend_pct"))
    traffic_trend = _to_float(snapshot.get("traffic", {}).get("trend_pct"))
    conversion_trend = _to_float(snapshot.get("conversion_rate", {}).get("trend_pct"))
    new_customers_trend = _to_float(snapshot.get("new_customers", {}).get("trend_pct"))
    capture_rate = _to_float(snapshot.get("customer_capture_rate", {}).get("trend_pct"))
    revenue_per_visit_trend = _to_float(snapshot.get("revenue_per_visit", {}).get("trend_pct"))

    items: list[dict[str, Any]] = []

    if traffic_trend > 3 and revenue_trend < -3:
        items.append(
            {
                "title": "Traffic steigt, Umsatz faellt",
                "description": "Mehr Nachfrage kommt herein, aber sie wird nicht in Umsatz uebersetzt.",
                "causes": [
                    "Traffic-Qualitaet sinkt trotz hoeherem Volumen",
                    "Conversion oder Warenkorbwert kompensieren den Traffic-Anstieg nicht",
                ],
                "actions": [
                    "Top-Kanaele nach Umsatz pro Visit statt nur nach Reichweite priorisieren",
                    "Landingpage- und Checkout-Reibung in den volumenstarken Quellen zuerst pruefen",
                ],
                "priority": "high",
                "role": "cmo",
            }
        )

    if conversion_trend < -3 and traffic_trend > 0:
        items.append(
            {
                "title": "Engagement ohne Abschluss",
                "description": "Vorstufen im Funnel entwickeln sich besser als die eigentliche Abschlusswahrscheinlichkeit.",
                "causes": [
                    "Mehr Interesse oben im Funnel, aber schwache Passung im Checkout oder Angebot",
                    "Botschaft und Zielgruppe laufen auseinander",
                ],
                "actions": [
                    "Drop-off-Schritte im Funnel mit hohem Volumen priorisieren",
                    "Lead-Quelle und Conversion je Kanal gegenueberstellen",
                ],
                "priority": "high",
                "role": "coo",
            }
        )

    if new_customers_trend > 0 and capture_rate < -3:
        items.append(
            {
                "title": "Leads steigen, Qualitaet sinkt",
                "description": "Mehr Neukunden-Signale entstehen, aber pro Conversion wird weniger werthaltiger Output erzeugt.",
                "causes": [
                    "Lead-Qualitaet sinkt",
                    "Akquise zieht mehr Volumen als passende Nachfrage",
                ],
                "actions": [
                    "Lead-Scoring nach Abschlusswahrscheinlichkeit nachziehen",
                    "Kampagnen mit schwacher Qualitaet aktiv drosseln",
                ],
                "priority": "medium",
                "role": "cmo",
            }
        )

    if revenue_per_visit_trend < -3 and traffic_trend >= 0:
        items.append(
            {
                "title": "Effizienz sinkt im Hintergrund",
                "description": "Der Traffic wirkt stabil, aber jeder Besuch liefert weniger Ertrag als zuvor.",
                "causes": [
                    "Schwaecherer Conversion-Mix",
                    "Niedrigerer Warenkorb oder schlechtere Kanalqualitaet",
                ],
                "actions": [
                    "Umsatz pro Visit als Fruehwarn-KPI im Command Center priorisieren",
                    "Top-Segmente mit hoher Marge isoliert analysieren",
                ],
                "priority": "medium",
                "role": "strategist",
            }
        )

    return items


def _primary_cause_for_kpi(kpi_name: str, snapshot: dict) -> dict[str, Any]:
    revenue_trend = _to_float(snapshot.get("revenue", {}).get("trend_pct"))
    traffic_trend = _to_float(snapshot.get("traffic", {}).get("trend_pct"))
    conversion_trend = _to_float(snapshot.get("conversion_rate", {}).get("trend_pct"))
    customer_trend = _to_float(snapshot.get("new_customers", {}).get("trend_pct"))
    capture_rate = _to_float(snapshot.get("customer_capture_rate", {}).get("trend_pct"))
    weekday_spread = _to_float(snapshot.get("weekday_pattern", {}).get("spread_pct"))

    if kpi_name == "revenue":
        if conversion_trend <= traffic_trend:
            return {
                "main": "Conversion ist der Haupttreiber, weil sie direkt auf jeden vorhandenen Besuch wirkt.",
                "secondary": "Lead-Qualitaet oder Traffic-Mix tragen zusaetzlich bei.",
                "follow": "Engagement- oder Nachfrage-Signale sind eher Folge als Kernproblem.",
                "reason": f"Conversion-Trend {conversion_trend:+.1f}% bei Traffic-Trend {traffic_trend:+.1f}%.",
                "action_now": "Checkout- und Angebotshebel mit hohem Volumen zuerst stabilisieren.",
                "action_mid": "Kanaele nach Umsatz pro Visit neu gewichten.",
                "action_long": "Ein Forecast-basiertes Revenue-Operating-System etablieren.",
                "score": max(55.0, min(95.0, abs(conversion_trend) * 4 + abs(revenue_trend) * 2)),
                "role": "ceo",
            }
        return {
            "main": "Traffic-Qualitaet ist der Haupttreiber, weil weniger passende Nachfrage in den Funnel kommt.",
            "secondary": "Conversion verschlechtert die Wirkung zusaetzlich.",
            "follow": "Schwaechere Neukundenentwicklung ist in diesem Fall eher Folge.",
            "reason": f"Traffic-Trend {traffic_trend:+.1f}% bei Umsatztrend {revenue_trend:+.1f}%.",
            "action_now": "Schwache Quellen kurzfristig drosseln und starke Quellen priorisieren.",
            "action_mid": "Kanalmix gegen Abschluss- und Marge-Signale neu ausrichten.",
            "action_long": "Budgetsteuerung von Reichweite auf Profitabilitaet umstellen.",
            "score": max(55.0, min(95.0, abs(traffic_trend) * 4 + abs(revenue_trend) * 2)),
            "role": "cmo",
        }

    if kpi_name == "traffic":
        return {
            "main": "Kanalreichweite und Content-Leistung treiben die Veraenderung direkt.",
            "secondary": "Saisonalitaet und Wochentagsmuster verstaerken den Ausschlag.",
            "follow": "Umsatzreaktionen sind hier Folge, nicht Primaerursache.",
            "reason": f"Traffic-Trend {traffic_trend:+.1f}% und Wochentagsspread {weekday_spread:+.1f}%.",
            "action_now": "Top-Quellen und schwache Tage sofort gegeneinander auswerten.",
            "action_mid": "Budget und Content-Timing je Wochentag anpassen.",
            "action_long": "Ein planbares Traffic-Portfolio mit Forecast-Grenzwerten aufbauen.",
            "score": max(45.0, min(90.0, abs(traffic_trend) * 4 + abs(weekday_spread) * 0.4)),
            "role": "cmo",
        }

    if kpi_name == "new_customers":
        return {
            "main": "Lead-Qualitaet ist der Haupttreiber, weil sie bestimmt, ob Volumen in echte Kunden uebergeht.",
            "secondary": "Conversion und Angebotsfit wirken als Nebeneffekt mit.",
            "follow": "Reichweite ist nur Folge, wenn sie nicht in Abschluesse kippt.",
            "reason": f"Neue Kunden {customer_trend:+.1f}% bei Capture Rate {capture_rate:+.1f}%.",
            "action_now": "Quellen mit schwacher Abschlussqualitaet sofort markieren.",
            "action_mid": "Lead-Scoring und Vertriebsrouting neu kalibrieren.",
            "action_long": "Akquise auf Qualitaet statt Volumen optimieren.",
            "score": max(45.0, min(90.0, abs(customer_trend) * 4 + abs(capture_rate) * 3)),
            "role": "strategist",
        }

    return {
        "main": "Conversion ist der Haupttreiber, weil sie die direkte Uebersetzung von Nachfrage in Ergebnis bestimmt.",
        "secondary": "Traffic-Mix und Lead-Qualitaet verstärken die Entwicklung.",
        "follow": "Schwaechere Folge-KPIs sollten dokumentiert, aber nicht als Primaerproblem behandelt werden.",
        "reason": f"Conversion-Trend {conversion_trend:+.1f}% bei Neukunden-Trend {customer_trend:+.1f}%.",
        "action_now": "Die groessten Reibungspunkte im Funnel sofort beseitigen.",
        "action_mid": "Funnel-Schritte mit Forecast- und Benchmark-Vergleich priorisieren.",
        "action_long": "Ein dauerhaftes Conversion-Review mit Lernhistorie etablieren.",
        "score": max(50.0, min(92.0, abs(conversion_trend) * 5 + abs(customer_trend) * 2)),
        "role": "coo",
    }


def _diagnosis_bundle(kpi_name: str, historical_points: list[dict[str, Any]], forecast_result: Any, snapshot: dict) -> dict[str, Any]:
    values = [float(point.get("value", 0.0)) for point in historical_points]
    kpi_label = _METRIC_LABEL.get(kpi_name, kpi_name)
    change_7d = round(_period_delta(values, 7), 2) if len(values) >= 14 else 0.0
    change_30d = round(_period_delta(values, 30), 2) if len(values) >= 60 else (round(snapshot.get(kpi_name, {}).get("trend_pct", 0), 2) if snapshot.get(kpi_name) else 0.0)
    long_term = round(((values[-1] - values[0]) / values[0] * 100), 2) if len(values) > 1 and values[0] else 0.0
    growth_pct = _to_float(getattr(forecast_result, "growth_pct_30d", None) if not isinstance(forecast_result, dict) else forecast_result.get("growth_pct_30d", forecast_result.get("growth_pct", 0.0)))
    confidence = _to_float(getattr(forecast_result, "confidence", None) if not isinstance(forecast_result, dict) else forecast_result.get("confidence", 70.0))

    cause = _primary_cause_for_kpi(kpi_name, snapshot)
    hidden = _hidden_problems(snapshot)
    benchmark = _benchmark_note(kpi_name, snapshot)
    priority = _normalize_priority(abs(change_7d) * 2 + abs(change_30d) + max(0.0, -growth_pct) + max(0.0, 75 - confidence) * 0.3)

    summary = (
        f"{kpi_label} entwickelt sich ueber 7 Tage um {change_7d:+.1f}% und ueber 30 Tage um {change_30d:+.1f}%. "
        f"Langfristig liegt die Entwicklung bei {long_term:+.1f}%. "
        f"Der aktuelle Forecast zeigt {growth_pct:+.1f}% fuer die naechsten 30 Tage."
    )
    ceo_line = (
        f"{kpi_label} steht unter Beobachtung: {cause['main']} "
        f"Haupttreiber ist die direkt wirksame Ursache, Nebeneffekte begleiten die Entwicklung, Folgen werden dokumentiert."
    )
    actions = [cause["action_now"], cause["action_mid"], cause["action_long"]]

    return {
        "kpi_label": kpi_label,
        "summary": summary,
        "ceo_line": ceo_line,
        "priority": priority,
        "cause": cause,
        "hidden_problems": hidden,
        "benchmark": benchmark,
        "periods": {
            "7d": f"7 Tage: {change_7d:+.1f}% Veraenderung",
            "30d": f"30 Tage: {change_30d:+.1f}% Veraenderung",
            "long": f"Langfristig: {long_term:+.1f}% seit Beginn des Beobachtungsfensters",
        },
        "forecast_note": f"Forecast: {growth_pct:+.1f}% bei {confidence:.0f}% Konfidenz.",
        "actions": actions,
    }


def persist_forecast(
    db: Session,
    workspace_id: int,
    kpi_name: str,
    forecast_result: Any,
    kpi_id: int | None = None,
    linked_insight_id: int | None = None,
) -> ForecastRecord:
    """
    Persist the output of analytics/forecasting.py ForecastResult as a ForecastRecord.
    `forecast_result` is expected to be a ForecastResult dataclass or dict with these keys:
    forecast, trend, growth_pct_30d, confidence, month_projection
    """

    def _get(obj: Any, key: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    forecast_points = _get(forecast_result, "forecast", [])
    period_start = datetime.utcnow()
    period_end = datetime.utcnow() + timedelta(days=14)
    if forecast_points:
        try:
            if isinstance(forecast_points[0], dict):
                period_start = datetime.fromisoformat(str(forecast_points[0].get("date", period_start)))
                period_end = datetime.fromisoformat(str(forecast_points[-1].get("date", period_end)))
            else:
                period_start = datetime.strptime(str(getattr(forecast_points[0], "date", period_start)), "%Y-%m-%d")
                period_end = datetime.strptime(str(getattr(forecast_points[-1], "date", period_end)), "%Y-%m-%d")
        except Exception:
            pass

    forecast_value: float | None = None
    if forecast_points:
        last = forecast_points[-1]
        forecast_value = float(last.get("value", 0) if isinstance(last, dict) else getattr(last, "value", 0))

    historical = _get(forecast_result, "historical", [])
    baseline_value: float | None = None
    if historical:
        last_hist = historical[-1]
        baseline_value = float(
            last_hist.get("value", 0) if isinstance(last_hist, dict) else getattr(last_hist, "value", 0)
        )

    confidence = float(_get(forecast_result, "confidence", 70.0) or 70.0)
    margin = forecast_value * (1 - confidence / 100) if forecast_value else 0
    confidence_range = json.dumps({
        "lower": round((forecast_value or 0) - margin, 2),
        "upper": round((forecast_value or 0) + margin, 2),
    })

    record = ForecastRecord(
        workspace_id=workspace_id,
        kpi_id=kpi_id,
        kpi_name=kpi_name,
        period_start=period_start,
        period_end=period_end,
        baseline_value=baseline_value,
        forecast_value=forecast_value,
        best_case=round((forecast_value or 0) + margin, 2),
        worst_case=round((forecast_value or 0) - margin, 2),
        confidence_range=confidence_range,
        model_version=str(_get(forecast_result, "model_weights", "ensemble")),
        trend=str(_get(forecast_result, "trend", "stable")),
        growth_pct=float(_get(forecast_result, "growth_pct_30d", _get(forecast_result, "growth_pct", 0.0)) or 0.0),
        confidence=confidence,
        linked_insight_id=linked_insight_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info("ForecastRecord %s persisted (workspace=%s kpi=%s)", record.id, workspace_id, kpi_name)
    return record


def persist_forecast_diagnosis(
    db: Session,
    workspace_id: int,
    kpi_name: str,
    forecast_result: Any,
    historical_points: list[dict[str, Any]],
    kpi_id: int | None = None,
) -> dict[str, Any]:
    def _id_int(value: Any) -> int:
        return int(cast(Any, value))

    rows = _load_metric_rows(db, days=120)
    snapshot = build_metric_snapshot(rows, goals=[]) if rows else {}
    diagnosis = _diagnosis_bundle(kpi_name, historical_points, forecast_result, snapshot)
    target_role, ai_role = _METRIC_ROLE.get(kpi_name, ("ceo", "strategist"))
    affected_ids = [kpi_id] if kpi_id is not None else []

    main_insight = create_insight(
        db=db,
        workspace_id=workspace_id,
        title=f"{diagnosis['kpi_label']}: Veraenderung mit Handlungsbedarf",
        insight_type="problem",
        what_happened=diagnosis["summary"],
        why_it_happened=f"Haupttreiber: {diagnosis['cause']['main']} Nebeneffekt: {diagnosis['cause']['secondary']} Folge: {diagnosis['cause']['follow']}",
        what_it_means=f"{diagnosis['ceo_line']} {diagnosis['benchmark']}",
        what_to_do=diagnosis["actions"][0],
        expected_outcome=f"{diagnosis['actions'][1]} {diagnosis['forecast_note']}",
        affected_kpi_ids=affected_ids,
        priority=diagnosis["priority"],
        confidence_score=_to_float(getattr(forecast_result, "confidence", None) if not isinstance(forecast_result, dict) else forecast_result.get("confidence", 70.0)),
        impact_score=float(diagnosis["cause"]["score"]),
        target_role=target_role,
        generated_by_ai_role=ai_role,
    )

    root_cause_insight = create_insight(
        db=db,
        workspace_id=workspace_id,
        title=f"{diagnosis['kpi_label']}: Haupttreiber und Nebeneffekte",
        insight_type="root_cause",
        what_happened=diagnosis["periods"]["30d"],
        why_it_happened=f"{diagnosis['cause']['main']} Begruendung: {diagnosis['cause']['reason']}",
        what_it_means=f"Nebeneffekt: {diagnosis['cause']['secondary']} Folge: {diagnosis['cause']['follow']}",
        what_to_do=diagnosis["actions"][1],
        expected_outcome=diagnosis["actions"][2],
        affected_kpi_ids=affected_ids,
        priority=diagnosis["priority"],
        confidence_score=_to_float(getattr(forecast_result, "confidence", None) if not isinstance(forecast_result, dict) else forecast_result.get("confidence", 70.0)),
        impact_score=max(35.0, float(diagnosis["cause"]["score"]) - 10),
        target_role=target_role,
        generated_by_ai_role=ai_role,
    )

    hidden_insight_ids: list[int] = []
    for hidden in diagnosis["hidden_problems"]:
        insight = create_insight(
            db=db,
            workspace_id=workspace_id,
            title=hidden["title"],
            insight_type="problem",
            what_happened=hidden["description"],
            why_it_happened="; ".join(hidden["causes"]),
            what_it_means="Versteckter KPI-Widerspruch mit Risiko fuer Management-Entscheidungen.",
            what_to_do="; ".join(hidden["actions"]),
            expected_outcome="Der Widerspruch wird sichtbar, priorisierbar und operativ steuerbar.",
            affected_kpi_ids=affected_ids,
            priority=hidden["priority"],
            confidence_score=68.0,
            impact_score=70.0 if hidden["priority"] == "high" else 55.0,
            target_role=hidden["role"],
            generated_by_ai_role=hidden["role"],
        )
        hidden_insight_ids.append(_id_int(insight.id))

    problem = DecisionProblem(
        workspace_id=workspace_id,
        metric_key=kpi_name,
        problem_name=f"{diagnosis['kpi_label']} unter Druck",
        category="forecast_diagnosis",
        strength_pct=abs(_to_float(getattr(forecast_result, "growth_pct", None) if not isinstance(forecast_result, dict) else forecast_result.get("growth_pct", 0.0))),
        importance=8 if diagnosis["priority"] in {"critical", "high"} else 5,
        problem_score=float(diagnosis["cause"]["score"]),
        severity=diagnosis["priority"],
        priority=diagnosis["priority"],
        likely_cause=diagnosis["cause"]["main"][:128],
        cause_confidence_pct=min(95.0, max(55.0, _to_float(getattr(forecast_result, "confidence", None) if not isinstance(forecast_result, dict) else forecast_result.get("confidence", 70.0)))),
    )
    db.add(problem)
    db.commit()
    db.refresh(problem)

    record = persist_forecast(
        db=db,
        workspace_id=workspace_id,
        kpi_name=kpi_name,
        forecast_result=forecast_result,
        kpi_id=kpi_id,
        linked_insight_id=_id_int(main_insight.id),
    )
    setattr(record, "linked_scenario_ids", json.dumps(
        {
            "root_cause_insight_id": _id_int(root_cause_insight.id),
            "hidden_problem_insight_ids": hidden_insight_ids,
            "decision_problem_id": _id_int(problem.id),
            "recommended_actions": diagnosis["actions"],
        }
    ))
    db.commit()
    db.refresh(record)

    return {
        "forecast_record": record,
        "linked_insight_id": _id_int(main_insight.id),
        "root_cause_insight_id": _id_int(root_cause_insight.id),
        "decision_problem_id": _id_int(problem.id),
        "hidden_problem_insight_ids": hidden_insight_ids,
        "summary": diagnosis["summary"],
        "ceo_summary": diagnosis["ceo_line"],
        "benchmark_note": diagnosis["benchmark"],
        "forecast_note": diagnosis["forecast_note"],
        "periods": diagnosis["periods"],
        "actions": diagnosis["actions"],
        "hidden_problems": diagnosis["hidden_problems"],
    }


def get_forecast_records(
    db: Session,
    workspace_id: int,
    kpi_name: str | None = None,
    kpi_id: int | None = None,
    limit: int = 20,
) -> list[ForecastRecord]:
    q = db.query(ForecastRecord).filter(ForecastRecord.workspace_id == workspace_id)
    if kpi_id:
        q = q.filter(ForecastRecord.kpi_id == kpi_id)
    if kpi_name:
        q = q.filter(ForecastRecord.kpi_name == kpi_name)
    return q.order_by(ForecastRecord.generated_at.desc()).limit(limit).all()


def compare_forecast_vs_actual(
    db: Session,
    workspace_id: int,
    forecast_id: int,
    actual_value: float,
) -> ForecastRecord | None:
    """Fill in actual_value and compute accuracy after the forecast period has passed."""
    record = (
        db.query(ForecastRecord)
        .filter(ForecastRecord.workspace_id == workspace_id, ForecastRecord.id == forecast_id)
        .first()
    )
    if not record:
        return None

    forecast_value = cast(float | None, record.forecast_value)
    record.actual_value = cast(Any, actual_value)
    if forecast_value not in (None, 0):
        error_pct = abs(actual_value - forecast_value) / abs(forecast_value) * 100
        setattr(record, "accuracy_pct", max(0.0, round(100 - error_pct, 1)))
    record.updated_at = cast(Any, datetime.utcnow())
    db.commit()
    db.refresh(record)
    return record
