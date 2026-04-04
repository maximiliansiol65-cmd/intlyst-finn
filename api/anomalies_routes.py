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
    what_happened: str | None = None
    why_it_happened: str | None = None
    what_it_means: str | None = None
    what_to_do: str | None = None
    compare_7d_pct: float | None = None
    compare_30d_pct: float | None = None
    compare_avg_pct: float | None = None
    pattern_link: str | None = None
    business_priority: str | None = None


def _to_float(val, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def _get_metric_values(rows, metric: str) -> list:
    return [_to_float(getattr(r, metric, 0)) for r in rows]


def _pct_change(current: float, baseline: float) -> float:
    if not baseline:
        return 0.0
    return round((current - baseline) / baseline * 100, 1)


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
        .filter(DailyMetrics.period == "daily", DailyMetrics.date >= today - timedelta(days=35))
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
        latest_7_rows = baseline_rows[-7:]
        latest_30_rows = baseline_rows[-30:]
        vals_7 = _get_metric_values(latest_7_rows, metric)
        vals_30 = _get_metric_values(latest_30_rows, metric)
        baseline_vals = _get_metric_values(baseline_rows, metric)
        if not baseline_vals or not vals_7 or not vals_30:
            continue

        avg = sum(baseline_vals) / len(baseline_vals)
        avg_7 = sum(vals_7) / len(vals_7)
        avg_30 = sum(vals_30) / len(vals_30)
        if avg == 0 and avg_7 == 0 and avg_30 == 0:
            continue

        current_vals = _get_metric_values([yesterday], metric)
        if not current_vals:
            continue

        current = current_vals[0]
        dev = _pct_change(current, avg)
        dev_7 = _pct_change(current, avg_7)
        dev_30 = _pct_change(current, avg_30)
        largest_dev = max(abs(dev), abs(dev_7), abs(dev_30))

        if largest_dev < 15:
            continue

        direction = "up" if max(dev, dev_7, dev_30) > abs(min(dev, dev_7, dev_30)) else "down"
        sev = "high" if largest_dev >= 40 else "medium" if largest_dev >= 25 else "low"
        sev_text = {
            ("down", "high"): "starker Einbruch",
            ("down", "medium"): "deutlicher Rueckgang",
            ("down", "low"): "leichter Rueckgang",
            ("up", "high"): "starker Anstieg",
            ("up", "medium"): "deutlicher Anstieg",
            ("up", "low"): "leichter Anstieg",
        }[(direction, sev)]
        repeated = (
            (dev_7 <= -15 and dev_30 <= -15) or (dev_7 >= 15 and dev_30 >= 15)
        )
        what_happened = (
            f"{label} ist zuletzt deutlich gestiegen."
            if direction == "up"
            else f"{label} ist zuletzt deutlich gesunken."
        )
        why_it_happened = (
            "Die Abweichung ist gleichzeitig gegen 7 Tage, 30 Tage und den Durchschnitt sichtbar."
            if largest_dev >= 25
            else "Der aktuelle Wert liegt klar ausserhalb des normalen Bereichs."
        )
        what_it_means = (
            f"Das ist kurzfristig positiv, aber wir sollten pruefen, ob der Effekt wiederholbar ist."
            if direction == "up"
            else f"Das ist ein klares Warnsignal fuer die aktuelle Performance."
        )
        what_to_do = (
            f"Die Ursache fuer den Anstieg bei {label} isolieren und gezielt wiederholen."
            if direction == "up"
            else SUGGESTIONS.get(metric, {}).get(sev, "Situation beobachten.")
        )

        anomalies.append(Anomaly(
            metric=metric,
            metric_label=label,
            severity=sev,
            current_value=round(current, 2),
            average_value=round(avg, 2),
            deviation_pct=dev if abs(dev) >= max(abs(dev_7), abs(dev_30)) else (dev_7 if abs(dev_7) >= abs(dev_30) else dev_30),
            description=(
                f"{label} liegt aktuell bei {round(current, 1)} statt im Normalbereich von rund {round(avg, 1)} bis {round(avg_30, 1)} "
                f"und zeigt damit einen {sev_text}."
            ),
            suggestion=what_to_do,
            what_happened=what_happened,
            why_it_happened=why_it_happened,
            what_it_means=what_it_means,
            what_to_do=what_to_do,
            compare_7d_pct=dev_7,
            compare_30d_pct=dev_30,
            compare_avg_pct=dev,
            pattern_link=(
                "Das ist auch im 7- und 30-Tage-Vergleich sichtbar und wirkt deshalb wiederkehrend."
                if repeated
                else "Das wirkt aktuell eher wie ein einmaliger Ausreisser."
            ),
            business_priority="hoch" if sev == "high" else "mittel" if sev == "medium" else "niedrig",
        ))

    anomalies.sort(key=lambda a: {"high": 0, "medium": 1, "low": 2}[a.severity])

    if anomalies:
        background_tasks.add_task(_save_notifications, anomalies, db)

    return anomalies
