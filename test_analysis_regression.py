"""Regression tests for analysis quality and filtering. Run: python test_analysis_regression.py"""

from datetime import date, timedelta
import sys

from api import ai_routes, intlyst_routes
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from services.analysis_service import build_metric_snapshot, score_insight_quality, score_recommendation_quality


PASS: list[str] = []
FAIL: list[str] = []


def ok(name: str, detail: object = "") -> None:
    detail_text = str(detail) if detail != "" else ""
    PASS.append(name)
    print(f"  [OK] {name}" + (f" -> {detail_text}" if detail_text else ""))


def fail(name: str, detail: object = "") -> None:
    detail_text = str(detail) if detail != "" else ""
    FAIL.append(name)
    print(f"  [FAIL] {name}" + (f" -> {detail_text}" if detail_text else ""))


def section(title: str) -> None:
    line = "-" * 60
    print(f"\n{line}\n  {title}\n{line}")


def build_rows() -> list[DailyMetrics]:
    rows: list[DailyMetrics] = []
    start = date.today() - timedelta(days=29)
    for offset in range(30):
        current = start + timedelta(days=offset)
        base_traffic = 260 + offset * 5
        weekend_boost = 120 if current.weekday() in (4, 5) else 0
        revenue = 900 + offset * 22 + weekend_boost
        conversions = 12 + (offset % 4)
        if offset >= 23:
            conversion_rate = 0.024
        elif offset >= 15:
            conversion_rate = 0.028
        else:
            conversion_rate = 0.031
        rows.append(
            DailyMetrics(
                date=current,
                period="daily",
                revenue=float(revenue),
                traffic=int(base_traffic + weekend_boost),
                conversions=int(conversions),
                conversion_rate=float(conversion_rate),
                new_customers=int(max(3, conversions - 2)),
            )
        )
    return rows


def build_snapshot() -> dict:
    goals = [
        Goal(metric="revenue", target_value=45000, period="monthly", start_date=date.today() - timedelta(days=29), end_date=date.today()),
        Goal(metric="conversion_rate", target_value=3.2, period="monthly", start_date=date.today() - timedelta(days=29), end_date=date.today()),
    ]
    return build_metric_snapshot(build_rows(), goals)


def check(condition: bool, name: str, detail: object = "") -> None:
    if condition:
        ok(name, detail)
    else:
        fail(name, detail)


section("1) Snapshot generation")
snapshot = build_snapshot()
check(snapshot.get("days") == 30, "snapshot days", snapshot.get("days"))
check(bool(snapshot.get("revenue")), "snapshot revenue present")
check(snapshot.get("week_over_week", 0) > 0, "week over week positive", snapshot.get("week_over_week"))
check(snapshot.get("weekday_pattern", {}).get("spread_pct", 0) > 0, "weekday spread detected", snapshot.get("weekday_pattern", {}).get("spread_pct"))
check(len(snapshot.get("goals", [])) == 2, "goals included", len(snapshot.get("goals", [])))


section("2) Quality scoring")
strong_insight = {
    "id": "mobile-conversion-drop",
    "type": "weakness",
    "title": "Mobile Conversion bricht ein",
    "description": "Die Conversion Rate fiel in den letzten 7 Tagen von 3.1% auf 2.4% bei weiter steigendem Traffic. Das deutet auf Reibung im mobilen Checkout statt auf Nachfrageverlust hin.",
    "evidence": "Conversion Rate -0.7 Prozentpunkte bei 10.4k Visits",
    "action": "Mobilen Checkout priorisiert pruefen und die zwei groessten Drop-offs diese Woche beseitigen.",
    "impact": "high",
    "impact_pct": 14.0,
    "segment": "mobile",
    "confidence": 84,
}
weak_insight = {
    "id": "generic-insight",
    "type": "opportunity",
    "title": "Mehr testen",
    "description": "Man koennte eventuell etwas verbessern.",
    "evidence": "Gefuehl",
    "action": "testen",
    "impact": "low",
    "impact_pct": 2.0,
    "segment": None,
    "confidence": 52,
}
strong_recommendation = {
    "id": "fix-mobile-checkout",
    "title": "Mobile Checkout optimieren",
    "description": "Beseitige die groessten Reibungspunkte im mobilen Checkout mit hohem Volumen.",
    "rationale": "Bei 10.4k Visits sank die Conversion Rate von 3.1% auf 2.4%, waehrend Traffic und Umsatz pro Visit nicht im selben Ausmass fielen.",
    "expected_result": "+0.4 bis +0.7 Prozentpunkte Conversion in 14 Tagen",
    "impact_pct": 16.0,
    "effort": "medium",
    "priority": "high",
    "category": "product",
    "timeframe": "this_week",
    "action_label": "Checkout fixen",
}
weak_recommendation = {
    "id": "generic-recommendation",
    "title": "Mehr Marketing",
    "description": "Marketing verbessern.",
    "rationale": "Wir sollten das versuchen.",
    "expected_result": "Vielleicht besser.",
    "impact_pct": 1.0,
    "effort": "low",
    "priority": "low",
    "category": "marketing",
    "timeframe": "this_month",
    "action_label": "Starten",
}

scored_insight = score_insight_quality(strong_insight, snapshot)
scored_recommendation = score_recommendation_quality(strong_recommendation, snapshot)
check(scored_insight.get("quality_score", 0) >= 70, "strong insight quality", scored_insight.get("quality_score"))
check(scored_recommendation.get("quality_score", 0) >= 70, "strong recommendation quality", scored_recommendation.get("quality_score"))


section("3) AI validator regression")
validated_insights = ai_routes._validated_insights(
    [ai_routes.Insight(**strong_insight), ai_routes.Insight(**weak_insight)],
    snapshot,
)
validated_recommendations = ai_routes._validated_recommendations(
    [
        ai_routes.RecommendationItem(**strong_recommendation),
        ai_routes.RecommendationItem(**weak_recommendation),
    ],
    snapshot,
)
check(len(validated_insights) == 1, "weak insight filtered", len(validated_insights))
check((validated_insights[0].quality_score or 0) >= 70, "validated insight keeps score", validated_insights[0].quality_score if validated_insights else None)
check(len(validated_recommendations) == 1, "weak recommendation filtered", len(validated_recommendations))
check((validated_recommendations[0].quality_score or 0) >= 70, "validated recommendation keeps score", validated_recommendations[0].quality_score if validated_recommendations else None)


section("4) Intlyst validator regression")
strong_alert = {
    "id": "alert-conversion",
    "type": "warning",
    "title": "Conversion faellt deutlich",
    "description": "Die Conversion Rate liegt 0.7 Prozentpunkte unter dem vorherigen 7-Tage-Niveau, obwohl Traffic um 8.4% zulegte.",
    "metric": "conversion_rate",
    "current_value": 2.4,
    "threshold": 3.1,
    "deviation_pct": -22.6,
    "priority": "high",
    "action": "Checkout-Friction auf Mobile sofort pruefen und kritische Schritte reparieren.",
    "auto_task": True,
}
weak_alert = {
    "id": "alert-generic",
    "type": "info",
    "title": "Etwas ist anders",
    "description": "Bitte mal anschauen.",
    "metric": "revenue",
    "current_value": 0,
    "threshold": 0,
    "deviation_pct": 0,
    "priority": "low",
    "action": "pruefen",
    "auto_task": False,
}
strong_pattern = {
    "id": "pattern-weekday",
    "type": "cycle",
    "title": "Freitag ist Umsatztreiber",
    "description": "Freitag liefert im 30-Tage-Schnitt deutlich mehr Umsatz als Dienstag, die Spreizung liegt ueber 20%.",
    "metrics": ["revenue", "weekday_pattern"],
    "confidence": 82,
    "implication": "Kampagnen und Promotions sollten auf den Freitag konzentriert werden.",
}
weak_pattern = {
    "id": "pattern-generic",
    "type": "trend",
    "title": "Trend",
    "description": "Koennte interessant sein.",
    "metrics": [],
    "confidence": 40,
    "implication": "Beobachten.",
}
strong_automation = {
    "id": "automation-drop-alert",
    "title": "Checkout Drop-off Alarm",
    "description": "Wenn die mobile Conversion Rate stark faellt, soll ein Alarm und eine Task-Erstellung ausgelost werden.",
    "trigger": "Mobile Conversion Rate faellt 3 Tage in Folge unter 2.5%",
    "action": "Alert an Growth senden und High-Priority-Task fuer Checkout-Review anlegen",
    "expected_saving": "30 Minuten Reaktionszeit pro Vorfall",
    "complexity": "medium",
}
weak_automation = {
    "id": "automation-generic",
    "title": "Automation",
    "description": "Etwas automatisieren.",
    "trigger": "wenn etwas passiert",
    "action": "machen",
    "expected_saving": "",
    "complexity": "low",
}

validated_alerts = intlyst_routes._validated_alerts([strong_alert, weak_alert], snapshot)
validated_intlyst_recommendations = intlyst_routes._validated_intlyst_recommendations(
    [
        {
            **strong_recommendation,
            "expected_effect": strong_recommendation["expected_result"],
            "auto_task_title": "Mobile Checkout reparieren",
            "kpi_affected": ["revenue", "conversion_rate"],
        },
        {
            **weak_recommendation,
            "expected_effect": weak_recommendation["expected_result"],
            "auto_task_title": "Mehr Marketing",
            "kpi_affected": ["revenue"],
        },
    ],
    snapshot,
)
validated_patterns = intlyst_routes._validated_patterns([strong_pattern, weak_pattern], snapshot)
validated_automations = intlyst_routes._validated_automations([strong_automation, weak_automation], snapshot)

check(len(validated_alerts) == 1, "weak alert filtered", len(validated_alerts))
check(int(validated_alerts[0].get("quality_score", 0)) >= 58, "alert has quality score", validated_alerts[0].get("quality_score") if validated_alerts else None)
check(len(validated_intlyst_recommendations) == 1, "weak intlyst recommendation filtered", len(validated_intlyst_recommendations))
check(len(validated_patterns) == 1, "weak pattern filtered", len(validated_patterns))
check(len(validated_automations) == 1, "weak automation filtered", len(validated_automations))


print("\n" + "=" * 60)
total = len(PASS) + len(FAIL)
print(f"  Result: {len(PASS)}/{total} checks passed")
print("=" * 60)
if FAIL:
    for name in FAIL:
        print(f"   - {name}")
    sys.exit(1)
print("\n  Analysis regression checks completed successfully.\n")
sys.exit(0)