"""
KPI Monitor Service — background task checking for critical revenue drops.

Runs daily. If revenue dropped >10% over the last 7 days compared to the previous 7 days,
a critical alert (Notification) is created in the workspace.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models.daily_metrics import DailyMetrics
from models.notification import Notification


def _avg_revenue(rows: list) -> float:
    values = [getattr(r, "revenue", None) or 0.0 for r in rows]
    return sum(values) / len(values) if values else 0.0


def check_revenue_drop(db: Session, workspace_id: int) -> Optional[dict]:
    """Check if revenue dropped >10% in the last 7 days vs. the previous 7 days.

    Returns a dict with details if a drop is detected, None otherwise.
    """
    today = date.today()
    period_end = today - timedelta(days=1)          # yesterday
    period_start = period_end - timedelta(days=6)   # 7 days window
    prev_end = period_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=6)

    recent_rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= period_start,
            DailyMetrics.date <= period_end,
        )
        .all()
    )
    prev_rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= prev_start,
            DailyMetrics.date <= prev_end,
        )
        .all()
    )

    if not recent_rows or not prev_rows:
        return None

    recent_avg = _avg_revenue(recent_rows)
    prev_avg = _avg_revenue(prev_rows)

    if prev_avg <= 0:
        return None

    change_pct = (recent_avg - prev_avg) / prev_avg * 100

    if change_pct <= -10.0:
        return {
            "workspace_id": workspace_id,
            "recent_avg_revenue": round(recent_avg, 2),
            "prev_avg_revenue": round(prev_avg, 2),
            "change_pct": round(change_pct, 2),
            "period_start": str(period_start),
            "period_end": str(period_end),
        }
    return None


def _already_alerted_today(db: Session, workspace_id: int) -> bool:
    """Prevent duplicate alerts on the same calendar day."""
    today_start = datetime.combine(date.today(), datetime.min.time())
    existing = (
        db.query(Notification)
        .filter(
            Notification.workspace_id == workspace_id,
            Notification.type == "alert",
            Notification.title.like("Kritischer Umsatzrückgang%"),
            Notification.created_at >= today_start,
        )
        .first()
    )
    return existing is not None


def run_kpi_monitor_for_workspace(db: Session, workspace_id: int) -> bool:
    """Run the KPI monitor for a single workspace. Returns True if alert was created."""
    if _already_alerted_today(db, workspace_id):
        return False

    drop = check_revenue_drop(db, workspace_id)
    if not drop:
        return False

    notif = Notification(
        workspace_id=workspace_id,
        title=f"Kritischer Umsatzrückgang: {drop['change_pct']:.1f}% in 7 Tagen",
        message=(
            f"Umsatz fiel von Ø {drop['prev_avg_revenue']:,.0f} € auf Ø {drop['recent_avg_revenue']:,.0f} € "
            f"({drop['change_pct']:.1f}%). Zeitraum: {drop['period_start']} – {drop['period_end']}. "
            "Sofortiger Handlungsbedarf."
        ),
        type="alert",
        is_read=False,
        created_at=datetime.utcnow(),
    )
    db.add(notif)
    db.commit()
    return True


def run_kpi_monitor_all_workspaces(db: Session) -> dict:
    """Run the KPI monitor across all workspaces. Returns summary stats."""
    from models.user import Workspace
    workspaces = db.query(Workspace).all()
    alerts_created = 0
    for ws in workspaces:
        if run_kpi_monitor_for_workspace(db, ws.id):
            alerts_created += 1
    return {"workspaces_checked": len(workspaces), "alerts_created": alerts_created}
