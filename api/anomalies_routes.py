from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from models.daily_metrics import DailyMetrics
from models.notification import Notification

router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])

METRIC_LABELS = {
    "revenue":         "Umsatz",
    "traffic":         "Traffic",
    "conversions":     "Conversions",
    "conversion_rate": "Conversion Rate",
    "new_customers":   "Neue Kunden",
}

# Severity-aware suggestions (AI-ready context)
SUGGESTIONS: dict[str, dict[str, str]] = {
    "revenue":         {"high": "Sofort Reaktivierungskampagne starten.", "medium": "Follow-up E-Mails für abgebrochene Käufe.", "low": "Trend 3 Tage beobachten."},
    "traffic":         {"high": "Prüfe ob Ads pausiert oder SEO gefallen.", "medium": "Analysiere welcher Kanal einbricht.", "low": "Weiter beobachten."},
    "conversions":     {"high": "Prüfe Checkout und Zahlungsanbieter.", "medium": "A/B Test für Landing Page starten.", "low": "Kein sofortiger Handlungsbedarf."},
    "conversion_rate": {"high": "Landing Page und CTA sofort prüfen.", "medium": "Nutzerverhalten analysieren.", "low": "Könnte saisonale Schwankung sein."},
    "new_customers":   {"high": "Akquisitions-Kampagne sofort aktivieren.", "medium": "Referral-Programm oder Erstbestellungsrabatt.", "low": "Trend beobachten."},
}


class Anomaly(BaseModel):
    metric: str
    metric_label: str
    severity: str          # high | medium | low
    current_value: float
    average_value: float
    deviation_pct: float
    description: str
    suggestion: str        # severity-aware, AI-ready


def _to_float(val, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _get_metric_values(rows, metric: str) -> list:
    return [_to_float(getattr(r, metric, 0)) for r in rows]


def _save_notifications(anomalies: list[Anomaly], db: Session) -> None:
    for a in anomalies:
        exists = (
            db.query(Notification)
            .filter(
                Notification.title == f"Anomalie: {a.metric_label}",
                Notification.is_read == False,  # noqa: E712
            )
            .first()
        )
        if not exists:
            db.add(Notification(
                title=f"Anomalie: {a.metric_label}",
                message=a.description,
                type="alert",
            ))
    db.commit()


@router.get("", response_model=list[Anomaly])
def get_anomalies(background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    yesterday_date = today - timedelta(days=1)

    rows = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= today - timedelta(days=14))
        .order_by(DailyMetrics.date)
        .all()
    )

    if len(rows) < 3:
        return []

    yesterday = next(
        (r for r in reversed(rows) if getattr(r, "date", None) == yesterday_date),
        rows[-1],
    )
    baseline_rows = [r for r in rows if getattr(r, "date", None) != getattr(yesterday, "date", None)]

    anomalies: list[Anomaly] = []

    for metric, label in METRIC_LABELS.items():
        baseline_vals = _get_metric_values(baseline_rows, metric)
        if not baseline_vals:
            continue

        avg = sum(baseline_vals) / len(baseline_vals)
        if avg == 0:
            continue

        current_vals = _get_metric_values([yesterday], metric)
        if not current_vals:
            continue

        current = current_vals[0]
        dev = round((current - avg) / avg * 100, 1)

        if dev >= -15:
            continue

        sev = "high" if dev <= -40 else "medium" if dev <= -25 else "low"
        sev_text = {"high": "starker Einbruch", "medium": "deutlicher Rückgang", "low": "leichter Rückgang"}[sev]

        anomalies.append(Anomaly(
            metric=metric,
            metric_label=label,
            severity=sev,
            current_value=round(current, 2),
            average_value=round(avg, 2),
            deviation_pct=dev,
            description=(
                f"{label} ist gestern um {abs(dev)}% unter den 14-Tage-Durchschnitt gefallen "
                f"({round(current, 1)} vs. Ø {round(avg, 1)}) — {sev_text}."
            ),
            suggestion=SUGGESTIONS.get(metric, {}).get(sev, "Situation beobachten."),
        ))

    anomalies.sort(key=lambda a: {"high": 0, "medium": 1, "low": 2}[a.severity])

    if anomalies:
        background_tasks.add_task(_save_notifications, anomalies, db)

    return anomalies