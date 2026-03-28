from typing import Any, Dict, List, Optional
import csv
from datetime import date
import math
from database import SessionLocal
from models.daily_metrics import DailyMetrics

_uploaded_data: List[Dict[str, Any]] = []
_MAX_SYNTHETIC_USERS = 2000


def _clamp_int(value: Any, minimum: int = 0, maximum: Optional[int] = None) -> int:
    try:
        num = int(float(value))
    except (TypeError, ValueError):
        return minimum
    if num < minimum:
        return minimum
    if maximum is not None and num > maximum:
        return maximum
    return num


def _clamp_float(value: Any, minimum: float = 0.0, maximum: Optional[float] = None) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return minimum
    if not math.isfinite(num):
        return minimum
    if num < minimum:
        return minimum
    if maximum is not None and num > maximum:
        return maximum
    return num


def _safe_divide(numerator: float, denominator: float) -> float:
    return float(numerator / denominator) if denominator and denominator > 0 else 0.0


def _determine_trend(value: float) -> str:
    if value > 0.05:
        return "up"
    if value < -0.05:
        return "down"
    return "stable"


def _get_age_segment(age: int) -> str:
    if 18 <= age <= 25:
        return "18-25"
    if 26 <= age <= 35:
        return "26-35"
    if 36 <= age <= 50:
        return "36-50"
    return "50+"


def _build_segments(data: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    segments: Dict[str, Dict[str, float]] = {
        "18-25": {"users": 0, "revenue": 0.0, "conversions": 0},
        "26-35": {"users": 0, "revenue": 0.0, "conversions": 0},
        "36-50": {"users": 0, "revenue": 0.0, "conversions": 0},
        "50+": {"users": 0, "revenue": 0.0, "conversions": 0},
    }
    for user in data:
        age = user.get("age")
        if age is None:
            continue
        segment = _get_age_segment(age)
        segments[segment]["users"] += 1
        segments[segment]["revenue"] += float(user.get("revenue", 0.0) or 0.0)
        if bool(user.get("converted", False)):
            segments[segment]["conversions"] += 1
    return segments


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    text = str(value).strip().lower()
    return text in {"true", "1", "yes", "y", "t"}


def parse_csv_data(content: bytes) -> List[Dict[str, Any]]:
    text = content.decode("utf-8", errors="replace")
    reader = csv.DictReader(text.splitlines())
    parsed_data: List[Dict[str, Any]] = []
    for row in reader:
        if not row:
            continue
        age = _clamp_int(row.get("age", 0), minimum=13, maximum=100)
        revenue = _clamp_float(row.get("revenue", 0.0), minimum=0.0, maximum=10_000_000.0)
        parsed_data.append(
            {
                "user_id": row.get("user_id"),
                "age": age,
                "revenue": revenue,
                "converted": _parse_bool(row.get("converted", "False")),
            }
        )
    return parsed_data


def set_uploaded_data(data: List[Dict[str, Any]]) -> None:
    global _uploaded_data
    sanitized: List[Dict[str, Any]] = []
    for item in data or []:
        sanitized.append(
            {
                "user_id": item.get("user_id"),
                "age": _clamp_int(item.get("age", 0), minimum=13, maximum=100),
                "revenue": _clamp_float(item.get("revenue", 0.0), minimum=0.0, maximum=10_000_000.0),
                "converted": _parse_bool(item.get("converted", False)),
            }
        )
    _uploaded_data = sanitized

    # Aggregate and save to database
    if sanitized:
        db = SessionLocal()
        try:
            # Compute aggregated metrics
            revenue = sum(float(item.get("revenue", 0.0) or 0.0) for item in sanitized)
            traffic = len(sanitized)
            conversions = sum(1 for item in sanitized if bool(item.get("converted", False)))
            conversions = min(conversions, traffic)
            conversion_rate = _safe_divide(conversions, traffic)
            new_customers = conversions  # Assuming conversions are new customers

            # Create or update daily metrics
            today = date.today()
            existing = db.query(DailyMetrics).filter_by(date=today, period="daily").first()
            if existing:
                existing.revenue = revenue
                existing.traffic = traffic
                existing.conversions = conversions
                existing.conversion_rate = conversion_rate
                existing.new_customers = new_customers
            else:
                metric = DailyMetrics(
                    date=today,
                    period="daily",
                    revenue=revenue,
                    traffic=traffic,
                    conversions=conversions,
                    conversion_rate=conversion_rate,
                    new_customers=new_customers
                )
                db.add(metric)
            db.commit()
        finally:
            db.close()


def get_uploaded_data() -> List[Dict[str, Any]]:
    return _uploaded_data


def _default_current_data() -> List[Dict[str, Any]]:
    return [
        {"user_id": 1, "age": 22, "revenue": 120.0, "converted": True},
        {"user_id": 2, "age": 29, "revenue": 95.0, "converted": False},
        {"user_id": 3, "age": 41, "revenue": 190.0, "converted": True},
        {"user_id": 4, "age": 35, "revenue": 150.0, "converted": True},
        {"user_id": 5, "age": 54, "revenue": 82.0, "converted": False},
        {"user_id": 6, "age": 27, "revenue": 74.0, "converted": False},
        {"user_id": 7, "age": 23, "revenue": 130.0, "converted": True},
        {"user_id": 8, "age": 48, "revenue": 210.0, "converted": True},
        {"user_id": 9, "age": 61, "revenue": 45.0, "converted": False},
        {"user_id": 10, "age": 34, "revenue": 105.0, "converted": True},
    ]


def _default_previous_data() -> List[Dict[str, Any]]:
    return [
        {"user_id": 11, "age": 24, "revenue": 95.0, "converted": True},
        {"user_id": 12, "age": 31, "revenue": 80.0, "converted": False},
        {"user_id": 13, "age": 45, "revenue": 170.0, "converted": True},
        {"user_id": 14, "age": 37, "revenue": 145.0, "converted": True},
        {"user_id": 15, "age": 52, "revenue": 65.0, "converted": False},
        {"user_id": 16, "age": 26, "revenue": 89.0, "converted": False},
        {"user_id": 17, "age": 21, "revenue": 105.0, "converted": True},
        {"user_id": 18, "age": 49, "revenue": 180.0, "converted": True},
        {"user_id": 19, "age": 58, "revenue": 55.0, "converted": False},
        {"user_id": 20, "age": 33, "revenue": 98.0, "converted": False},
    ]


def _get_current_data() -> List[Dict[str, Any]]:
    data = get_uploaded_data()
    return data if data else _default_current_data()


def compute_kpis(data: List[Dict[str, Any]], previous_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    revenue = sum(float(item.get("revenue", 0.0) or 0.0) for item in data)
    traffic = max(len(data), 0)
    conversions = sum(1 for item in data if bool(item.get("converted", False)))
    conversions = min(conversions, traffic)
    conversion_rate = _safe_divide(conversions, traffic)

    prev_revenue = sum(float(item.get("revenue", 0.0) or 0.0) for item in previous_data)
    prev_traffic = max(len(previous_data), 0)

    revenue_growth = _safe_divide(revenue - prev_revenue, prev_revenue)
    traffic_growth = _safe_divide(traffic - prev_traffic, prev_traffic)

    revenue_trend = _determine_trend(revenue_growth)
    traffic_trend = _determine_trend(traffic_growth)

    segments = _build_segments(data)
    age_distribution = [
        {"segment": segment, "users": values["users"]}
        for segment, values in segments.items()
    ]

    segment_performance = []
    for segment, values in segments.items():
        seg_users = int(values["users"])
        seg_conversions = int(values["conversions"])
        seg_conversion_rate = _safe_divide(seg_conversions, seg_users)
        segment_performance.append(
            {
                "segment": segment,
                "users": seg_users,
                "revenue": round(values["revenue"], 2),
                "conversions": seg_conversions,
                "conversion_rate": round(seg_conversion_rate, 4),
            }
        )

    insights = build_insights(segment_performance)

    return {
        "kpis": {
            "revenue": round(revenue, 2),
            "traffic": traffic,
            "conversions": conversions,
            "conversion_rate": round(conversion_rate, 4),
        },
        "growth": {
            "previous_revenue": round(prev_revenue, 2),
            "previous_traffic": prev_traffic,
            "revenue_growth": round(revenue_growth, 4),
            "traffic_growth": round(traffic_growth, 4),
        },
        "trends": {
            "revenue_trend": revenue_trend,
            "traffic_trend": traffic_trend,
        },
        "age_distribution": age_distribution,
        "segment_performance": segment_performance,
        "insights": insights,
    }


def build_insights(segment_performance: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not segment_performance:
        return []
    sorted_by_cr = sorted(segment_performance, key=lambda x: x.get("conversion_rate", 0.0), reverse=True)
    highest = sorted_by_cr[0]
    lowest = sorted_by_cr[-1]
    avg_traffic = _safe_divide(sum(s.get("users", 0) for s in segment_performance), len(segment_performance))
    opportunity = None
    for seg in segment_performance:
        if seg["users"] >= avg_traffic and seg["conversion_rate"] < 0.08:
            opportunity = seg
            break
    if opportunity is None:
        opportunity = sorted_by_cr[-2] if len(sorted_by_cr) > 1 else lowest
    return [
        {
            "type": "strength",
            "segment": highest["segment"],
            "title": f"Strong conversion in {highest['segment']}",
            "description": f"{highest['segment']} has the highest conversion rate ({highest['conversion_rate']:.2%}).",
            "recommendation": "Invest in retention and repeat engagement for this segment.",
            "impact": "high" if highest["users"] >= avg_traffic else "medium",
            "reasoning": f"This segment converts at {highest['conversion_rate']:.2%} with {highest['users']} users.",
        },
        {
            "type": "weakness",
            "segment": lowest["segment"],
            "title": f"Weak conversion in {lowest['segment']}",
            "description": f"{lowest['segment']} has the lowest conversion at {lowest['conversion_rate']:.2%}.",
            "recommendation": "Run targeted campaigns and landing page tests for this segment.",
            "impact": "high" if lowest["users"] >= avg_traffic else "medium",
            "reasoning": "This segment underperforms conversion compared to others.",
        },
        {
            "type": "opportunity",
            "segment": opportunity["segment"],
            "title": f"Opportunity in {opportunity['segment']}",
            "description": f"{opportunity['segment']} has high traffic ({opportunity['users']} users) but low conversion ({opportunity['conversion_rate']:.2%}).",
            "recommendation": "Improve targeting and offers for this segment.",
            "impact": "high" if opportunity["users"] >= avg_traffic * 1.2 or opportunity["conversion_rate"] < 0.05 else "medium",
            "reasoning": "This segment can deliver significant incremental growth.",
        },
    ]


def _expand_metrics_to_user_rows(metrics: DailyMetrics, user_prefix: str) -> List[Dict[str, Any]]:
    traffic = max(int(metrics.traffic or 0), 0)
    conversions = min(max(int(metrics.conversions or 0), 0), traffic)
    conversion_rate = _safe_divide(conversions, traffic)
    sample_traffic = min(traffic, _MAX_SYNTHETIC_USERS)
    sample_conversions = int(round(conversion_rate * sample_traffic))
    avg_revenue = float(metrics.revenue or 0.0) / max(traffic, 1)

    return [
        {
            "user_id": f"{user_prefix}_{i}",
            "age": 30,
            "revenue": avg_revenue,
            "converted": i < sample_conversions,
        }
        for i in range(sample_traffic)
    ]


def get_kpi_report() -> Dict[str, Any]:
    db = SessionLocal()
    try:
        latest_metrics = (
            db.query(DailyMetrics)
            .filter_by(period="daily")
            .order_by(DailyMetrics.date.desc())
            .limit(2)
            .all()
        )

        if latest_metrics:
            current = latest_metrics[0]
            previous = latest_metrics[1] if len(latest_metrics) > 1 else None

            current_traffic = max(int(current.traffic or 0), 0)
            current_conversions = min(max(int(current.conversions or 0), 0), current_traffic)
            current_revenue = float(current.revenue or 0.0)
            current_conversion_rate = _safe_divide(current_conversions, current_traffic)

            prev_traffic = max(int(previous.traffic or 0), 0) if previous else 0
            prev_conversions = min(max(int(previous.conversions or 0), 0), prev_traffic) if previous else 0
            prev_revenue = float(previous.revenue or 0.0) if previous else 0.0

            revenue_growth = _safe_divide(current_revenue - prev_revenue, prev_revenue)
            traffic_growth = _safe_divide(current_traffic - prev_traffic, prev_traffic)

            revenue_trend = _determine_trend(revenue_growth)
            traffic_trend = _determine_trend(traffic_growth)

            current_data = _expand_metrics_to_user_rows(current, "user")
            previous_data = _expand_metrics_to_user_rows(previous, "user_prev") if previous else _default_previous_data()
            segments = _build_segments(current_data)
            age_distribution = [
                {"segment": segment, "users": values["users"]}
                for segment, values in segments.items()
            ]
            segment_performance = []
            for segment, values in segments.items():
                seg_users = int(values["users"])
                seg_conversions = int(values["conversions"])
                seg_conversion_rate = _safe_divide(seg_conversions, seg_users)
                segment_performance.append(
                    {
                        "segment": segment,
                        "users": seg_users,
                        "revenue": round(values["revenue"], 2),
                        "conversions": seg_conversions,
                        "conversion_rate": round(seg_conversion_rate, 4),
                    }
                )
            insights = build_insights(segment_performance)

            return {
                "kpis": {
                    "revenue": round(current_revenue, 2),
                    "traffic": current_traffic,
                    "conversions": current_conversions,
                    "conversion_rate": round(current_conversion_rate, 4),
                },
                "growth": {
                    "previous_revenue": round(prev_revenue, 2),
                    "previous_traffic": prev_traffic,
                    "revenue_growth": round(revenue_growth, 4),
                    "traffic_growth": round(traffic_growth, 4),
                },
                "trends": {
                    "revenue_trend": revenue_trend,
                    "traffic_trend": traffic_trend,
                },
                "age_distribution": age_distribution,
                "segment_performance": segment_performance,
                "insights": insights,
            }

        current_period = _get_current_data()
        previous_period = _default_previous_data()
        return compute_kpis(current_period, previous_period)
    finally:
        db.close()
