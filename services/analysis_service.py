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
    rows = get_daily_rows(db, days)
    if not rows:
        return {}
    goals = db.query(Goal).all()
    return build_metric_snapshot(rows, goals)


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