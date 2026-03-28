from typing import Dict, Any


def generate_alerts(growth: Dict[str, Any]) -> Dict[str, Any]:
    revenue_growth = float(growth.get("revenue_growth", 0.0) or 0.0)
    traffic_growth = float(growth.get("traffic_growth", 0.0) or 0.0)

    if revenue_growth < -0.1:
        status = "critical"
        message = "Revenue has dropped significantly. Immediate action required."
    elif traffic_growth < -0.1:
        status = "warning"
        message = "Traffic is declining. Review acquisition channels."
    else:
        status = "success"
        message = "Performance is stable; keep monitoring growth metrics."

    return {
        "status": status,
        "message": message,
        "revenue_growth": round(revenue_growth, 4),
        "traffic_growth": round(traffic_growth, 4),
    }
