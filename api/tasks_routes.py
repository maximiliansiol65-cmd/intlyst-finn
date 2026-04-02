"""
Task-System — offen / in Arbeit / erledigt + Verlauf + Zuweisung
"""
from datetime import date, datetime, timedelta
from typing import Any, Optional, cast, List, Tuple
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db, engine
from models.task import Task, TaskHistory
from models.base import Base
from api.auth_routes import User, get_current_user
from services.decision_service import get_decision_events, run_decision_system

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

Base.metadata.create_all(bind=engine)

VALID_STATUSES   = {"open", "in_progress", "done"}
VALID_PRIORITIES = {"high", "medium", "low"}
VALID_IMPACTS    = {"high", "medium", "low"}

STATUS_LABELS = {
    "open":        "Offen",
    "in_progress": "In Arbeit",
    "done":        "Erledigt",
}

STATUS_NEXT = {
    "open":        "in_progress",
    "in_progress": "done",
    "done":        "open",
}


# ── Schemas ──────────────────────────────────────────────

class TaskCreate(BaseModel):
    title:             str
    description:       Optional[str]  = None
    priority:          str            = "medium"
    assigned_to:       Optional[str]  = None
    assigned_to_id:    Optional[int]  = None
    due_date:          Optional[date] = None
    recommendation_id: Optional[int]  = None
    created_by:        Optional[str]  = None
    goal:              Optional[str]  = None
    expected_result:   Optional[str]  = None
    steps:             Optional[list[str]] = None
    time_estimate_minutes: Optional[int] = None
    kpis:              Optional[list[str]] = None
    impact:            Optional[str]  = None


class TaskUpdate(BaseModel):
    title:          Optional[str]  = None
    description:    Optional[str]  = None
    status:         Optional[str]  = None
    priority:       Optional[str]  = None
    assigned_to:    Optional[str]  = None
    assigned_to_id: Optional[int]  = None
    due_date:       Optional[date] = None
    goal:           Optional[str]  = None
    expected_result: Optional[str] = None
    steps:          Optional[list[str]] = None
    time_estimate_minutes: Optional[int] = None
    kpis:           Optional[list[str]] = None
    impact:         Optional[str]  = None


class MemberAvailability(BaseModel):
    email: str
    skills: list[str] = []
    availability_pct: float = 100.0
    current_load_hours: float = 0.0


class AutoAssignRequest(BaseModel):
    task_ids: Optional[list[int]] = None
    max_per_member: int = 3
    members: List[MemberAvailability]


class RebalanceRequest(BaseModel):
    members: List[MemberAvailability]
    threshold_days: int = 3


class TaskResponse(BaseModel):
    id:                int
    title:             str
    description:       Optional[str]
    status:            str
    status_label:      str
    priority:          str
    impact:            Optional[str]
    assigned_to:       Optional[str]
    assigned_to_id:    Optional[int]
    due_date:          Optional[date]
    recommendation_id: Optional[int]
    created_by:        Optional[str]
    goal:              Optional[str]
    expected_result:   Optional[str]
    steps:             list[str] = []
    time_estimate_minutes: Optional[int]
    kpis:              list[str] = []
    completed_at:      Optional[datetime]
    created_at:        datetime
    updated_at:        Optional[datetime]
    impact_score_calc: Optional[float] = None
    priority_stage:    Optional[str] = None
    category_group:    Optional[str] = None
    reason:            Optional[str] = None
    time_pressure:     Optional[float] = None

    class Config:
        from_attributes = True


class HistoryEntry(BaseModel):
    id:         int
    changed_by: Optional[str]
    field:      str
    old_value:  Optional[str]
    new_value:  Optional[str]
    changed_at: datetime

    class Config:
        from_attributes = True


class TaskSignalCreate(BaseModel):
    metric: str = "revenue"
    change_pct: float
    cause: Optional[str] = None
    channel: Optional[str] = None
    segment: Optional[str] = None
    priority: Optional[str] = None
    time_horizon_days: int = 7


# ── Hilfsfunktionen ───────────────────────────────────────

def _s(v: object) -> Optional[str]:
    coerced = cast(Any, v)
    return str(coerced) if coerced is not None else None

def _i(v: object) -> Optional[int]:
    coerced = cast(Any, v)
    return int(coerced) if coerced is not None else None

def _dt(v: object) -> Optional[datetime]:
    coerced = cast(Any, v)
    return coerced if isinstance(coerced, datetime) else None

def _set(obj: Any, attr: str, value: object) -> None:
    setattr(obj, attr, value)


def _json_list_or_empty(payload: Optional[str]) -> list[str]:
    if not payload:
        return []
    try:
        data = json.loads(payload)
        if isinstance(data, list):
            return [str(x) for x in data]
    except Exception:
        pass
    return []


def _to_json_list(items: Optional[list[str]]) -> Optional[str]:
    if items is None:
        return None
    try:
        return json.dumps(items)
    except Exception:
        return None


def _derive_structure(
    title: str,
    description: Optional[str],
    priority: str,
    impact: Optional[str] = None,
    metric: Optional[str] = None,
    change_pct: Optional[float] = None,
    cause: Optional[str] = None,
) -> tuple[str, str, list[str], int, list[str], str]:
    """Generate goal, expected_result, steps, eta, kpis, impact."""
    metric = metric or "revenue"
    kpis = [metric]
    base_goal = f"Stabilisiere {metric}" if change_pct and change_pct < 0 else f"Steigere {metric}"
    goal = base_goal
    expected = f"{metric} verbessert sich in den nächsten 7 Tagen"
    eta = 90 if priority == "high" else 60 if priority == "medium" else 30
    steps = [
        "Analyse: Ursachen prüfen (Traffic, Conversion, Preis)",
        "Plan: 3 konkrete Maßnahmen auswählen",
        "Umsetzung: Kampagne/Post/E-Mail einplanen und live setzen",
    ]
    if "social" in title.lower():
        steps = [
            "Ideen: 3 Hook-Varianten formulieren",
            "Assets: Bilder/Clips auswählen oder generieren",
            "Planung: Posts für 3 Tage terminieren",
        ]
        expected = "Engagement und Click-Through Rate steigen um ≥5%"
        kpis = ["engagement", "traffic"]
    if "email" in title.lower():
        steps = [
            "Zielgruppe segmentieren",
            "Betreff + Preheader schreiben",
            "Call-to-Action einbauen und Versand testen",
        ]
        kpis = ["open_rate", "ctr", metric]
    if cause:
        goal = f"Behebe Ursache: {cause}"
    if change_pct is not None:
        direction = "fällt" if change_pct < 0 else "steigt"
        expected = f"{metric} {direction} um {abs(change_pct):.1f}% wird innerhalb 7 Tagen abgefangen"
    return goal, expected, steps, eta, kpis, impact or priority


def task_to_response(task: Task, extras: Optional[dict[str, Any]] = None) -> TaskResponse:
    extras = extras or {}
    return TaskResponse(
        id=cast(Any, task.id),
        title=cast(Any, task.title),
        description=_s(task.description),
        status=cast(Any, task.status),
        status_label=STATUS_LABELS.get(cast(Any, task.status)) or cast(Any, task.status) or "",
        priority=cast(Any, task.priority),
        impact=_s(task.impact),
        assigned_to=_s(task.assigned_to),
        assigned_to_id=_i(task.assigned_to_id),
        due_date=cast(Any, task.due_date),
        recommendation_id=_i(task.recommendation_id),
        created_by=_s(task.created_by),
        goal=_s(task.goal),
        expected_result=_s(task.expected_result),
        steps=_json_list_or_empty(task.steps_json),
        time_estimate_minutes=task.time_estimate_minutes,
        kpis=_json_list_or_empty(task.kpis_json),
        completed_at=_dt(task.completed_at),
        created_at=cast(Any, task.created_at),
        updated_at=_dt(task.updated_at),
        impact_score_calc=extras.get("impact_score_calc"),
        priority_stage=extras.get("priority_stage"),
        category_group=extras.get("category_group"),
        reason=extras.get("reason"),
        time_pressure=extras.get("time_pressure"),
    )


# ── Workforce heuristics (keeps actions confirmable; does not persist) ──

def _skill_match_score(text: str, skills: list[str]) -> float:
    if not skills or not text:
        return 0.0
    text_lower = text.lower()
    return float(len([s for s in skills if s.lower() in text_lower]))


def _priority_weight(priority: Optional[str]) -> float:
    if priority == "high":
        return 1.5
    if priority == "low":
        return 0.7
    return 1.0


def _availability_weight(avail_pct: float, load_hours: float) -> float:
    avail_factor = max(0.2, min(1.0, avail_pct / 100.0))
    load_factor = 1.0 / (1.0 + (load_hours / 8.0))
    return avail_factor * load_factor


def _deadline_risk(due: Optional[date], status: str) -> float:
    if not due or status == "done":
        return 0.0
    days_left = (due - date.today()).days
    if days_left < 0:
        return 1.0
    if days_left == 0:
        return 0.9
    if days_left <= 2:
        return 0.75
    if days_left <= 5:
        return 0.5
    return 0.2


# ── Impact & Priorisierung ───────────────────────────────────────────────────

CATEGORY_KEYWORDS = [
    ("umsatz", ["umsatz", "revenue", "aov", "mrr", "kauf", "checkout", "pricing", "conversion", "angebot"]),
    ("marketing", ["campaign", "ads", "utm", "seo", "sem", "marketing", "traffic", "landing"]),
    ("social", ["instagram", "tiktok", "social", "post", "reel", "content", "community"]),
    ("growth", ["kund", "customer", "crm", "lead", "signup", "onboarding", "retention", "churn", "gewinn"]),
    ("problems", ["bug", "incident", "problem", "downtime", "fix", "issue", "refactor"]),
    ("strategy", ["roadmap", "strategie", "okr", "plan", "goals", "forecast"]),
]

CATEGORY_LABELS = {
    "umsatz": "Umsatz steigern",
    "marketing": "Marketing verbessern",
    "social": "Social Media optimieren",
    "growth": "Kunden gewinnen",
    "problems": "Probleme lösen",
    "strategy": "Strategie verbessern",
    "general": "Operations",
}


def _task_category(task: Task) -> Tuple[str, str]:
    text = f"{task.title or ''} {task.description or ''} {task.goal or ''}".lower()
    for code, keywords in CATEGORY_KEYWORDS:
        if any(k in text for k in keywords):
            return code, CATEGORY_LABELS.get(code, code)
    return "general", CATEGORY_LABELS.get("general", "Operations")


def _event_pressure(events, category: str) -> Tuple[float, str]:
    relevant_metrics = {
        "umsatz": ["revenue", "profit", "conversion_rate"],
        "marketing": ["traffic", "conversions"],
        "social": ["traffic"],
        "growth": ["new_customers", "conversions"],
        "problems": ["traffic", "conversion_rate"],
        "strategy": ["revenue", "profit"],
        "general": [],
    }.get(category, [])

    severity_factor = {"critical": 1.6, "high": 1.3, "medium": 1.0, "low": 0.6}
    best = (0.0, "")
    for event in events:
        if relevant_metrics and event.metric not in relevant_metrics:
            continue
        pressure = abs(event.delta_pct) * severity_factor.get(event.severity, 0.8)
        if event.direction == "down":
            pressure *= 1.2
        if pressure > best[0]:
            best = (pressure, f"{event.metric_label}: {event.summary}")
    return best


def _impact_score(task: Task, events, main_problem: Optional[dict], category: str) -> Tuple[float, str, float]:
    base = 20.0
    if task.priority == "high":
        base += 25
    elif task.priority == "medium":
        base += 12
    base += {"high": 25, "medium": 12, "low": 6}.get((task.impact or task.priority), 0)

    time_pressure = _deadline_risk(task.due_date, task.status)
    time_component = time_pressure * 35
    efficiency_bonus = 0
    if task.time_estimate_minutes:
        if task.time_estimate_minutes <= 30:
            efficiency_bonus = 8
        elif task.time_estimate_minutes <= 90:
            efficiency_bonus = 4

    event_pressure, evidence = _event_pressure(events, category)
    if main_problem and category in CATEGORY_LABELS and main_problem.get("category") == CATEGORY_LABELS.get(category):
        event_pressure *= 1.1

    score = max(0.0, base + time_component + efficiency_bonus + event_pressure)
    reason = evidence or "Impact aus Priorität, Deadline und Zeiteffizienz berechnet."
    return round(score, 1), reason, round(time_pressure, 2)


def _priority_stage(score: float) -> str:
    if score >= 95:
        return "KRITISCH"
    if score >= 75:
        return "SEHR WICHTIG"
    if score >= 50:
        return "WICHTIG"
    return "OPTIONAL"


def log_change(
    task_id: int,
    field: str,
    old_value: str,
    new_value: str,
    changed_by: str,
    db: Session,
):
    if old_value != new_value:
        db.add(TaskHistory(
            task_id=task_id,
            changed_by=changed_by,
            field=field,
            old_value=str(old_value) if old_value else None,
            new_value=str(new_value) if new_value else None,
        ))


# ── Endpunkte ────────────────────────────────────────────

@router.post("", response_model=TaskResponse)
def create_task(body: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priority muss eine von {VALID_PRIORITIES} sein.")
    if body.impact and body.impact not in VALID_IMPACTS:
        raise HTTPException(status_code=400, detail=f"Impact muss eine von {VALID_IMPACTS} sein.")

    goal = body.goal
    expected = body.expected_result
    steps_list = body.steps or []
    kpis = body.kpis or []
    eta = body.time_estimate_minutes
    impact = body.impact or body.priority

    if not (goal and expected and steps_list):
        goal, expected, steps_list, eta_auto, kpis_auto, impact = _derive_structure(
            body.title,
            body.description,
            body.priority,
            impact=impact,
        )
        if eta is None:
            eta = eta_auto
        if not kpis:
            kpis = kpis_auto

    task = Task(
        title=body.title,
        description=body.description,
        priority=body.priority,
        impact=impact,
        assigned_to=body.assigned_to,
        assigned_to_id=body.assigned_to_id,
        due_date=body.due_date,
        recommendation_id=body.recommendation_id,
        created_by=body.created_by,
        status="open",
        goal=goal,
        expected_result=expected,
        steps_json=_to_json_list(steps_list),
        kpis_json=_to_json_list(kpis),
        time_estimate_minutes=eta,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    log_change(cast(Any, task.id), "status", "", "open", body.created_by or "system", db)
    db.commit()

    return task_to_response(task)


@router.post("/auto", response_model=TaskResponse)
def create_task_from_signal(
    signal: TaskSignalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Erzeugt eine strukturierte Aufgabe aus KPI-Veränderungen/Ursachen."""
    title = f"Gegenmaßnahme: {signal.metric} {signal.change_pct:+.1f}%"
    description = f"Auto-Task basierend auf KPI {signal.metric} ({signal.change_pct:+.1f}%). Ursache: {signal.cause or 'unbekannt'}."
    priority = signal.priority or ("high" if signal.change_pct <= -10 else "medium")
    goal, expected, steps_list, eta, kpis, impact = _derive_structure(
        title,
        description,
        priority,
        impact=None,
        metric=signal.metric,
        change_pct=signal.change_pct,
        cause=signal.cause,
    )

    task = Task(
        title=title,
        description=description,
        priority=priority,
        impact=impact,
        status="open",
        goal=goal,
        expected_result=expected,
        steps_json=_to_json_list(steps_list),
        kpis_json=_to_json_list(kpis),
        time_estimate_minutes=eta,
        created_by="system",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    log_change(cast(Any, task.id), "status", "", "open", "system", db)
    db.commit()
    return task_to_response(task)


@router.get("", response_model=list[TaskResponse])
def get_tasks(
    status:      Optional[str] = Query(None, enum=["open", "in_progress", "done"]),
    priority:    Optional[str] = Query(None, enum=["high", "medium", "low"]),
    assigned_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Task)
    if status:      query = query.filter(Task.status == status)
    if priority:    query = query.filter(Task.priority == priority)
    if assigned_to: query = query.filter(Task.assigned_to == assigned_to)
    tasks = query.order_by(desc(Task.created_at)).all()
    return [task_to_response(t) for t in tasks]


@router.get("/stats")
def get_task_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total       = db.query(Task).count()
    open_count  = db.query(Task).filter(Task.status == "open").count()
    in_progress = db.query(Task).filter(Task.status == "in_progress").count()
    done        = db.query(Task).filter(Task.status == "done").count()
    high_prio   = db.query(Task).filter(Task.priority == "high", Task.status != "done").count()

    return {
        "total":       total,
        "open":        open_count,
        "in_progress": in_progress,
        "done":        done,
        "high_priority_open": high_prio,
        "completion_rate": round(done / total * 100, 1) if total else 0,
    }


@router.get("/prioritized")
def get_prioritized_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    events = get_decision_events(db)
    decision = run_decision_system(db, persist=False)
    main_problem = decision.get("main_problem") if isinstance(decision, dict) else None

    tasks = db.query(Task).filter(Task.status != "done").all()
    enriched = []
    for task in tasks:
        category, category_label = _task_category(task)
        score, reason, time_pressure = _impact_score(task, events, main_problem, category)
        stage = _priority_stage(score)
        extras = {
            "impact_score_calc": score,
            "priority_stage": stage,
            "category_group": category_label,
            "reason": reason,
            "time_pressure": time_pressure,
        }
        setattr(task, "_extras", extras)
        enriched.append(task_to_response(task, extras))

    enriched.sort(key=lambda t: (-(t.impact_score_calc or 0), t.due_date or date.max))
    today = date.today()
    today_top = [t for t in enriched if t.due_date and t.due_date <= today][:3]
    week_top = [t for t in enriched if t.due_date and t.due_date <= today + timedelta(days=7) and t not in today_top][:3]

    remaining = [t for t in enriched if t not in today_top and t not in week_top]
    if len(today_top) < 3:
        today_top = (today_top + remaining)[:3]
    if len(week_top) < 3:
        week_top = (week_top + [t for t in remaining if t not in today_top])[:3]

    ceo_focus = [t for t in enriched if (t.priority_stage in {"KRITISCH", "SEHR WICHTIG"}) and (t.impact_score_calc or 0) >= 50][:6]

    grouped = {}
    for t in enriched:
        grouped.setdefault(t.category_group or "Operations", []).append(t)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "today_top": today_top,
        "week_top": week_top,
        "ceo_focus": ceo_focus,
        "categories": {
            label: sorted(items, key=lambda x: -(x.impact_score_calc or 0))[:5]
            for label, items in grouped.items()
        },
        "all": enriched,
    }


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")
    return task_to_response(task)


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    body: TaskUpdate,
    changed_by: str = Query("user"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")

    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status muss eine von {VALID_STATUSES} sein.")
    if body.priority and body.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priority muss eine von {VALID_PRIORITIES} sein.")
    if body.impact and body.impact not in VALID_IMPACTS:
        raise HTTPException(status_code=400, detail=f"Impact muss eine von {VALID_IMPACTS} sein.")

    changes = body.model_dump(exclude_unset=True)
    if "steps" in changes:
        changes["steps_json"] = _to_json_list(changes.pop("steps"))
    if "kpis" in changes:
        changes["kpis_json"] = _to_json_list(changes.pop("kpis"))
    for field, new_value in changes.items():
        old_value = getattr(task, field, None)
        log_change(task_id, field, str(old_value), str(new_value), changed_by, db)
        setattr(task, field, new_value)

    if body.status == "done" and not cast(Any, task.completed_at):
        _set(task, "completed_at", datetime.utcnow())
    elif body.status and body.status != "done":
        _set(task, "completed_at", None)

    _set(task, "updated_at", datetime.utcnow())
    db.commit()
    db.refresh(task)
    return task_to_response(task)


@router.post("/auto-assign")
def suggest_auto_assignment(
    body: AutoAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Liefert Vorschläge für automatische Zuweisung auf Basis von Skills, Verfügbarkeit und Priorität.
    Persistiert NICHT – Nutzer muss bestätigen.
    """
    member_capacity: dict[str, int] = {m.email: 0 for m in body.members}
    tasks_query = db.query(Task).filter(Task.status != "done")
    if body.task_ids:
        tasks_query = tasks_query.filter(Task.id.in_(body.task_ids))
    tasks = tasks_query.all()

    suggestions = []
    for task in tasks:
        best = None
        for member in body.members:
            score = (
                _priority_weight(task.priority)
                * (1.0 + _skill_match_score((task.title or "") + " " + (task.description or ""), member.skills))
                * _availability_weight(member.availability_pct, member.current_load_hours)
            )
            if member_capacity[member.email] >= body.max_per_member:
                score *= 0.2  # depriorisiere bei Kapazitätsgrenze
            if not best or score > best["score"]:
                best = {"email": member.email, "score": round(score, 3), "skills": member.skills}
        if best:
            member_capacity[best["email"]] += 1
            suggestions.append({
                "task_id": task.id,
                "title": task.title,
                "priority": task.priority,
                "due_date": task.due_date,
                "suggested_assignee": best["email"],
                "reason": f"Match Score {best['score']} (Skills + Verfügbarkeit)",
                "confirmable": True,
            })

    return {"items": suggestions, "count": len(suggestions), "note": "Nur Vorschläge – Nutzer muss bestätigen."}


@router.post("/{task_id}/execute-preview")
def execute_preview(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """1-Klick-Umsetzung: liefert vorbereitete Artefakte (ohne Versand)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")

    steps = _json_list_or_empty(task.steps_json) or [task.description or "Schritt definieren"]
    goal = task.goal or task.title
    email_subject = f"Action: {task.title}"
    email_body = (
        f"Ziel: {goal}\nErwartetes Ergebnis: {task.expected_result or 'n/a'}\n\nSchritte:\n- "
        + "\n- ".join(steps)
    )

    social_posts = [
        {
            "platform": "linkedin",
            "text": f"Wir setzen gerade '{task.title}' um, Ziel: {goal}.",
            "cta": "Mehr erfahren",
        }
    ]

    return {
        "task_id": task_id,
        "email": {"subject": email_subject, "body": email_body},
        "social_posts": social_posts,
        "text_draft": f"Kurztext: {task.title} – {task.expected_result or goal}",
        "checklist": steps,
        "ready": True,
    }


@router.post("/rebalance")
def suggest_rebalance(
    body: RebalanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Schlägt Umverteilung vor, wenn Deadlines gefährdet sind. Keine Änderungen ohne Nutzer-Bestätigung.
    """
    tasks = db.query(Task).filter(Task.status != "done").all()
    at_risk = [t for t in tasks if _deadline_risk(t.due_date, t.status) >= 0.5]
    suggestions = []
    for task in at_risk:
        current_assignee = task.assigned_to
        best = None
        for member in body.members:
            # Skip if already assigned
            if current_assignee and member.email == current_assignee:
                continue
            risk_weight = _deadline_risk(task.due_date, task.status)
            score = (
                risk_weight
                * _priority_weight(task.priority)
                * (1.0 + _skill_match_score((task.title or "") + " " + (task.description or ""), member.skills))
                * _availability_weight(member.availability_pct, member.current_load_hours)
            )
            if not best or score > best["score"]:
                best = {"email": member.email, "score": round(score, 3)}
        if best:
            suggestions.append({
                "task_id": task.id,
                "title": task.title,
                "current_assignee": current_assignee,
                "suggested_assignee": best["email"],
                "due_date": task.due_date,
                "risk_score": round(_deadline_risk(task.due_date, task.status), 2),
                "reason": f"Deadline-Risiko + Kapazität (Score {best['score']})",
                "confirmable": True,
            })

    return {"items": suggestions, "count": len(suggestions), "note": "Nur Vorschläge – Nutzer muss bestätigen."}


@router.get("/progress-stream")
def progress_stream(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Leichtgewichtiger Snapshot für Echtzeit-Visualisierung (Polling/Streams).
    """
    total = db.query(Task).count()
    open_count = db.query(Task).filter(Task.status == "open").count()
    in_progress = db.query(Task).filter(Task.status == "in_progress").count()
    done = db.query(Task).filter(Task.status == "done").count()
    due_soon = db.query(Task).filter(Task.status != "done", Task.due_date != None).count()
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "totals": {"all": total, "open": open_count, "in_progress": in_progress, "done": done},
        "completion_rate_pct": round(done / total * 100, 1) if total else 0,
        "due_soon": due_soon,
    }


@router.patch("/{task_id}/next-status", response_model=TaskResponse)
def advance_status(
    task_id: int,
    changed_by: str = Query("user"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")

    old_status = cast(Any, task.status)
    new_status = STATUS_NEXT.get(old_status, "open")

    log_change(task_id, "status", old_status, new_status, changed_by, db)
    _set(task, "status", new_status)

    if new_status == "done":
        _set(task, "completed_at", datetime.utcnow())
    else:
        _set(task, "completed_at", None)

    _set(task, "updated_at", datetime.utcnow())
    db.commit()
    db.refresh(task)
    return task_to_response(task)


@router.get("/{task_id}/history", response_model=list[HistoryEntry])
def get_task_history(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")

    history = (
        db.query(TaskHistory)
        .filter(TaskHistory.task_id == task_id)
        .order_by(desc(TaskHistory.changed_at))
        .all()
    )
    return history


@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task nicht gefunden.")
    db.delete(task)
    db.commit()
    return {"message": "Task gelöscht."}

    return {"message": "Task gelöscht."}
