from datetime import date, timedelta
import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from models.daily_metrics import DailyMetrics
from models.goals import Goal
from models.task import Task


WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
SHORT_WEEKDAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
ACTION_VERBS = (
    "priorisier",
    "optimi",
    "reduzier",
    "starte",
    "analysier",
    "automatisier",
    "verschieb",
    "erhoe",
    "senk",
    "teste",
    "segmentier",
    "aktiviere",
    "fix",
    "verbesser",
    "pruef",
)
BUSINESS_KEYWORDS = (
    "umsatz",
    "revenue",
    "traffic",
    "conversion",
    "funnel",
    "kunden",
    "aov",
    "visit",
    "effizienz",
    "ziel",
    "wochentag",
    "momentum",
    "anomal",
    "korrelation",
    "checkout",
    "kanal",
)


def to_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def avg(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def pct_change(current: float, previous: float) -> float:
    return ((current - previous) / previous * 100) if previous else 0.0


def weekday_name(index: int) -> str:
    return WEEKDAY_NAMES[index] if 0 <= index < len(WEEKDAY_NAMES) else "Unbekannt"


def contains_numeric_signal(text: str) -> bool:
    return any(char.isdigit() for char in (text or ""))


def quality_label(score: int) -> str:
    if score >= 85:
        return "excellent"
    if score >= 70:
        return "strong"
    if score >= 55:
        return "usable"
    if score >= 40:
        return "weak"
    return "poor"


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _keyword_hits(text: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if keyword in text)


def _actionability_score(text: str) -> int:
    normalized = _normalize_text(text)
    hits = sum(1 for verb in ACTION_VERBS if verb in normalized)
    if len(normalized) >= 24:
        hits += 1
    return min(20, hits * 4)


def _relevance_keywords(snapshot: Optional[dict]) -> tuple[str, ...]:
    if not snapshot:
        return BUSINESS_KEYWORDS

    keywords = set(BUSINESS_KEYWORDS)
    revenue = snapshot.get("revenue", {})
    traffic = snapshot.get("traffic", {})
    conversion_rate = snapshot.get("conversion_rate", {})
    if revenue.get("trend") == "down" or snapshot.get("week_over_week", 0) < 0:
        keywords.update(("umsatz", "pricing", "verkauf", "revenue"))
    if traffic.get("trend") == "down":
        keywords.update(("traffic", "kanal", "reach", "acquisition"))
    if conversion_rate.get("trend") == "down" or conversion_rate.get("avg", 0) < 2:
        keywords.update(("conversion", "checkout", "funnel", "landing"))
    if snapshot.get("goals"):
        keywords.update(str(goal.get("metric", "")) for goal in snapshot["goals"] if not goal.get("on_track"))
    if snapshot.get("anomalies"):
        keywords.update(str(anomaly.get("metric", "")) for anomaly in snapshot["anomalies"])
    return tuple(keyword for keyword in keywords if keyword)


def _base_quality_score(
    *,
    text: str,
    evidence_text: str,
    action_text: str,
    confidence: int = 0,
    impact_pct: float = 0.0,
    snapshot: Optional[dict] = None,
) -> int:
    normalized_text = _normalize_text(text)
    normalized_evidence = _normalize_text(evidence_text)
    normalized_action = _normalize_text(action_text)
    score = 0

    if contains_numeric_signal(normalized_evidence):
        score += 24
    elif contains_numeric_signal(normalized_text):
        score += 10
    else:
        score -= 12

    score += min(16, _keyword_hits(normalized_text, BUSINESS_KEYWORDS) * 3)
    score += min(14, _keyword_hits(normalized_text, _relevance_keywords(snapshot)) * 4)
    score += _actionability_score(normalized_action)

    if len(normalized_text) >= 120:
        score += 12
    elif len(normalized_text) >= 70:
        score += 8
    elif len(normalized_text) >= 40:
        score += 4
    else:
        score -= 8

    if len(normalized_action) < 8:
        score -= 10
    if confidence > 0:
        score += min(8, max(0, confidence) // 12)
    if impact_pct > 0:
        score += min(8, int(impact_pct // 4) + 1)

    return max(0, min(100, score))


def score_insight_quality(item: dict, snapshot: Optional[dict] = None) -> dict:
    quality_score = _base_quality_score(
        text=" ".join(
            [
                str(item.get("title", "")),
                str(item.get("description", "")),
                str(item.get("evidence", "")),
                str(item.get("action", "")),
                str(item.get("segment", "")),
            ]
        ),
        evidence_text=str(item.get("evidence", "")),
        action_text=str(item.get("action", "")),
        confidence=int(item.get("confidence", 0) or 0),
        impact_pct=float(item.get("impact_pct", 0) or 0),
        snapshot=snapshot,
    )
    enriched = dict(item)
    enriched["quality_score"] = quality_score
    enriched["quality_label"] = quality_label(quality_score)
    return enriched


def score_recommendation_quality(item: dict, snapshot: Optional[dict] = None) -> dict:
    quality_score = _base_quality_score(
        text=" ".join(
            [
                str(item.get("title", "")),
                str(item.get("description", "")),
                str(item.get("rationale", "")),
                str(item.get("expected_result", item.get("expected_effect", ""))),
            ]
        ),
        evidence_text=str(item.get("rationale", "")),
        action_text=" ".join(
            [
                str(item.get("title", "")),
                str(item.get("action_label", item.get("auto_task_title", ""))),
                str(item.get("expected_result", item.get("expected_effect", ""))),
            ]
        ),
        impact_pct=float(item.get("impact_pct", 0) or 0),
        snapshot=snapshot,
    )
    enriched = dict(item)
    enriched["quality_score"] = quality_score
    enriched["quality_label"] = quality_label(quality_score)
    return enriched


def score_alert_quality(item: dict, snapshot: Optional[dict] = None) -> dict:
    quality_score = _base_quality_score(
        text=" ".join([str(item.get("title", "")), str(item.get("description", "")), str(item.get("action", ""))]),
        evidence_text=" ".join(
            [
                str(item.get("description", "")),
                str(item.get("current_value", "")),
                str(item.get("threshold", "")),
                str(item.get("deviation_pct", "")),
            ]
        ),
        action_text=str(item.get("action", "")),
        impact_pct=abs(float(item.get("deviation_pct", 0) or 0)),
        snapshot=snapshot,
    )
    enriched = dict(item)
    enriched["quality_score"] = quality_score
    enriched["quality_label"] = quality_label(quality_score)
    return enriched


def score_pattern_quality(item: dict, snapshot: Optional[dict] = None) -> dict:
    quality_score = _base_quality_score(
        text=" ".join(
            [
                str(item.get("title", "")),
                str(item.get("description", "")),
                str(item.get("implication", "")),
                " ".join(str(metric) for metric in item.get("metrics", [])),
            ]
        ),
        evidence_text=str(item.get("description", "")),
        action_text=str(item.get("implication", "")),
        confidence=int(item.get("confidence", 0) or 0),
        snapshot=snapshot,
    )
    enriched = dict(item)
    enriched["quality_score"] = quality_score
    enriched["quality_label"] = quality_label(quality_score)
    return enriched


def score_automation_quality(item: dict, snapshot: Optional[dict] = None) -> dict:
    quality_score = _base_quality_score(
        text=" ".join(
            [
                str(item.get("title", "")),
                str(item.get("description", "")),
                str(item.get("trigger", "")),
                str(item.get("action", "")),
            ]
        ),
        evidence_text=" ".join([str(item.get("trigger", "")), str(item.get("expected_saving", ""))]),
        action_text=str(item.get("action", "")),
        snapshot=snapshot,
    )
    enriched = dict(item)
    enriched["quality_score"] = quality_score
    enriched["quality_label"] = quality_label(quality_score)
    return enriched


def get_daily_rows(db: Session, days: int) -> list[DailyMetrics]:
    safe_days = max(7, min(days, 365))
    since = date.today() - timedelta(days=safe_days)
    return (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= since)
        .order_by(DailyMetrics.date)
        .all()
    )


def summarize_values(values: list[float]) -> dict:
    if not values:
        return {}

    average = sum(values) / len(values)
    half = len(values) // 2
    recent = values[half:] if values[half:] else values
    older = values[:half] if values[:half] else values
    recent_avg = sum(recent) / len(recent)
    older_avg = sum(older) / len(older)
    trend_pct = pct_change(recent_avg, older_avg)

    return {
        "total": round(sum(values), 2),
        "avg": round(average, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "latest": round(values[-1], 4),
        "trend_pct": round(trend_pct, 2),
        "trend": "up" if trend_pct > 3 else "down" if trend_pct < -3 else "stable",
        "volatility": round((max(values) - min(values)) / average * 100 if average else 0, 1),
    }


def _goal_current_value(metric_name: str, rows: list[DailyMetrics], conv_rates: list[float]) -> float:
    if metric_name == "revenue":
        return sum(to_float(row.revenue) for row in rows)
    if metric_name == "traffic":
        return sum(to_float(row.traffic) for row in rows)
    if metric_name == "conversions":
        return sum(to_float(row.conversions) for row in rows)
    if metric_name in ("conversion_rate", "conv_rate"):
        return avg([rate * 100 for rate in conv_rates])
    if metric_name in ("new_customers", "customers"):
        return sum(to_float(row.new_customers) for row in rows)
    return 0.0


def _detect_anomalies(rows: list[DailyMetrics], metric_name: str, values: list[float]) -> list[dict]:
    if len(values) < 8:
        return []

    mean_value = avg(values)
    variance = avg([(value - mean_value) ** 2 for value in values])
    std_dev = variance ** 0.5
    if std_dev == 0:
        return []

    findings: list[dict] = []
    for row, value in zip(rows[-7:], values[-7:]):
        z_score = (value - mean_value) / std_dev
        deviation = pct_change(value, mean_value)
        if abs(z_score) >= 1.5:
            findings.append(
                {
                    "metric": metric_name,
                    "date": str(row.date),
                    "value": round(value, 2),
                    "avg": round(mean_value, 2),
                    "deviation": round(deviation, 1),
                    "z_score": round(z_score, 2),
                }
            )
    return findings


def _window_rows(rows: list[DailyMetrics], days: int) -> list[DailyMetrics]:
    today = date.today()
    return [row for row in rows if (today - row.date).days <= days]


def _metric_series(snapshot: dict, metric_key: str) -> dict:
    metric = snapshot.get(metric_key, {}) if snapshot else {}
    return metric if isinstance(metric, dict) else {}


def _metric_direction(score: float, positive_threshold: float = 3.0, negative_threshold: float = -3.0) -> str:
    if score >= positive_threshold:
        return "up"
    if score <= negative_threshold:
        return "down"
    return "stable"


def _metric_priority_from_impact(impact_score: float) -> str:
    if impact_score >= 85:
        return "critical"
    if impact_score >= 65:
        return "high"
    if impact_score >= 40:
        return "medium"
    return "low"


def _metric_business_label(metric_key: str) -> str:
    labels = {
        "revenue": "Umsatz",
        "traffic": "Traffic",
        "conversions": "Conversions",
        "conversion_rate": "Conversion Rate",
        "new_customers": "Neue Kunden",
        "aov": "Warenkorbwert",
        "revenue_per_visit": "Umsatz pro Visit",
        "customer_capture_rate": "Neukunden je Conversion",
    }
    return labels.get(metric_key, metric_key)


def _pattern_strength(score: float) -> str:
    if score >= 85:
        return "sehr stark"
    if score >= 70:
        return "stark"
    if score >= 50:
        return "mittel"
    return "schwach"


def _detect_patterns_from_snapshots(snapshot_7: dict, snapshot_30: dict, snapshot_90: dict) -> list[dict]:
    patterns: list[dict] = []
    comparable_metrics = ("revenue", "traffic", "conversion_rate", "new_customers", "revenue_per_visit")

    for metric_key in comparable_metrics:
        s7 = _metric_series(snapshot_7, metric_key)
        s30 = _metric_series(snapshot_30, metric_key)
        s90 = _metric_series(snapshot_90, metric_key)
        if not s7 or not s30 or not s90:
            continue

        d7 = float(s7.get("trend_pct", 0) or 0)
        d30 = float(s30.get("trend_pct", 0) or 0)
        d90 = float(s90.get("trend_pct", 0) or 0)
        directions = [_metric_direction(d7), _metric_direction(d30), _metric_direction(d90)]
        non_stable = [direction for direction in directions if direction != "stable"]

        if len(non_stable) < 2:
            continue
        if len(set(non_stable)) != 1:
            continue

        direction = non_stable[0]
        label = _metric_business_label(metric_key)
        avg_abs = (abs(d7) + abs(d30) + abs(d90)) / 3
        score = min(100, round(45 + avg_abs * 2.5 + (15 if directions.count(direction) == 3 else 0)))
        signal_word = "steigt" if direction == "up" else "faellt"
        title = f"{label} {signal_word} wiederholt"
        patterns.append(
            {
                "id": f"pattern-{metric_key}-{direction}",
                "category": "time",
                "metric": metric_key,
                "title": title,
                "what_happens": f"{label} {signal_word} nicht nur einmal, sondern wiederholt ueber mehrere Zeitraeume.",
                "when": "Sichtbar in 7, 30 und 90 Tagen." if directions.count(direction) == 3 else "Sichtbar in mindestens 2 von 3 Zeitraeumen.",
                "evidence": f"7 Tage {d7:+.1f}%, 30 Tage {d30:+.1f}%, 90 Tage {d90:+.1f}%.",
                "why_likely": (
                    "Das wirkt nicht wie ein Zufall, sondern wie ein wiederkehrendes Verhaltensmuster im System."
                    if directions.count(direction) == 3
                    else "Die Entwicklung wiederholt sich in mehreren Fenstern und hat deshalb wahrscheinlich eine strukturelle Ursache."
                ),
                "score": score,
                "strength": _pattern_strength(score),
                "action": (
                    f"Dieses Muster aktiv ausbauen und als Standard fuer {label} nutzen."
                    if direction == "up"
                    else f"Die wiederkehrende Ursache fuer {label} isolieren und sofort gegensteuern."
                ),
                "windows": {"7d": round(d7, 1), "30d": round(d30, 1), "90d": round(d90, 1)},
                "repeated": True,
                "business_impact": round(avg_abs, 1),
            }
        )

    weekday_candidates = [snapshot_7.get("weekday_pattern", {}), snapshot_30.get("weekday_pattern", {}), snapshot_90.get("weekday_pattern", {})]
    best_days = [item.get("best_day") for item in weekday_candidates if item.get("best_day")]
    worst_days = [item.get("worst_day") for item in weekday_candidates if item.get("worst_day")]
    spread_values = [float(item.get("spread_pct", 0) or 0) for item in weekday_candidates if item]
    if best_days and worst_days and len(set(best_days)) == 1 and len(set(worst_days)) == 1 and max(spread_values or [0]) >= 10:
        avg_spread = sum(spread_values) / len(spread_values)
        score = min(100, round(55 + abs(avg_spread) * 1.5))
        patterns.append(
            {
                "id": "pattern-weekday-revenue",
                "category": "content_timing",
                "metric": "revenue",
                "title": "Wochentagsmuster ist stabil",
                "what_happens": f"Der beste Tag ist wiederholt {best_days[0]}, der schwaechste Tag wiederholt {worst_days[0]}.",
                "when": "Das zeigt sich in 7, 30 und 90 Tagen.",
                "evidence": f"Spreizung zwischen starkem und schwachem Tag: im Schnitt {avg_spread:+.1f}%.",
                "why_likely": "Die Leistung haengt wahrscheinlich mit Timing, Zielgruppenverhalten oder wiederkehrenden Aktionen pro Wochentag zusammen.",
                "score": score,
                "strength": _pattern_strength(score),
                "action": f"Starke Tage fuer Push und schwache Tage fuer Tests, Retargeting oder Qualitaetsverbesserung nutzen.",
                "windows": {
                    "7d": round(spread_values[0], 1) if len(spread_values) > 0 else 0.0,
                    "30d": round(spread_values[1], 1) if len(spread_values) > 1 else 0.0,
                    "90d": round(spread_values[2], 1) if len(spread_values) > 2 else 0.0,
                },
                "repeated": True,
                "business_impact": round(abs(avg_spread), 1),
            }
        )

    return sorted(patterns, key=lambda item: (item.get("score", 0), item.get("business_impact", 0)), reverse=True)[:6]


def _detect_deviations_from_snapshots(snapshot_7: dict, snapshot_30: dict, snapshot_90: dict) -> list[dict]:
    deviations: list[dict] = []
    comparable_metrics = ("revenue", "traffic", "conversion_rate", "new_customers", "revenue_per_visit")

    for metric_key in comparable_metrics:
        current_metric = _metric_series(snapshot_30, metric_key)
        baseline_7 = _metric_series(snapshot_7, metric_key)
        baseline_90 = _metric_series(snapshot_90, metric_key)
        if not current_metric or not baseline_7 or not baseline_90:
            continue

        latest = float(current_metric.get("latest", 0) or 0)
        avg_7 = float(baseline_7.get("avg", 0) or 0)
        avg_30 = float(current_metric.get("avg", 0) or 0)
        avg_90 = float(baseline_90.get("avg", 0) or 0)
        if avg_7 <= 0 and avg_30 <= 0 and avg_90 <= 0:
            continue

        def _dev(cur: float, base: float) -> float:
            return pct_change(cur, base) if base else 0.0

        dev_7 = _dev(latest, avg_7)
        dev_30 = _dev(latest, avg_30)
        dev_90 = _dev(latest, avg_90)
        max_dev = max(abs(dev_7), abs(dev_30), abs(dev_90))
        if max_dev < 12:
            continue

        direction = "up" if max(dev_7, dev_30, dev_90) > abs(min(dev_7, dev_30, dev_90)) else "down"
        label = _metric_business_label(metric_key)
        impact_score = min(100, round(40 + max_dev * 2))
        deviations.append(
            {
                "id": f"deviation-{metric_key}",
                "metric": metric_key,
                "title": f"{label} weicht klar ab",
                "status": "ungewoehnlicher Anstieg" if direction == "up" else "KPI-Abfall",
                "what_happened": (
                    f"{label} liegt aktuell deutlich ueber der Erwartung."
                    if direction == "up"
                    else f"{label} liegt aktuell deutlich unter der Erwartung."
                ),
                "why_it_happened": "Die Veraenderung ist gross genug, um nicht nur normales Tagesrauschen zu sein.",
                "what_it_means": (
                    f"Das ist kurzfristig positiv, sollte aber auf Wiederholbarkeit geprueft werden."
                    if direction == "up"
                    else f"Das belastet direkt Leistung, Zielerreichung oder Umsatz."
                ),
                "what_to_do": (
                    f"Pruefen, was den Anstieg bei {label} ausgeloest hat, und den Effekt wiederholbar machen."
                    if direction == "up"
                    else f"Die Ursache fuer den Rueckgang bei {label} heute priorisiert pruefen und Gegenmassnahme starten."
                ),
                "compare": {
                    "today_vs_7d": round(dev_7, 1),
                    "today_vs_30d": round(dev_30, 1),
                    "today_vs_90d": round(dev_90, 1),
                },
                "value": round(latest, 2),
                "baseline_7d": round(avg_7, 2),
                "baseline_30d": round(avg_30, 2),
                "baseline_90d": round(avg_90, 2),
                "priority": _metric_priority_from_impact(impact_score),
                "impact_score": impact_score,
                "urgency": "hoch" if impact_score >= 65 else "mittel" if impact_score >= 40 else "niedrig",
                "pattern_link": "wiederkehrend" if any(metric_key == p.get("metric") for p in snapshot_90.get("patterns", [])) else "eher einmalig",
            }
        )

    return sorted(deviations, key=lambda item: item.get("impact_score", 0), reverse=True)[:6]


def build_metric_snapshot(rows: list[DailyMetrics], goals: Optional[list[Goal]] = None) -> dict:
    if not rows:
        return {}

    revenues = [to_float(row.revenue) for row in rows]
    traffics = [to_float(row.traffic) for row in rows]
    conversions = [to_float(row.conversions) for row in rows]
    conv_rates = [to_float(row.conversion_rate) for row in rows]
    new_customers = [to_float(row.new_customers) for row in rows]
    aovs = [safe_div(revenues[index], conversions[index]) for index in range(len(rows))]
    revenue_per_visit = [safe_div(revenues[index], traffics[index]) for index in range(len(rows))]
    customer_capture_rate = [safe_div(new_customers[index], conversions[index]) * 100 for index in range(len(rows))]

    today = date.today()
    this_week = [row for row in rows if (today - row.date).days <= 7]
    last_week = [row for row in rows if 7 < (today - row.date).days <= 14]
    this_week_revenue = sum(to_float(row.revenue) for row in this_week)
    last_week_revenue = sum(to_float(row.revenue) for row in last_week)

    goal_analysis: list[dict] = []
    for goal in goals or []:
        metric = str(getattr(goal, "metric", ""))
        target_value = float(getattr(goal, "target_value", 0) or 0)
        current = _goal_current_value(metric, rows, conv_rates)
        progress_pct = round(current / target_value * 100, 1) if target_value else 0
        goal_analysis.append(
            {
                "metric": metric,
                "target": target_value,
                "current": round(current, 2),
                "progress_pct": progress_pct,
                "on_track": progress_pct >= 80,
            }
        )

    anomalies = []
    anomalies.extend(_detect_anomalies(rows, "revenue", revenues))
    anomalies.extend(_detect_anomalies(rows, "traffic", traffics))
    anomalies.extend(_detect_anomalies(rows, "conversion_rate", [rate * 100 for rate in conv_rates]))

    weekday_buckets: dict[int, list[float]] = {index: [] for index in range(7)}
    for row in rows:
        weekday_buckets[row.date.weekday()].append(to_float(row.revenue))
    weekday_avgs = {weekday: avg(values) for weekday, values in weekday_buckets.items() if values}
    best_weekday = max(weekday_avgs.items(), key=lambda item: item[1])[0] if weekday_avgs else -1
    worst_weekday = min(weekday_avgs.items(), key=lambda item: item[1])[0] if weekday_avgs else -1

    recent_7_revenue = sum(revenues[-7:])
    previous_7_revenue = sum(revenues[-14:-7]) if len(revenues) >= 14 else sum(revenues[:-7])
    recent_7_traffic = sum(traffics[-7:])
    previous_7_traffic = sum(traffics[-14:-7]) if len(traffics) >= 14 else sum(traffics[:-7])
    recent_7_conversion = avg([rate * 100 for rate in conv_rates[-7:]])
    previous_7_conversion = (
        avg([rate * 100 for rate in conv_rates[-14:-7]]) if len(conv_rates) >= 14 else avg([rate * 100 for rate in conv_rates[:-7]])
    )

    return {
        "period": f"{rows[0].date} bis {rows[-1].date}",
        "days": len(rows),
        "revenue": summarize_values(revenues),
        "traffic": summarize_values(traffics),
        "conversions": summarize_values(conversions),
        "conversion_rate": summarize_values([rate * 100 for rate in conv_rates]),
        "new_customers": summarize_values(new_customers),
        "aov": summarize_values(aovs),
        "revenue_per_visit": summarize_values(revenue_per_visit),
        "customer_capture_rate": summarize_values(customer_capture_rate),
        "week_over_week": round(pct_change(this_week_revenue, last_week_revenue), 2),
        "this_week_revenue": round(this_week_revenue, 2),
        "last_week_revenue": round(last_week_revenue, 2),
        "goals": sorted(goal_analysis, key=lambda item: item["progress_pct"]),
        "anomalies": sorted(anomalies, key=lambda item: abs(item["z_score"]), reverse=True)[:6],
        "revenue_momentum_7d": round(pct_change(recent_7_revenue, previous_7_revenue), 2),
        "traffic_momentum_7d": round(pct_change(recent_7_traffic, previous_7_traffic), 2),
        "conversion_momentum_7d": round(recent_7_conversion - previous_7_conversion, 2),
        "weekday_pattern": {
            "best_day": weekday_name(best_weekday) if best_weekday >= 0 else "Unbekannt",
            "worst_day": weekday_name(worst_weekday) if worst_weekday >= 0 else "Unbekannt",
            "best_day_short": SHORT_WEEKDAY_NAMES[best_weekday] if best_weekday >= 0 else "?",
            "worst_day_short": SHORT_WEEKDAY_NAMES[worst_weekday] if worst_weekday >= 0 else "?",
            "best_day_avg_revenue": round(weekday_avgs.get(best_weekday, 0), 2),
            "worst_day_avg_revenue": round(weekday_avgs.get(worst_weekday, 0), 2),
            "spread_pct": round(pct_change(weekday_avgs.get(best_weekday, 0), weekday_avgs.get(worst_weekday, 0)), 1)
            if best_weekday >= 0 and worst_weekday >= 0
            else 0.0,
        },
        "raw_revenue": revenues,
        "raw_traffic": traffics,
        "raw_conv_rate": [rate * 100 for rate in conv_rates],
    }


def build_analysis_snapshot(db: Session, days: int = 30) -> dict:
    rows = get_daily_rows(db, max(days, 90))
    if not rows:
        return {}
    goals = db.query(Goal).all()
    snapshot_current = build_metric_snapshot(_window_rows(rows, days), goals)
    snapshot_7 = build_metric_snapshot(_window_rows(rows, 7), goals)
    snapshot_30 = build_metric_snapshot(_window_rows(rows, 30), goals)
    snapshot_90 = build_metric_snapshot(rows, goals)
    patterns = _detect_patterns_from_snapshots(snapshot_7, snapshot_30, snapshot_90)
    snapshot_90["patterns"] = patterns
    deviations = _detect_deviations_from_snapshots(snapshot_7, snapshot_30, snapshot_90)
    return {
        **snapshot_current,
        "comparison_windows": {
            "7d": snapshot_7,
            "30d": snapshot_30,
            "90d": snapshot_90,
        },
        "patterns": patterns,
        "deviations": deviations,
    }


def build_analysis_context(data: dict) -> str:
    if not data:
        return "Keine Daten verfuegbar."

    revenue = data.get("revenue", {})
    traffic = data.get("traffic", {})
    conversion_rate = data.get("conversion_rate", {})
    new_customers = data.get("new_customers", {})
    aov = data.get("aov", {})
    revenue_per_visit = data.get("revenue_per_visit", {})
    customer_capture_rate = data.get("customer_capture_rate", {})
    weekday = data.get("weekday_pattern", {})

    lines = [
        f"ANALYSEZEITRAUM: {data.get('period')} ({data.get('days')} Tage)",
        "",
        "UMSATZ:",
        f"  Gesamt: EUR {revenue.get('total', 0):,.2f}",
        f"  Tagesdurchschnitt: EUR {revenue.get('avg', 0):,.2f}",
        f"  Aktuell (letzter Tag): EUR {revenue.get('latest', 0):,.2f}",
        f"  Trend: {revenue.get('trend_pct', 0):+.1f}% (Tendenz: {revenue.get('trend', 'stabil')})",
        f"  Volatilitaet: {revenue.get('volatility', 0):.1f}%",
        f"  Diese Woche: EUR {data.get('this_week_revenue', 0):,.2f} | Letzte Woche: EUR {data.get('last_week_revenue', 0):,.2f} | WoW: {data.get('week_over_week', 0):+.1f}%",
        "",
        "TRAFFIC:",
        f"  Durchschnitt Besucher/Tag: {traffic.get('avg', 0):.1f}",
        f"  Trend: {traffic.get('trend_pct', 0):+.1f}%",
        "",
        "CONVERSION RATE:",
        f"  Durchschnitt: {conversion_rate.get('avg', 0):.2f}%",
        f"  Min: {conversion_rate.get('min', 0):.2f}% | Max: {conversion_rate.get('max', 0):.2f}%",
        f"  Trend: {conversion_rate.get('trend_pct', 0):+.1f}%",
        "",
        "NEUE KUNDEN:",
        f"  Durchschnitt pro Tag: {new_customers.get('avg', 0):.2f}",
        f"  Trend: {new_customers.get('trend_pct', 0):+.1f}%",
        "",
        "EFFIZIENZ:",
        f"  Umsatz pro Visit: EUR {revenue_per_visit.get('avg', 0):.4f} ({revenue_per_visit.get('trend_pct', 0):+.1f}% Trend)",
        f"  Average Order Value: EUR {aov.get('avg', 0):.2f}",
        f"  Neukunden je Conversion: {customer_capture_rate.get('avg', 0):.1f}%",
        "",
        "7-TAGE-DYNAMIK:",
        f"  Umsatz-Momentum: {data.get('revenue_momentum_7d', 0):+.1f}%",
        f"  Traffic-Momentum: {data.get('traffic_momentum_7d', 0):+.1f}%",
        f"  Conversion-Momentum: {data.get('conversion_momentum_7d', 0):+.2f} Prozentpunkte",
        "",
        "WOCHENMUSTER:",
        f"  Bester Tag: {weekday.get('best_day', 'Unbekannt')} (O EUR {weekday.get('best_day_avg_revenue', 0):,.2f})",
        f"  Schwaechster Tag: {weekday.get('worst_day', 'Unbekannt')} (O EUR {weekday.get('worst_day_avg_revenue', 0):,.2f})",
        f"  Spreizung: {weekday.get('spread_pct', 0):+.1f}%",
    ]

    if data.get("goals"):
        lines.append("\nZIELDRUCK:")
        for goal in data["goals"][:4]:
            status = "auf Kurs" if goal["on_track"] else "hinter Plan"
            lines.append(f"  {goal['metric']}: {goal['progress_pct']}% von {goal['target']} Ziel ({status})")

    if data.get("anomalies"):
        lines.append("\nANOMALIEN (letzte 7 Tage):")
        for anomaly in data["anomalies"][:3]:
            lines.append(
                f"  {anomaly['metric']} am {anomaly['date']}: {anomaly['value']} vs {anomaly['avg']} ({anomaly['deviation']:+.1f}%, z={anomaly['z_score']:+.2f})"
            )

    if data.get("patterns"):
        lines.append("\nMUSTER:")
        for pattern in data["patterns"][:4]:
            lines.append(
                f"  {pattern['title']}: {pattern['evidence']} Score {pattern['score']}/100. Aktion: {pattern['action']}"
            )

    if data.get("deviations"):
        lines.append("\nABWEICHUNGEN:")
        for deviation in data["deviations"][:4]:
            compare = deviation.get("compare", {})
            lines.append(
                f"  {deviation['title']}: heute vs 7d {compare.get('today_vs_7d', 0):+.1f}%, vs 30d {compare.get('today_vs_30d', 0):+.1f}%, vs 90d {compare.get('today_vs_90d', 0):+.1f}%. Prioritaet: {deviation['priority']}"
            )

    return "\n".join(lines)


def _format_snapshot_block(snapshot: dict, label: str) -> str:
    if not snapshot:
        return f"{label}: Keine Daten"

    revenue = snapshot.get("revenue", {})
    traffic = snapshot.get("traffic", {})
    conversion_rate = snapshot.get("conversion_rate", {})
    new_customers = snapshot.get("new_customers", {})
    aov = snapshot.get("aov", {})
    revenue_per_visit = snapshot.get("revenue_per_visit", {})
    customer_capture_rate = snapshot.get("customer_capture_rate", {})
    weekday = snapshot.get("weekday_pattern", {})

    return (
        f"{label} ({snapshot.get('days', 0)} Tage):\n"
        f"  Umsatz: O EUR{revenue.get('avg', 0):.2f}/Tag, Gesamt EUR{revenue.get('total', 0):.2f}, Trend {revenue.get('trend_pct', 0):+.1f}%, Volatilitaet {revenue.get('volatility', 0):.1f}%\n"
        f"  Traffic: O {traffic.get('avg', 0):.1f}/Tag, Trend {traffic.get('trend_pct', 0):+.1f}%\n"
        f"  Conv.Rate: O {conversion_rate.get('avg', 0):.2f}%, Min {conversion_rate.get('min', 0):.2f}%, Max {conversion_rate.get('max', 0):.2f}%\n"
        f"  Neue Kunden: O {new_customers.get('avg', 0):.2f}/Tag, Trend {new_customers.get('trend_pct', 0):+.1f}%\n"
        f"  Effizienz: EUR{revenue_per_visit.get('avg', 0):.4f}/Visit, AOV EUR{aov.get('avg', 0):.2f}, Neukunden je Conversion {customer_capture_rate.get('avg', 0):.1f}%\n"
        f"  Wochentage: Stark {weekday.get('best_day_short', '?')} (O EUR{weekday.get('best_day_avg_revenue', 0):.2f}), Schwach {weekday.get('worst_day_short', '?')} (O EUR{weekday.get('worst_day_avg_revenue', 0):.2f}), Spread {weekday.get('spread_pct', 0):+.1f}%"
    )


def _task_stats(db: Session) -> dict:
    tasks = db.query(Task).all()
    today = date.today()
    return {
        "total": len(tasks),
        "open": len([task for task in tasks if task.status == "open"]),
        "in_progress": len([task for task in tasks if task.status == "in_progress"]),
        "done": len([task for task in tasks if task.status == "done"]),
        "high_open": len([task for task in tasks if task.priority == "high" and task.status != "done"]),
        "overdue": len([task for task in tasks if task.due_date and task.due_date < today and task.status != "done"]),
    }


def _pearson(a_values: list[float], b_values: list[float]) -> float:
    n = len(a_values)
    if n < 3:
        return 0.0
    mean_a = sum(a_values) / n
    mean_b = sum(b_values) / n
    numerator = sum((a_values[index] - mean_a) * (b_values[index] - mean_b) for index in range(n))
    denominator = (
        sum((value - mean_a) ** 2 for value in a_values) * sum((value - mean_b) ** 2 for value in b_values)
    ) ** 0.5
    return round(numerator / denominator, 3) if denominator else 0.0


def build_intlyst_dataset(db: Session) -> dict:
    rows_90 = get_daily_rows(db, 90)
    if not rows_90:
        today = date.today()
        return {
            "context": "=== INTLYST VOLLSTAENDIGE DATENANALYSE ===\n\nKeine Daten verfuegbar.",
            "has_data": False,
            "task_stats": _task_stats(db),
            "anomaly_count": 0,
            "period": f"{today} - {today}",
        }

    today = date.today()
    rows_30 = [row for row in rows_90 if (today - row.date).days <= 30]
    rows_7 = [row for row in rows_90 if (today - row.date).days <= 7]
    goals = db.query(Goal).all()

    snapshot_7 = build_metric_snapshot(rows_7, goals)
    snapshot_30 = build_metric_snapshot(rows_30, goals)
    snapshot_90 = build_metric_snapshot(rows_90, goals)
    task_stats = _task_stats(db)
    anomalies = snapshot_90.get("anomalies", [])

    goal_lines = []
    for goal in snapshot_30.get("goals", []):
        goal_lines.append(
            f"  {goal['metric']}: Ziel {goal['target']:.2f}, Aktuell {goal['current']:.2f} ({goal['progress_pct']}%) - {'auf Kurs' if goal['on_track'] else 'hinter Plan'}"
        )

    correlations: list[str] = []
    if len(rows_30) > 7:
        revenue_values = [to_float(row.revenue) for row in rows_30]
        traffic_values = [to_float(row.traffic) for row in rows_30]
        conversion_values = [to_float(row.conversion_rate) for row in rows_30]
        revenue_to_traffic = _pearson(revenue_values, traffic_values)
        traffic_to_conversion = _pearson(traffic_values, conversion_values)
        correlations.append(
            f"  Umsatz <-> Traffic: r={revenue_to_traffic} ({'stark' if abs(revenue_to_traffic) > 0.7 else 'mittel' if abs(revenue_to_traffic) > 0.4 else 'schwach'})"
        )
        correlations.append(
            f"  Traffic <-> Conv.Rate: r={traffic_to_conversion} ({'stark' if abs(traffic_to_conversion) > 0.7 else 'mittel' if abs(traffic_to_conversion) > 0.4 else 'schwach'})"
        )

    parts = [
        "=== INTLYST VOLLSTAENDIGE DATENANALYSE ===",
        "",
        _format_snapshot_block(snapshot_7, "LETZTE 7 TAGE"),
        "",
        _format_snapshot_block(snapshot_30, "LETZTE 30 TAGE"),
        "",
        _format_snapshot_block(snapshot_90, "LETZTE 90 TAGE"),
    ]

    if anomalies:
        parts += ["", "ANOMALIEN (z-Score in letzter Woche):"]
        for anomaly in anomalies[:6]:
            parts.append(
                f"  {anomaly['date']}: {anomaly['metric']} {anomaly['value']:.2f} ({anomaly['deviation']:+.1f}% vs O {anomaly['avg']:.2f}, z={anomaly['z_score']:+.2f})"
            )

    if goal_lines:
        parts += ["", "ZIELE:"] + goal_lines

    parts += [
        "",
        "TASK-SYSTEM:",
        f"  Gesamt: {task_stats['total']} | Offen: {task_stats['open']} | In Arbeit: {task_stats['in_progress']} | Erledigt: {task_stats['done']}",
        f"  Dringende offene Tasks: {task_stats['high_open']}",
        f"  Ueberfaellig: {task_stats['overdue']}",
    ]

    if correlations:
        parts += ["", "KORRELATIONEN (30 Tage):"] + correlations

    return {
        "context": "\n".join(parts),
        "has_data": True,
        "task_stats": task_stats,
        "anomaly_count": len(anomalies),
        "period": snapshot_90.get("period", f"{today} - {today}"),
        "snapshots": {"7d": snapshot_7, "30d": snapshot_30, "90d": snapshot_90},
    }
