from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from api.auth_routes import User, get_current_user, get_current_workspace_id
from api.role_guards import require_member_or_above
from services.relationship_service import get_goal_kpi_ids, sync_goal_kpi_links

router = APIRouter(prefix="/api/goals", tags=["goals"])

VALID_METRICS = {"revenue", "traffic", "conversions", "conversion_rate", "new_customers"}


class GoalCreate(BaseModel):
    metric: str
    target_value: float
    period: str = "monthly"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    linked_kpi_ids: Optional[list[int]] = None


class GoalResponse(BaseModel):
    id: int
    workspace_id: int
    metric: str
    target_value: float
    period: str
    start_date: date
    end_date: date
    linked_kpi_ids: list[int] = Field(default_factory=list)

    class Config:
        from_attributes = True


class GoalProgress(BaseModel):
    id: int
    workspace_id: int
    metric: str
    target_value: float
    current_value: float
    progress_pct: float
    remaining: float
    on_track: bool
    period: str
    end_date: date
    linked_kpi_ids: list[int] = Field(default_factory=list)


def get_current_value(metric: str, start_date: date, end_date: date, db: Session, workspace_id: int) -> float:
    rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= start_date,
            DailyMetrics.date <= end_date,
        )
        .all()
    )

    if not rows:
        return 0.0

    if metric == "revenue":
        return round(sum(float(r.revenue or 0.0) for r in rows), 2)
    if metric == "traffic":
        return float(sum(int(r.traffic or 0) for r in rows))
    if metric == "conversions":
        return float(sum(int(r.conversions or 0) for r in rows))
    if metric == "new_customers":
        return float(sum(int(r.new_customers or 0) for r in rows))
    if metric == "conversion_rate":
        rates = [float(r.conversion_rate) for r in rows if r.conversion_rate is not None]
        return round(sum(rates) / len(rates), 4) if rates else 0.0
    return 0.0


@router.post("", response_model=GoalResponse)
def create_goal(
    goal: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    if goal.metric not in VALID_METRICS:
        raise HTTPException(status_code=400, detail=f"Metrik muss eine von {VALID_METRICS} sein.")

    if goal.period not in {"monthly", "weekly"}:
        raise HTTPException(status_code=400, detail="Period muss 'monthly' oder 'weekly' sein.")

    start = goal.start_date or date.today().replace(day=1)
    if goal.end_date:
        end = goal.end_date
    elif goal.period == "monthly":
        next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        end = next_month - timedelta(days=1)
    else:
        end = start + timedelta(days=6)

    entry = Goal(
        workspace_id=workspace_id,
        metric=goal.metric,
        target_value=goal.target_value,
        period=goal.period,
        start_date=start,
        end_date=end,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    linked_kpi_ids = sync_goal_kpi_links(db, workspace_id, entry.id, goal.linked_kpi_ids or [])
    db.commit()
    return GoalResponse(
        id=entry.id,
        workspace_id=entry.workspace_id,
        metric=entry.metric,
        target_value=entry.target_value,
        period=entry.period,
        start_date=entry.start_date,
        end_date=entry.end_date,
        linked_kpi_ids=linked_kpi_ids,
    )


@router.get("", response_model=list[GoalResponse])
def get_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    goals = (
        db.query(Goal)
        .filter(Goal.workspace_id == workspace_id)
        .order_by(desc(Goal.created_at))
        .all()
    )
    return [
        GoalResponse(
            id=goal.id,
            workspace_id=goal.workspace_id,
            metric=goal.metric,
            target_value=goal.target_value,
            period=goal.period,
            start_date=goal.start_date,
            end_date=goal.end_date,
            linked_kpi_ids=get_goal_kpi_ids(db, workspace_id, goal.id),
        )
        for goal in goals
    ]


@router.get("/progress", response_model=list[GoalProgress])
def get_goals_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    goals = db.query(Goal).filter(Goal.workspace_id == workspace_id).all()
    result = []

    for g in goals:
        current = get_current_value(g.metric, g.start_date, g.end_date, db, workspace_id)
        progress_pct = round((current / g.target_value) * 100, 1) if g.target_value else 0.0
        remaining = round(g.target_value - current, 2)
        on_track = progress_pct >= 80.0

        result.append(
            GoalProgress(
                id=g.id,
                workspace_id=g.workspace_id,
                metric=g.metric,
                target_value=g.target_value,
                current_value=round(current, 2),
                progress_pct=progress_pct,
                remaining=remaining,
                on_track=on_track,
                period=g.period,
                end_date=g.end_date,
                linked_kpi_ids=get_goal_kpi_ids(db, workspace_id, g.id),
            )
        )

    return result


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_member_or_above),
    workspace_id: int = Depends(get_current_workspace_id),
):
    goal = db.query(Goal).filter(Goal.workspace_id == workspace_id, Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Ziel nicht gefunden.")
    db.delete(goal)
    db.commit()
    return {"message": "Ziel geloescht."}
