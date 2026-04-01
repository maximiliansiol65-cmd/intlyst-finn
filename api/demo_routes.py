from datetime import date, timedelta
from math import sin, pi

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from security_config import is_production_environment
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from models.notification import Notification
from models.task import Task

router = APIRouter(prefix="/api/dev", tags=["dev"])


@router.post("/seed-demo")
def seed_demo_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if is_production_environment(): raise HTTPException(status_code=403, detail="In Produktion nicht verfuegbar.")
    workspace_id = int(getattr(current_user, "active_workspace_id", 0) or 1)

    demo_notifications = [
        Notification(
            title="[DEMO] KPI-Alarm",
            message="Umsatz ist diese Woche um 8% gesunken.",
            type="alert",
            is_read=False,
        ),
        Notification(
            title="[DEMO] Empfehlung verfügbar",
            message="Starte eine Reaktivierungskampagne fuer Bestandskunden.",
            type="recommendation",
            is_read=False,
        ),
        Notification(
            title="[DEMO] Ziel-Update",
            message="Du hast 72% deines Monatsziels erreicht.",
            type="goal",
            is_read=True,
        ),
    ]

    today = date.today()
    demo_tasks = [
        Task(
            title="[DEMO] Checkout-Friction analysieren",
            description="Abbruchraten im Checkout fuer die letzten 14 Tage auswerten.",
            status="open",
            priority="high",
            assigned_to="Growth Team",
            due_date=today + timedelta(days=3),
        ),
        Task(
            title="[DEMO] Traffic-Experiment planen",
            description="Neue Landingpage fuer Kampagne A/B testen.",
            status="in_progress",
            priority="medium",
            assigned_to="Marketing",
            due_date=today + timedelta(days=5),
        ),
        Task(
            title="[DEMO] Referral-Programm vorbereiten",
            description="Incentive-Modell fuer Neukundengewinnung finalisieren.",
            status="done",
            priority="low",
            assigned_to="CRM",
            due_date=today - timedelta(days=1),
        ),
    ]

    # Replace only previous demo rows to keep user-created data untouched.
    deleted_notifications = (
        db.query(Notification)
        .filter(Notification.title.like("[DEMO]%"))
        .delete(synchronize_session=False)
    )
    deleted_tasks = db.query(Task).filter(Task.title.like("[DEMO]%")).delete(synchronize_session=False)

    db.add_all(demo_notifications)
    db.add_all(demo_tasks)

    # Historische Daily Metrics aufbauen (90 Tage), aber bestehende Daten nicht ueberschreiben.
    # So bekommt die AI-Analyse robuste Zeitreihen, ohne reale Daten zu verlieren.
    start_date = today - timedelta(days=89)
    created_metrics = 0
    skipped_metrics = 0
    for idx in range(90):
        day = start_date + timedelta(days=idx)
        existing = (
            db.query(DailyMetrics)
            .filter(
                DailyMetrics.workspace_id == workspace_id,
                DailyMetrics.date == day,
                DailyMetrics.period == "daily",
            )
            .first()
        )
        if existing:
            skipped_metrics += 1
            continue

        weekday_factor = 1.0 + (0.08 if day.weekday() in (1, 2, 3) else -0.05 if day.weekday() in (5, 6) else 0.0)
        trend = 1.0 + (idx * 0.0025)
        seasonality = 1.0 + 0.06 * sin((idx / 14.0) * 2 * pi)

        traffic = int(max(320, round(850 * weekday_factor * trend * seasonality)))
        conversion_rate = max(0.011, min(0.045, 0.0225 * (1.0 + 0.18 * sin((idx / 10.0) * 2 * pi))))
        conversions = max(5, int(round(traffic * conversion_rate)))
        aov = max(28.0, 64.0 * (1.0 + 0.05 * sin((idx / 21.0) * 2 * pi)))

        revenue = round(conversions * aov, 2)
        cost = round(revenue * 0.62, 2)
        profit = round(revenue - cost, 2)
        gross_margin = round((profit / revenue) * 100, 2) if revenue else 0.0
        cashflow = round(profit * 0.85, 2)
        liquidity = round(68000 + idx * 95 + cashflow * 0.35, 2)
        new_customers = max(1, int(round(conversions * 0.31)))

        db.add(
            DailyMetrics(
                workspace_id=workspace_id,
                date=day,
                period="daily",
                revenue=revenue,
                cost=cost,
                profit=profit,
                gross_margin=gross_margin,
                cashflow=cashflow,
                liquidity=liquidity,
                traffic=traffic,
                conversions=conversions,
                conversion_rate=round(conversion_rate, 4),
                new_customers=new_customers,
            )
        )
        created_metrics += 1

    # Leichte Ausreisser fuer realistischere Anomalie-Erkennung in den letzten 2 Wochen.
    recent_rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= today - timedelta(days=14),
        )
        .order_by(DailyMetrics.date)
        .all()
    )
    if len(recent_rows) >= 6:
        dip = recent_rows[-5]
        peak = recent_rows[-2]
        dip.revenue = round(float(dip.revenue or 0) * 0.72, 2)
        dip.conversions = max(1, int(round(float(dip.conversions or 0) * 0.78)))
        dip.conversion_rate = round(max(0.008, float(dip.conversion_rate or 0) * 0.88), 4)
        peak.revenue = round(float(peak.revenue or 0) * 1.19, 2)
        peak.traffic = int(round(float(peak.traffic or 0) * 1.12))

    month_end = date(today.year, today.month, 28) + timedelta(days=4)
    month_end = month_end - timedelta(days=month_end.day)
    revenue_goal = (
        db.query(Goal)
        .filter(Goal.workspace_id == workspace_id, Goal.metric == "revenue", Goal.period == "monthly")
        .order_by(Goal.id.desc())
        .first()
    )
    created_goal = False
    if not revenue_goal:
        db.add(
            Goal(
                workspace_id=workspace_id,
                metric="revenue",
                target_value=210000.0,
                period="monthly",
                start_date=date(today.year, today.month, 1),
                end_date=month_end,
            )
        )
        created_goal = True

    db.commit()

    return {
        "workspace_id": workspace_id,
        "deleted": {
            "notifications": deleted_notifications,
            "tasks": deleted_tasks,
        },
        "created": {
            "notifications": len(demo_notifications),
            "tasks": len(demo_tasks),
            "daily_metrics": created_metrics,
            "goal_revenue": 1 if created_goal else 0,
        },
        "skipped": {
            "daily_metrics_existing": skipped_metrics,
        },
    }
