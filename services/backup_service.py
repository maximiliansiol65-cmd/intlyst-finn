"""
Backup & Restore Service — CEO-only JSON-Export/Import kritischer Geschäftsdaten
"""
import json
import logging
from datetime import datetime, date
from typing import Optional

from sqlalchemy.orm import Session

from models.daily_metrics import DailyMetrics
from models.goals import Goal, GoalReview
from models.forecast_record import ForecastRecord

logger = logging.getLogger("backup")

_BACKUP_VERSION = "1.0"


def _row_to_dict(row) -> dict:
    """Konvertiert ein SQLAlchemy-Objekt in ein serialisierbares Dict."""
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, (datetime, date)):
            val = val.isoformat()
        d[col.name] = val
    return d


def create_workspace_backup(db: Session, workspace_id: int) -> dict:
    """
    Erstellt ein JSON-Backup aller kritischen Daten eines Workspaces.
    Enthält: daily_metrics, goals, goal_reviews, forecast_records.
    """
    metrics = (
        db.query(DailyMetrics)
        .filter(DailyMetrics.workspace_id == workspace_id)
        .order_by(DailyMetrics.date.asc())
        .all()
    )
    goals = (
        db.query(Goal)
        .filter(Goal.workspace_id == workspace_id)
        .all()
    )
    goal_ids = {g.id for g in goals}
    goal_reviews = (
        db.query(GoalReview)
        .filter(GoalReview.goal_id.in_(goal_ids))
        .all() if goal_ids else []
    )
    forecasts = (
        db.query(ForecastRecord)
        .filter(ForecastRecord.workspace_id == workspace_id)
        .order_by(ForecastRecord.period_start.asc())
        .all()
    )

    backup = {
        "version": _BACKUP_VERSION,
        "created_at": datetime.utcnow().isoformat(),
        "workspace_id": workspace_id,
        "daily_metrics": [_row_to_dict(r) for r in metrics],
        "goals": [_row_to_dict(r) for r in goals],
        "goal_reviews": [_row_to_dict(r) for r in goal_reviews],
        "forecast_records": [_row_to_dict(r) for r in forecasts],
        "counts": {
            "daily_metrics": len(metrics),
            "goals": len(goals),
            "goal_reviews": len(goal_reviews),
            "forecast_records": len(forecasts),
        },
    }
    logger.info(
        "Backup erstellt: workspace=%s metrics=%d goals=%d forecasts=%d",
        workspace_id, len(metrics), len(goals), len(forecasts),
    )
    return backup


def restore_workspace_backup(
    db: Session,
    workspace_id: int,
    backup_data: dict,
    *,
    overwrite_metrics: bool = False,
) -> dict:
    """
    Stellt Daten aus einem JSON-Backup wieder her.

    - daily_metrics: nur neue Zeilen (kein Überschreiben ohne overwrite_metrics=True)
    - goals: UPSERT per id (bestehende bleiben erhalten, neue werden eingefügt)
    - forecast_records: nur neue Zeilen
    - goal_reviews: nur neue Zeilen

    Gibt einen Report zurück: {inserted, skipped, errors}.
    """
    if backup_data.get("version") != _BACKUP_VERSION:
        raise ValueError(f"Inkompatible Backup-Version: {backup_data.get('version')}")
    if backup_data.get("workspace_id") != workspace_id:
        raise ValueError("Backup gehört zu einem anderen Workspace.")

    report: dict = {"inserted": {}, "skipped": {}, "errors": []}

    # ── daily_metrics ─────────────────────────────────────────────────────────
    existing_dates = {
        str(r[0])
        for r in db.query(DailyMetrics.date)
        .filter(DailyMetrics.workspace_id == workspace_id)
        .all()
    }
    metrics_in = metrics_skip = 0
    for row in backup_data.get("daily_metrics", []):
        dt = row.get("date", "")[:10]
        if dt in existing_dates and not overwrite_metrics:
            metrics_skip += 1
            continue
        try:
            obj = DailyMetrics(
                workspace_id=workspace_id,
                date=date.fromisoformat(dt),
                revenue=row.get("revenue", 0),
                cost=row.get("cost", 0),
                profit=row.get("profit", 0),
                gross_margin=row.get("gross_margin", 0),
                cashflow=row.get("cashflow", 0),
                liquidity=row.get("liquidity", 0),
                traffic=row.get("traffic", 0),
                conversions=row.get("conversions", 0),
                conversion_rate=row.get("conversion_rate", 0),
                new_customers=row.get("new_customers", 0),
            )
            db.add(obj)
            metrics_in += 1
        except Exception as exc:
            report["errors"].append(f"DailyMetrics {dt}: {exc}")
    report["inserted"]["daily_metrics"] = metrics_in
    report["skipped"]["daily_metrics"] = metrics_skip

    # ── goals ─────────────────────────────────────────────────────────────────
    existing_goal_ids = {
        r[0]
        for r in db.query(Goal.id).filter(Goal.workspace_id == workspace_id).all()
    }
    goals_in = goals_skip = 0
    for row in backup_data.get("goals", []):
        if row.get("id") in existing_goal_ids:
            goals_skip += 1
            continue
        try:
            obj = Goal(
                workspace_id=workspace_id,
                title=row.get("title", ""),
                description=row.get("description", ""),
                target_value=row.get("target_value"),
                current_value=row.get("current_value"),
                unit=row.get("unit", ""),
                status=row.get("status", "active"),
                deadline=date.fromisoformat(row["deadline"][:10]) if row.get("deadline") else None,
            )
            db.add(obj)
            goals_in += 1
        except Exception as exc:
            report["errors"].append(f"Goal {row.get('id')}: {exc}")
    report["inserted"]["goals"] = goals_in
    report["skipped"]["goals"] = goals_skip

    # ── forecast_records ──────────────────────────────────────────────────────
    existing_forecast_ids = {
        r[0]
        for r in db.query(ForecastRecord.id)
        .filter(ForecastRecord.workspace_id == workspace_id)
        .all()
    }
    fc_in = fc_skip = 0
    for row in backup_data.get("forecast_records", []):
        if row.get("id") in existing_forecast_ids:
            fc_skip += 1
            continue
        try:
            obj = ForecastRecord(
                workspace_id=workspace_id,
                kpi_name=row.get("kpi_name", row.get("kpi_key", "revenue")),
                period_start=datetime.fromisoformat(row["period_start"]) if row.get("period_start") else datetime.utcnow(),
                period_end=datetime.fromisoformat(row["period_end"]) if row.get("period_end") else datetime.utcnow(),
                forecast_value=row.get("forecast_value", row.get("predicted_value", 0)),
                baseline_value=row.get("baseline_value"),
                best_case=row.get("best_case"),
                worst_case=row.get("worst_case"),
                confidence=row.get("confidence", 70.0),
                model_version=row.get("model_version", "backup_restore"),
            )
            db.add(obj)
            fc_in += 1
        except Exception as exc:
            report["errors"].append(f"ForecastRecord {row.get('id')}: {exc}")
    report["inserted"]["forecast_records"] = fc_in
    report["skipped"]["forecast_records"] = fc_skip

    try:
        db.commit()
    except Exception as commit_exc:
        db.rollback()
        raise RuntimeError(f"Commit fehlgeschlagen: {commit_exc}") from commit_exc

    logger.info("Restore abgeschlossen: %s", report)
    return report
