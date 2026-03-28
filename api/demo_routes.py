from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user
from security_config import is_production_environment
from models.notification import Notification
from models.task import Task

router = APIRouter(prefix="/api/dev", tags=["dev"])


@router.post("/seed-demo")
def seed_demo_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if is_production_environment(): raise HTTPException(status_code=403, detail="In Produktion nicht verfuegbar.")
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
    db.commit()

    return {
        "deleted": {
            "notifications": deleted_notifications,
            "tasks": deleted_tasks,
        },
        "created": {
            "notifications": len(demo_notifications),
            "tasks": len(demo_tasks),
        },
    }
