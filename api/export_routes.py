from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.audit_logs_routes import record_audit_event
from api.auth_routes import User, get_current_user, get_current_workspace_id
from api.role_guards import MANAGER_ROLES, _get_workspace_role
from database import get_db
from models.daily_metrics import DailyMetrics

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/report")
def export_aggregated_report(
    days: int = Query(default=30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    role = _get_workspace_role(current_user, workspace_id, db)
    if role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Nur CEO/Manager-Rollen dürfen exportieren.")

    since = date.today() - timedelta(days=days)
    row = (
        db.query(
            func.count(DailyMetrics.id),
            func.sum(DailyMetrics.revenue),
            func.avg(DailyMetrics.revenue),
            func.sum(DailyMetrics.traffic),
            func.avg(DailyMetrics.conversion_rate),
            func.sum(DailyMetrics.new_customers),
        )
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.date >= since,
            DailyMetrics.period == "daily",
        )
        .first()
    )

    payload = {
        "workspace_id": workspace_id,
        "period_days": days,
        "from_date": str(since),
        "to_date": str(date.today()),
        "aggregate": {
            "rows": int(row[0] or 0),
            "revenue_total": float(row[1] or 0),
            "revenue_avg": float(row[2] or 0),
            "traffic_total": float(row[3] or 0),
            "conversion_rate_avg": float(row[4] or 0),
            "new_customers_total": float(row[5] or 0),
        },
        "privacy": {
            "contains_personal_data": False,
            "contains_user_ids": False,
            "contains_raw_events": False,
        },
    }

    record_audit_event(
        db,
        workspace_id,
        current_user.id,
        role,
        action="gdpr_aggregate_export",
        entity_type="export",
        metadata_json=f"days={days}",
    )
    return payload
