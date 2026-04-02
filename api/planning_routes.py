"""
Intelligentes Planungs-System: Jahresstrategie -> Monatsziele -> Wochenplan -> Tagesaufgaben.
Erzeugt automatische Strategie-Ketten, Priorisierung und CEO-Ansicht.
"""
from __future__ import annotations

from datetime import date, timedelta
import json
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from models.daily_metrics import DailyMetrics
from models.task import Task
from models.goals import Goal

router = APIRouter(prefix="/api/planning", tags=["planning"])


# ── Data models ─────────────────────────────────────────────────────────────

class PlanItem(BaseModel):
    title: str
    reason: str
    priority: str  # high|medium|low
    kpis: List[str] = []
    time_horizon: str  # daily|weekly|monthly|yearly
    eta_minutes: Optional[int] = None
    owner_role: Optional[str] = None
    strategic_goal: Optional[str] = None
    linked_to: Optional[str] = None
    next_action: Optional[str] = None
    resource_level: Optional[str] = None


class PlanResponse(BaseModel):
    yearly: List[PlanItem]
    monthly: List[PlanItem]
    weekly: List[PlanItem]
    daily: List[PlanItem]
    ceo_summary: Optional[str] = None
    top_decisions: List[str] = []
    risks: List[str] = []
    opportunities: List[str] = []
    meeting_brief: List[str] = []


def _last_change(db: Session, workspace_id: int, metric: str, days: int = 30) -> float:
    """Return pct change last period vs previous period for metric."""
    today = date.today()
    period = [today - timedelta(days=days), today]
    prev_period = [today - timedelta(days=days * 2), today - timedelta(days=days)]

    def _sum(window):
        q = (
            db.query(DailyMetrics)
            .filter(
                DailyMetrics.workspace_id == workspace_id,
                DailyMetrics.period == "daily",
                DailyMetrics.date >= window[0],
                DailyMetrics.date <= window[1],
            )
        )
        attr = getattr(DailyMetrics, metric)
        total = sum(getattr(r, metric) or 0 for r in q.all())
        return total

    curr = _sum(period)
    prev = _sum(prev_period)
    if prev == 0:
        return 0.0
    return round((curr - prev) / prev * 100, 1)


def _priority_from_change(change: float) -> str:
    if abs(change) >= 15:
        return "high"
    if abs(change) >= 5:
        return "medium"
    return "low"


def _json_list(value: Optional[str]) -> List[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
        if isinstance(data, list):
            return [str(item) for item in data]
    except Exception:
        pass
    return []


def _owner_for_kpis(kpis: List[str], horizon: str) -> str:
    joined = " ".join(kpis).lower()
    if any(metric in joined for metric in ["revenue", "profit", "cash"]):
        return "CFO" if horizon in {"yearly", "monthly"} else "COO"
    if any(metric in joined for metric in ["traffic", "engagement", "lead"]):
        return "CMO"
    if any(metric in joined for metric in ["conversion", "new_customers"]):
        return "Strategist" if horizon in {"yearly", "monthly"} else "COO"
    return "Assistant" if horizon == "daily" else "COO"


def _resource_level(priority: str, horizon: str) -> str:
    if priority == "high" and horizon in {"weekly", "monthly", "yearly"}:
        return "high"
    if priority == "low":
        return "low"
    return "medium"


def _top_tasks(db: Session, workspace_id: int, limit: int = 3) -> List[Task]:
    tasks = (
        db.query(Task)
        .filter(Task.workspace_id == workspace_id, Task.status == "open")
        .order_by(Task.priority.desc(), Task.created_at.desc())
        .limit(limit)
        .all()
    )
    return tasks


def _goals(db: Session, workspace_id: int, period: str, limit: int = 3) -> List[Goal]:
    return (
        db.query(Goal)
        .filter(Goal.workspace_id == workspace_id, Goal.period == period)
        .order_by(Goal.end_date.desc())
        .limit(limit)
        .all()
    )


def _plan_chain(db: Session, workspace_id: int) -> PlanResponse:
    # KPI deltas
    rev_change = _last_change(db, workspace_id, "revenue")
    traffic_change = _last_change(db, workspace_id, "traffic")
    conv_change = _last_change(db, workspace_id, "conversion_rate")

    yearly = [
        PlanItem(
            title="Umsatzwachstum sichern",
            reason=f"Revenue {rev_change:+.1f}% ggü. Vormonat",
            priority=_priority_from_change(rev_change),
            kpis=["revenue", "profit"],
            time_horizon="yearly",
            owner_role="CEO",
            strategic_goal="Profitables Jahreswachstum absichern",
            linked_to="Monatsziele Umsatz und Effizienz",
            next_action="Jahresziel mit aktueller Run-Rate und Marge neu abgleichen.",
            resource_level=_resource_level(_priority_from_change(rev_change), "yearly"),
        ),
        PlanItem(
            title="Nachfrage erhöhen",
            reason=f"Traffic {traffic_change:+.1f}% und Conversion {conv_change:+.1f}%",
            priority=_priority_from_change(traffic_change + conv_change),
            kpis=["traffic", "conversion_rate"],
            time_horizon="yearly",
            owner_role="CEO",
            strategic_goal="Planbare Pipeline und Nachfrage aufbauen",
            linked_to="Monatsziele Traffic, Leads und Conversion",
            next_action="Demand-Plan mit CMO und COO für die nächsten 90 Tage festlegen.",
            resource_level=_resource_level(_priority_from_change(traffic_change + conv_change), "yearly"),
        ),
    ][:3]

    monthly_goals = _goals(db, workspace_id, "monthly", 3)
    monthly = [
        PlanItem(
            title=f"{g.metric} auf {int(g.target_value)} heben",
            reason="Monatsziel aktiv",
            priority="high",
            kpis=[g.metric],
            time_horizon="monthly",
            owner_role=_owner_for_kpis([g.metric], "monthly"),
            strategic_goal=f"Monatsziel {g.metric} absichern",
            linked_to="Unterstützt das übergeordnete Jahresziel",
            next_action=f"Massnahmenplan für {g.metric} mit wöchentlichem Review hinterlegen.",
            resource_level="high",
        )
        for g in monthly_goals
    ]
    if len(monthly) < 3:
        monthly.append(
            PlanItem(
                title="Top-3 Wachstumsmaßnahmen starten",
                reason="Automatisch ergänzt",
                priority="medium",
                kpis=["revenue", "traffic"],
                time_horizon="monthly",
                owner_role="Strategist",
                strategic_goal="Wachstumspipeline auf Monatsbasis absichern",
                linked_to="Stützt Umsatz- und Nachfrageziele",
                next_action="Top-3 Initiativen auswählen und Verantwortliche benennen.",
                resource_level="medium",
            )
        )

    weekly = [
        PlanItem(
            title="Marketing Push (7 Tage)",
            reason="Wachstum kurzfristig erhöhen",
            priority="high",
            kpis=["traffic", "conversion_rate"],
            time_horizon="weekly",
            owner_role="CMO",
            strategic_goal="Kurzfristige Nachfrage und Funnel-Input erhöhen",
            linked_to="Zahlt auf Monatsziel Traffic und Jahresziel Nachfrage ein",
            next_action="Kampagnenbudget und Creative-Fokus für diese Woche freigeben.",
            resource_level="high",
        ),
        PlanItem(
            title="Sales Pipeline auffüllen",
            reason="Lead-Volumen sichern",
            priority="medium",
            kpis=["new_customers"],
            time_horizon="weekly",
            owner_role="COO",
            strategic_goal="Pipeline-Lücken vor Monatsende schließen",
            linked_to="Unterstützt Monatsziel Neukunden",
            next_action="Lead-Quellen priorisieren und Follow-up-Taktung erhöhen.",
            resource_level="medium",
        ),
        PlanItem(
            title="Produkt/UX Quick Wins",
            reason="Conversion-Rate anheben",
            priority="medium",
            kpis=["conversion_rate"],
            time_horizon="weekly",
            owner_role="Strategist",
            strategic_goal="Bestehenden Traffic profitabler monetarisieren",
            linked_to="Hebt Monatsziel Conversion und Jahresziel Umsatzqualität",
            next_action="Top-2 Drop-off-Punkte auswählen und Tests anstoßen.",
            resource_level="medium",
        ),
    ]

    top_tasks = _top_tasks(db, workspace_id, 3)
    daily = [
        PlanItem(
            title=t.title,
            reason=t.goal or "Direkt umsetzbare Aufgabe",
            priority=t.priority,
            kpis=_json_list(t.kpis_json),
            time_horizon="daily",
            eta_minutes=t.time_estimate_minutes,
            owner_role=t.assigned_to or _owner_for_kpis([], "daily"),
            strategic_goal=t.expected_result or "Tagesfortschritt auf priorisierte Ziele",
            linked_to=t.goal or "Unterstützt Wochenfokus",
            next_action=(_json_list(t.steps_json)[0] if _json_list(t.steps_json) else "Ersten Umsetzungsschritt heute starten."),
            resource_level=_resource_level(t.priority, "daily"),
        )
        for t in top_tasks
    ]
    if not daily:
        daily = [
            PlanItem(
                title="3 Social Posts planen",
                reason="Traffic & Engagement kurzfristig heben",
                priority="high",
                kpis=["traffic", "engagement"],
                time_horizon="daily",
                eta_minutes=60,
                owner_role="CMO",
                strategic_goal="Wöchentliche Nachfrageziele operativ absichern",
                linked_to="Unterstützt Wochenfokus Marketing Push",
                next_action="Hook, Format und Veröffentlichungsslots heute finalisieren.",
                resource_level="medium",
            ),
            PlanItem(
                title="E-Mail an Bestandskunden senden",
                reason="Reaktivierung und Conversion",
                priority="medium",
                kpis=["conversion_rate", "revenue"],
                time_horizon="daily",
                eta_minutes=45,
                owner_role="Assistant",
                strategic_goal="Kurzfristige Reaktivierung und Umsatzbeitrag steigern",
                linked_to="Unterstützt Wochenfokus Sales Pipeline",
                next_action="Segment auswählen, Betreff finalisieren und Versand vorbereiten.",
                resource_level="low",
            ),
        ]
    critical_topics = []
    opportunities = []
    if rev_change < -5:
        critical_topics.append(f"Umsatz liegt mit {rev_change:+.1f}% unter der Vorperiode und braucht sofortige Gegensteuerung.")
    if conv_change < -5:
        critical_topics.append(f"Conversion entwickelt sich mit {conv_change:+.1f}% schwächer und belastet die Umsatzqualität.")
    if traffic_change > 5:
        opportunities.append(f"Traffic zeigt mit {traffic_change:+.1f}% Rückenwind, der besser in Conversion übersetzt werden kann.")
    if conv_change > 3:
        opportunities.append(f"Conversion entwickelt sich mit {conv_change:+.1f}% positiv und kann skaliert werden.")

    ceo_summary = (
        f"CEO-Fokus: Umsatz {rev_change:+.1f}%, Traffic {traffic_change:+.1f}%, Conversion {conv_change:+.1f}%. "
        "Priorität hat die Kette aus Jahresziel, Monatshebel und Wochenmaßnahmen so zu steuern, "
        "dass heute nur Aufgaben mit direktem KPI-Bezug umgesetzt werden."
    )
    top_decisions = [
        "Jetzt nur Initiativen priorisieren, die direkt auf Umsatz, Conversion oder Lead-Volumen einzahlen.",
        "Nicht-kritische Projekte ohne KPI-Bezug in den nächsten Planungszyklus verschieben.",
        "Jede Wocheninitiative einem klaren Owner und einer messbaren Zielgröße zuordnen.",
    ]
    meeting_brief = [
        f"Status: Revenue {rev_change:+.1f}%, Traffic {traffic_change:+.1f}%, Conversion {conv_change:+.1f}.",
        f"Kritisch jetzt: {weekly[0].title} unter Verantwortung {weekly[0].owner_role}.",
        f"Nächste konkrete Handlung: {daily[0].next_action}.",
    ]

    return PlanResponse(
        yearly=yearly,
        monthly=monthly[:3],
        weekly=weekly[:3],
        daily=daily[:3],
        ceo_summary=ceo_summary,
        top_decisions=top_decisions,
        risks=critical_topics[:3],
        opportunities=opportunities[:3],
        meeting_brief=meeting_brief,
    )


@router.get("/auto", response_model=PlanResponse)
def auto_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Erstellt automatisch eine verknüpfte Planung (Jahr → Monat → Woche → Tag)."""
    ws_id = getattr(current_user, "active_workspace_id", None) or 1
    return _plan_chain(db, ws_id)


@router.get("/ceo", response_model=PlanResponse)
def ceo_view(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reduzierte CEO-Sicht: nur Top-Prioritäten auf allen Ebenen (max 1 je Ebene)."""
    ws_id = getattr(current_user, "active_workspace_id", None) or 1
    plan = _plan_chain(db, ws_id)
    return PlanResponse(
        yearly=plan.yearly[:1],
        monthly=plan.monthly[:1],
        weekly=plan.weekly[:1],
        daily=plan.daily[:1],
    )
