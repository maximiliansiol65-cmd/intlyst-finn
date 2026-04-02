from __future__ import annotations

from datetime import datetime, timedelta
import json
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import engine, get_db
from models.action_logs import ActionLog
from models.action_request import ActionRequest
from models.action_request_review import ActionRequestReview
from models.base import Base
from models.task import Task, TaskHistory
from api.audit_logs_routes import record_audit_event
from api.role_guards import _get_workspace_role, MANAGER_ROLES, CEO_ROLES
from services.email_service import send_notification_email
from services.approval_policy_service import build_policy_snapshot, can_approve_action, get_policy_settings, get_workspace_role
from services.integration_execution_service import create_hubspot_task, create_mailchimp_campaign_draft, create_notion_strategy_page, create_social_campaign_drafts, create_trello_card, deliver_webhook_action, post_slack_strategy_message
from services.learning_service import record_outcome_placeholder
from services.live_feedback_service import (
    _sanitize_live_metrics,
    find_action_for_live_feedback,
    ingest_live_feedback,
    sync_action_live_feedback,
    validate_live_feedback_secret,
)
from services.report_service import create_report

router = APIRouter(prefix="/api/action-requests", tags=["action-requests"])

Base.metadata.create_all(bind=engine)

VALID_STATUSES = {"pending_approval", "approved", "rejected", "executed"}
VALID_EXECUTION_TYPES = {"task", "report", "email_draft", "strategy_bundle"}
# Categories that require dual review regardless of policy setting
_ALWAYS_DUAL_REVIEW_CATEGORIES = {"budget", "forecast", "financial", "pricing"}
# AI-generated execution type — NEVER auto-execute
_AI_EXECUTION_TYPE = "ai_suggestion"


class ActionRequestCreate(BaseModel):
    event_id: Optional[str] = None
    recommendation_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    category: str = "operations"
    priority: str = "medium"
    impact_score: Optional[float] = None
    risk_score: Optional[float] = None
    estimated_hours: Optional[float] = None
    execution_type: str = "task"
    template_name: Optional[str] = None
    target_systems: Optional[list[str]] = None
    prepared_assets: Optional[Dict[str, Any]] = None


class ApprovalBody(BaseModel):
    note: Optional[str] = None
    execute_now: bool = True
    assigned_to: Optional[str] = None


class SimulationBody(BaseModel):
    event_id: Optional[str] = None
    recommendation_id: Optional[str] = None
    title: str
    impact_score: Optional[float] = None
    risk_score: Optional[float] = None
    estimated_hours: Optional[float] = None
    category: str = "operations"


class RejectBody(BaseModel):
    note: Optional[str] = None


class LiveFeedbackBody(BaseModel):
    action_request_id: Optional[int] = None
    execution_ref: Optional[str] = None
    source: str = "external_system"
    metrics: dict
    note: Optional[str] = None


def _to_response(item: ActionRequest, policy: Optional[dict] = None) -> dict:
    execution_plan = json.loads(item.execution_plan_json) if item.execution_plan_json else None
    return {
        "id": item.id,
        "event_id": item.event_id,
        "recommendation_id": item.recommendation_id,
        "title": item.title,
        "description": item.description,
        "category": item.category,
        "priority": item.priority,
        "impact_score": item.impact_score,
        "risk_score": item.risk_score,
        "estimated_hours": item.estimated_hours,
        "execution_type": item.execution_type,
        "status": item.status,
        "requested_by": item.requested_by,
        "approved_by": item.approved_by,
        "rejected_by": item.rejected_by,
        "execution_ref": item.execution_ref,
        "execution_summary": item.execution_summary,
        "artifact_payload": json.loads(item.artifact_payload) if item.artifact_payload else None,
        "execution_plan": execution_plan,
        "prepared_assets": (execution_plan or {}).get("prepared_assets"),
        "target_systems": json.loads(item.target_systems_json) if item.target_systems_json else [],
        "live_feedback": json.loads(item.live_feedback_json) if item.live_feedback_json else None,
        "progress_pct": item.progress_pct,
        "progress_stage": item.progress_stage,
        "next_action_text": item.next_action_text,
        "approval_policy": policy,
        "approval_note": item.approval_note,
        "last_live_sync_at": item.last_live_sync_at.isoformat() if item.last_live_sync_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        "approved_at": item.approved_at.isoformat() if item.approved_at else None,
        "rejected_at": item.rejected_at.isoformat() if item.rejected_at else None,
        "executed_at": item.executed_at.isoformat() if item.executed_at else None,
    }


def _log_task_history(task_id: int, changed_by: str, db: Session) -> None:
    db.add(TaskHistory(
        task_id=task_id,
        changed_by=changed_by,
        field="status",
        old_value="",
        new_value="open",
    ))


def _build_email_draft_html(item: ActionRequest, user: User) -> str:
    plan = json.loads(item.execution_plan_json) if item.execution_plan_json else {}
    email = (plan.get("prepared_assets") or {}).get("email") or {}
    lines = str(email.get("body") or item.description or "").split("\n")
    paragraphs = "".join(
        f'<p style="font-size:14px;line-height:1.7;color:#334155;margin:0 0 12px">{line}</p>'
        for line in lines if line.strip()
    )
    return f"""
    <div style="font-family:Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:32px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px">
      <div style="font-size:24px;font-weight:800;color:#111827;margin-bottom:16px">INTLYST Umsatz-E-Mail-Draft</div>
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px">{email.get("title") or item.title}</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:12px">{email.get("preheader") or ""}</div>
      {paragraphs}
      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">KPI-Ziel</div>
        <div style="font-size:14px;color:#111827;font-weight:600;margin-top:4px">{email.get("target_kpi") or "Umsatzwirkung steigern"}</div>
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:12px">Empfaenger</div>
        <div style="font-size:14px;color:#111827;font-weight:600;margin-top:4px">{email.get("recipient") or "Relevantes Segment"}</div>
      </div>
      <div style="font-size:13px;color:#64748b">Prioritaet: {email.get("priority") or item.priority} · Freigegeben von {user.email}</div>
    </div>
    """.strip()


def _build_strategy_bundle(item: ActionRequest, user: User) -> dict:
    plan = json.loads(item.execution_plan_json) if item.execution_plan_json else {}
    email_asset = (plan.get("prepared_assets") or {}).get("email") or {}
    subject = email_asset.get("subject") or f"{item.title}: Jetzt Momentum in Wachstum umsetzen"
    email_html = _build_email_draft_html(item, user)
    social_posts = [
        {
            "channel": "linkedin",
            "headline": item.title,
            "body": f"Wir reagieren auf {item.title.lower()} mit einem fokussierten Sprint. Schwerpunkt: schnelle Wirkung, klare Prioritäten und messbarer Effekt.",
        },
        {
            "channel": "instagram",
            "headline": "Strategie aktiv",
            "body": f"Fokus heute: {item.title}. Nächster Schritt: sofortige Umsetzung mit sichtbarer Wirkung.",
        },
    ]
    team_tasks = [
        {"title": f"{item.title} - Analyse prüfen", "owner_role": "operations", "priority": item.priority, "eta_hours": 0.5},
        {"title": f"{item.title} - Kampagne/Draft finalisieren", "owner_role": "marketing", "priority": item.priority, "eta_hours": 1.0},
        {"title": f"{item.title} - Ergebnis nachverfolgen", "owner_role": "management", "priority": "medium", "eta_hours": 0.5},
    ]
    timeline = [
        {"phase": "Vorbereitung", "offset_hours": 0, "goal": "Assets und Aufgaben finalisieren"},
        {"phase": "Start", "offset_hours": 1, "goal": "Drafts und Tasks ausrollen"},
        {"phase": "Monitoring", "offset_hours": 24, "goal": "Ersten Effekt bewerten"},
        {"phase": "Review", "offset_hours": 168, "goal": "Outcome in Learning Loop zurückspielen"},
    ]
    return {
        "email": {**email_asset, "subject": subject, "html": email_html},
        "social_posts": social_posts,
        "team_tasks": team_tasks,
        "timeline": timeline,
        "expected_effect": {
            "reach_pct": round((item.impact_score or 0.0) * 0.45, 1),
            "new_customers": max(1, int((item.impact_score or 0.0) / 6)),
            "revenue_uplift_pct": round((item.impact_score or 0.0) * 0.35, 1),
        },
    }


def _build_execution_plan(
    execution_type: str,
    target_systems: Optional[List[str]] = None,
    template_name: Optional[str] = None,
    prepared_assets: Optional[Dict[str, Any]] = None,
) -> dict:
    systems = target_systems or []
    systems = systems or (
        ["intlyst_tasks", "hubspot", "trello", "slack"] if execution_type == "task"
        else ["intlyst_reports", "notion", "slack"] if execution_type == "report"
        else ["intlyst_email_draft", "mailchimp", "slack"] if execution_type == "email_draft"
        else ["intlyst_tasks", "intlyst_email_draft", "social_drafts", "intlyst_reports", "hubspot", "mailchimp", "slack", "notion", "trello", "webhook_feedback"]
    )
    success_metrics = (
        ["response_rate", "revenue_recovery", "task_completion"] if execution_type == "task"
        else ["executive_visibility", "decision_speed"] if execution_type == "report"
        else ["open_rate", "click_rate", "campaign_reactivation"] if execution_type == "email_draft"
        else ["reach_uplift", "new_customers", "revenue_uplift", "team_completion"]
    )
    return {
        "template_name": template_name or execution_type,
        "systems": systems,
        "guardrails": [
            "Nur nach Nutzerfreigabe ausführen",
            "Artefakt nach Ausführung protokollieren",
            "Outcome nach 7-14 Tagen zurückmessen",
            "Live-Systeme regelmäßig synchronisieren",
        ],
        "rollout_steps": [
            f"1. Vorbereitung für {execution_type} abschließen",
            "2. Artefakt generieren und Zielsystem verbinden",
            "3. Ausführung protokollieren, Team benachrichtigen und Live-Feedback starten",
        ],
        "success_metrics": success_metrics,
        "rollback": "Bei negativem KPI-Signal neue Ausführung stoppen und manuell prüfen.",
        "prepared_assets": prepared_assets or {},
    }


def _resolve_integration_user(db: Session, acting_user: User, item: ActionRequest) -> User:
    candidates = [item.requested_by, item.approved_by, getattr(acting_user, "email", None)]
    for email in candidates:
        if not email:
            continue
        found = db.query(User).filter(User.email == email).first()
        if found:
            return found
    return acting_user


async def _execute_action_request(item: ActionRequest, user: User, db: Session, assigned_to: Optional[str]) -> None:
    if item.execution_type not in VALID_EXECUTION_TYPES:
        raise HTTPException(status_code=400, detail="Ungültiger Execution Type.")
    integration_user = _resolve_integration_user(db, user, item)

    if item.execution_type == "task":
        task = Task(
            title=item.title,
            description=item.description,
            priority=item.priority,
            assigned_to=assigned_to,
            due_date=(datetime.utcnow() + timedelta(days=3)).date(),
            created_by=user.email,
            status="open",
        )
        db.add(task)
        db.flush()
        _log_task_history(task.id, user.email, db)
        item.execution_ref = f"task:{task.id}"
        item.execution_summary = "Task automatisch erzeugt"
        item.artifact_payload = json.dumps({
            "type": "task",
            "task_id": task.id,
            "assigned_to": assigned_to,
            "due_date": task.due_date.isoformat() if task.due_date else None,
        })
        hubspot_result = await create_hubspot_task(db, integration_user.id, item.title, item.description or item.title)
        trello_result = await create_trello_card(db, integration_user.id, item.title, item.description or item.title)
        slack_result = await post_slack_strategy_message(
            db,
            integration_user.id,
            item.title,
            item.description or item.title,
            {"priority": item.priority, "impact_score": item.impact_score or 0},
        )
        if hubspot_result:
            payload = json.loads(item.artifact_payload) if item.artifact_payload else {}
            payload["hubspot"] = hubspot_result
            item.artifact_payload = json.dumps(payload)
        if trello_result:
            payload = json.loads(item.artifact_payload) if item.artifact_payload else {}
            payload["trello"] = trello_result
            item.artifact_payload = json.dumps(payload)
        if slack_result:
            payload = json.loads(item.artifact_payload) if item.artifact_payload else {}
            payload["slack"] = slack_result
            item.artifact_payload = json.dumps(payload)
        item.progress_pct = 35.0
        item.progress_stage = "queued"
        item.next_action_text = "Task im Team starten und erste KPI-Messung nach 24h prüfen."
    elif item.execution_type == "report":
        report = await create_report(
            "weekly",
            (datetime.utcnow() - timedelta(days=7)).date(),
            datetime.utcnow().date(),
            db,
            user_id=user.id,
            workspace_id=user.active_workspace_id or 1,
        )
        item.execution_ref = f"report:{report.id}"
        item.execution_summary = "Report automatisch generiert"
        item.artifact_payload = json.dumps({
            "type": "report",
            "report_id": report.id,
            "html_url": f"/api/reports/{report.id}/html",
            "title": report.title,
            "period": "last_7_days",
        })
        notion_result = await create_notion_strategy_page(
            db,
            integration_user.id,
            item.title,
            item.description or "Automatisch generierter Report für die operative Steuerung.",
            {"report_id": report.id, "period": "last_7_days"},
        )
        slack_result = await post_slack_strategy_message(
            db,
            integration_user.id,
            item.title,
            "Ein neuer strategischer Report wurde erzeugt und ist bereit zur Prüfung.",
            {"report_id": report.id, "period": "last_7_days"},
        )
        payload = json.loads(item.artifact_payload) if item.artifact_payload else {}
        if notion_result:
            payload["notion"] = notion_result
        if slack_result:
            payload["slack"] = slack_result
        item.artifact_payload = json.dumps(payload)
        item.progress_pct = 45.0
        item.progress_stage = "running"
        item.next_action_text = "Report prüfen und daraus nächste operative Maßnahme freigeben."
    elif item.execution_type == "strategy_bundle":
        bundle = _build_strategy_bundle(item, user)
        created_tasks = []
        for planned_task in bundle["team_tasks"]:
            task = Task(
                title=planned_task["title"],
                description=item.description,
                priority=planned_task["priority"],
                assigned_to=planned_task["owner_role"],
                due_date=(datetime.utcnow() + timedelta(days=3)).date(),
                created_by=user.email,
                status="open",
            )
            db.add(task)
            db.flush()
            _log_task_history(task.id, user.email, db)
            created_tasks.append({"task_id": task.id, **planned_task})

        report = await create_report(
            "weekly",
            (datetime.utcnow() - timedelta(days=7)).date(),
            datetime.utcnow().date(),
            db,
            user_id=user.id,
            workspace_id=user.active_workspace_id or 1,
        )
        mailchimp_result = await create_mailchimp_campaign_draft(db, integration_user.id, bundle["email"]["subject"], bundle["email"]["html"])
        hubspot_result = await create_hubspot_task(db, integration_user.id, item.title, item.description or item.title)
        trello_result = await create_trello_card(db, integration_user.id, item.title, item.description or item.title)
        slack_result = await post_slack_strategy_message(
            db,
            integration_user.id,
            item.title,
            "Die 1-Klick-Strategie wurde als Bündel vorbereitet und in die Ausführung überführt.",
            bundle["expected_effect"],
        )
        notion_result = await create_notion_strategy_page(
            db,
            integration_user.id,
            item.title,
            item.description or "Strategiebündel aus Intlyst",
            {
                "expected_reach_pct": bundle["expected_effect"]["reach_pct"],
                "expected_new_customers": bundle["expected_effect"]["new_customers"],
                "expected_revenue_uplift_pct": bundle["expected_effect"]["revenue_uplift_pct"],
            },
        )
        social_result = create_social_campaign_drafts(db, integration_user.id, bundle["social_posts"])
        item.execution_ref = f"strategy_bundle:{item.id}"
        item.execution_summary = "Strategiebündel vorbereitet und gestartet"
        item.artifact_payload = json.dumps({
            "type": "strategy_bundle",
            "email": bundle["email"],
            "social_posts": bundle["social_posts"],
            "social_execution": social_result,
            "team_tasks": created_tasks,
            "timeline": bundle["timeline"],
            "report": {
                "report_id": report.id,
                "html_url": f"/api/reports/{report.id}/html",
            },
            "mailchimp": mailchimp_result,
            "hubspot": hubspot_result,
            "trello": trello_result,
            "slack": slack_result,
            "notion": notion_result,
            "expected_effect": bundle["expected_effect"],
        })
        item.progress_pct = 58.0
        item.progress_stage = "running"
        item.next_action_text = "Team-Tasks anstoßen, Social-Entwürfe prüfen und erste Wirkungsdaten verfolgen."
    else:
        plan = json.loads(item.execution_plan_json) if item.execution_plan_json else {}
        email_asset = (plan.get("prepared_assets") or {}).get("email") or {}
        html = _build_email_draft_html(item, user)
        subject = email_asset.get("subject") or item.title
        mailchimp_result = await create_mailchimp_campaign_draft(db, integration_user.id, subject, html)
        slack_result = await post_slack_strategy_message(
            db,
            integration_user.id,
            item.title,
            "Ein E-Mail-Draft ist vorbereitet und wartet auf Wirkungsmessung.",
            {"priority": item.priority, "execution_type": item.execution_type},
        )
        item.execution_ref = f"{item.execution_type}:draft"
        item.execution_summary = f"{item.execution_type} vorbereitet"
        item.artifact_payload = json.dumps({
            "type": "email_draft",
            "email": email_asset,
            "subject": subject,
            "preview_to": user.email,
            "html": html,
            "mailchimp": mailchimp_result,
            "slack": slack_result,
            "channel": "email",
        })
        send_notification_email(user.email, f"Draft vorbereitet: {item.title}", "Ein E-Mail-Draft wurde für deine Prüfung erstellt.", "recommendation")
        item.progress_pct = 42.0
        item.progress_stage = "queued"
        item.next_action_text = "Draft prüfen, Betreff freigeben und Kampagnen-Performance messen."

    webhook_result = await deliver_webhook_action(db, integration_user.id, {
        "action_request_id": item.id,
        "title": item.title,
        "execution_type": item.execution_type,
        "execution_ref": item.execution_ref,
        "status": "executed",
    })
    if webhook_result:
        payload = json.loads(item.artifact_payload) if item.artifact_payload else {}
        payload["webhook"] = webhook_result
        item.artifact_payload = json.dumps(payload)

    db.add(ActionLog(
        title=item.title,
        description=item.description,
        category=item.category,
        impact_pct=item.impact_score,
        status="done",
    ))
    record_outcome_placeholder(
        db=db,
        action_request_id=item.id,
        recommendation_id=item.recommendation_id,
        event_id=item.event_id,
        title=item.title,
        category=item.category,
        predicted_impact_pct=item.impact_score,
        predicted_roi_score=max(0.0, (item.impact_score or 0.0) - (item.risk_score or 0.0) * 0.4),
        confidence_score=max(35.0, 100.0 - (item.risk_score or 0.0)),
    )
    item.status = "executed"
    item.executed_at = datetime.utcnow()


def _record_review(item: ActionRequest, current_user: User, role: str, decision: str, note: Optional[str], db: Session) -> None:
    db.add(ActionRequestReview(
        action_request_id=item.id,
        reviewer_email=current_user.email,
        reviewer_role=role,
        decision=decision,
        note=note,
    ))


def _review_history(db: Session, action_request_id: int) -> list[dict]:
    rows = (
        db.query(ActionRequestReview)
        .filter(ActionRequestReview.action_request_id == action_request_id)
        .order_by(ActionRequestReview.created_at.asc())
        .all()
    )
    return [
        {
            "id": row.id,
            "reviewer_email": row.reviewer_email,
            "reviewer_role": row.reviewer_role,
            "decision": row.decision,
            "note": row.note,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.post("/simulate")
def simulate_action_request(
    body: SimulationBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del db, current_user
    impact = body.impact_score or 0.0
    risk = body.risk_score or 0.0
    hours = body.estimated_hours or 0.0
    roi_score = round(max(0.0, impact * 1.4 - risk * 0.8 - hours * 1.2), 1)
    confidence = round(max(40.0, min(92.0, 78.0 - risk * 0.35 + impact * 0.12)), 1)
    scenario = "scale_up" if impact >= 18 and risk <= 35 else "controlled_test" if risk <= 55 else "pilot_only"
    return {
        "scenario": scenario,
        "summary": f"{body.title}: erwarteter KPI-Uplift bei kontrollierbarem Risiko.",
        "projected": {
            "kpi_uplift_pct": round(impact, 1),
            "new_customers": max(1, int(impact / 6)) if impact else 0,
            "reach_uplift_pct": round(impact * 0.5, 1),
            "revenue_uplift_pct": round(impact * 0.35, 1),
            "roi_score": roi_score,
            "execution_hours": round(hours, 1),
            "confidence": confidence,
        },
        "guardrails": [
            "Nur nach Nutzerfreigabe ausführen",
            "Ergebnis nach 7-14 Tagen messen",
            "Bei KPI-Verschlechterung eskalieren",
        ],
    }


@router.get("")
def list_action_requests(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    role = get_workspace_role(db, current_user, workspace_id)
    settings = get_policy_settings(db, workspace_id)
    query = db.query(ActionRequest).order_by(ActionRequest.created_at.desc())
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Ungültiger Status.")
        query = query.filter(ActionRequest.status == status)
    items = query.limit(50).all()
    return {"items": [
        {
            **_to_response(item, build_policy_snapshot(role, item.risk_score, item.impact_score, settings=settings)),
            "review_history": _review_history(db, item.id),
        }
        for item in items
    ]}


@router.post("")
def create_action_request(
    body: ActionRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    if body.execution_type not in VALID_EXECUTION_TYPES:
        raise HTTPException(status_code=400, detail="Ungültiger Execution Type.")

    item = ActionRequest(
        event_id=body.event_id,
        recommendation_id=body.recommendation_id,
        title=body.title,
        description=body.description,
        category=body.category,
        priority=body.priority,
        impact_score=body.impact_score,
        risk_score=body.risk_score,
        estimated_hours=body.estimated_hours,
        execution_type=body.execution_type,
        status="pending_approval",
        requested_by=current_user.email,
        execution_plan_json=json.dumps(_build_execution_plan(body.execution_type, body.target_systems or [], body.template_name, body.prepared_assets)),
        target_systems_json=json.dumps(body.target_systems or []),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    role = get_workspace_role(db, current_user, workspace_id)
    settings = get_policy_settings(db, workspace_id)
    return _to_response(item, build_policy_snapshot(role, item.risk_score, item.impact_score, settings=settings))


@router.get("/{request_id}/artifact")
def get_action_request_artifact(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    item = db.query(ActionRequest).filter(ActionRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action Request nicht gefunden.")
    return {
        "id": item.id,
        "execution_ref": item.execution_ref,
        "artifact": json.loads(item.artifact_payload) if item.artifact_payload else None,
        "live_feedback": json.loads(item.live_feedback_json) if item.live_feedback_json else None,
        "review_history": _review_history(db, item.id),
    }


@router.post("/{request_id}/sync-live")
async def sync_action_request_live_feedback(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    item = db.query(ActionRequest).filter(ActionRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action Request nicht gefunden.")
    if item.status != "executed":
        raise HTTPException(status_code=400, detail="Live-Sync ist erst nach Ausführung möglich.")

    integration_user = _resolve_integration_user(db, current_user, item)
    result = await sync_action_live_feedback(db, integration_user.id, workspace_id, item)
    db.commit()
    db.refresh(item)
    return {
        "result": result,
        "item": _to_response(item),
    }


@router.post("/live-feedback/webhook")
def receive_live_feedback_webhook(
    body: LiveFeedbackBody,
    x_intlyst_webhook_secret: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    if not validate_live_feedback_secret(db, x_intlyst_webhook_secret):
        raise HTTPException(status_code=403, detail="Ungültiges Live-Feedback-Secret.")
    if not body.action_request_id and not body.execution_ref:
        raise HTTPException(status_code=400, detail="action_request_id oder execution_ref ist erforderlich.")
    if not body.metrics:
        raise HTTPException(status_code=400, detail="metrics darf nicht leer sein.")

    item = find_action_for_live_feedback(db, body.action_request_id, body.execution_ref)
    if not item:
        raise HTTPException(status_code=404, detail="Passende Action Request nicht gefunden.")

    sanitized = _sanitize_live_metrics(body.metrics)
    if not sanitized:
        raise HTTPException(status_code=400, detail="metrics enthalten keine gueltigen Werte.")
    payload = ingest_live_feedback(db, item, body.source, sanitized, body.note)
    db.commit()
    db.refresh(item)
    return {
        "status": "ok",
        "action_request_id": item.id,
        "live_feedback": payload,
    }


@router.post("/{request_id}/approve")
async def approve_action_request(
    request_id: int,
    body: ApprovalBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    item = db.query(ActionRequest).filter(ActionRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action Request nicht gefunden.")
    if item.status not in {"pending_approval", "approved"}:
        raise HTTPException(status_code=400, detail="Action Request kann nicht freigegeben werden.")
    role = get_workspace_role(db, current_user, workspace_id)
    settings = get_policy_settings(db, workspace_id)
    allowed, policy = can_approve_action(role, item.risk_score, item.impact_score, settings=settings)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Freigabe nicht erlaubt. Erforderliche Rolle: {policy['required_role']}. Deine Rolle: {role}.",
        )

    history = _review_history(db, item.id)
    if any(review["reviewer_email"] == current_user.email and review["decision"] == "approved" for review in history):
        raise HTTPException(status_code=409, detail="Du hast diesen Request bereits freigegeben.")

    _record_review(item, current_user, role, "approved", body.note, db)
    approval_count = len([review for review in history if review["decision"] == "approved"]) + 1

    item.status = "approved"
    item.approved_by = current_user.email
    item.approval_note = body.note
    item.approved_at = datetime.utcnow()

    # Determine if dual review is required: by policy OR by category
    category_requires_dual = (item.category or "").lower() in _ALWAYS_DUAL_REVIEW_CATEGORIES
    policy_requires_dual = policy.get("requires_dual_review", False)
    needs_dual = policy_requires_dual or category_requires_dual

    # AI-generated suggestions: NEVER auto-execute
    is_ai_suggestion = item.execution_type == _AI_EXECUTION_TYPE

    if needs_dual and approval_count < 2:
        item.progress_pct = max(item.progress_pct, 15.0)
        item.progress_stage = "awaiting_second_approval"
        item.next_action_text = "Zweite Freigabe eines berechtigten Reviewers ausstehend."
    elif is_ai_suggestion:
        item.progress_stage = "approved_pending_manual_execution"
        item.next_action_text = "KI-Vorschlag freigegeben — manuelle Ausführung erforderlich."
    elif body.execute_now and policy.get("auto_execute_on_approval", True):
        await _execute_action_request(item, current_user, db, body.assigned_to)

    db.commit()
    db.refresh(item)

    # Audit log
    ws_role = _get_workspace_role(current_user, workspace_id, db)
    record_audit_event(
        db, workspace_id, current_user.id, ws_role,
        action="action_request_approved",
        entity_type="action_request", entity_id=item.id,
        metadata_json=json.dumps({"title": item.title, "note": body.note, "dual_required": needs_dual, "is_ai": is_ai_suggestion}),
    )
    return {**_to_response(item, policy), "review_history": _review_history(db, item.id)}


@router.post("/{request_id}/reject")
def reject_action_request(
    request_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    item = db.query(ActionRequest).filter(ActionRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action Request nicht gefunden.")
    if item.status not in {"pending_approval", "approved"}:
        raise HTTPException(status_code=400, detail="Action Request kann nicht abgelehnt werden.")
    role = get_workspace_role(db, current_user, workspace_id)
    settings = get_policy_settings(db, workspace_id)
    allowed, policy = can_approve_action(role, item.risk_score, item.impact_score, settings=settings)
    if not allowed and role == "member":
        raise HTTPException(status_code=403, detail="Members können keine Action Requests ablehnen.")

    _record_review(item, current_user, role, "rejected", body.note, db)
    item.status = "rejected"
    item.rejected_by = current_user.email
    item.approval_note = body.note
    item.rejected_at = datetime.utcnow()
    item.progress_stage = "rejected"
    db.commit()
    db.refresh(item)

    ws_role = _get_workspace_role(current_user, workspace_id, db)
    record_audit_event(
        db, workspace_id, current_user.id, ws_role,
        action="action_request_rejected",
        entity_type="action_request", entity_id=item.id,
        metadata_json=json.dumps({"title": item.title, "note": body.note}),
    )
    return {**_to_response(item, policy), "review_history": _review_history(db, item.id)}


@router.post("/{request_id}/confirm-second")
async def confirm_second_approval(
    request_id: int,
    body: ApprovalBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Second-reviewer confirmation for dual-review actions (budget, forecasts, high-risk)."""
    item = db.query(ActionRequest).filter(ActionRequest.id == request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action Request nicht gefunden.")
    if item.status != "approved" or item.progress_stage != "awaiting_second_approval":
        raise HTTPException(status_code=400, detail="Dieser Request erwartet keine zweite Bestätigung.")

    ws_role = _get_workspace_role(current_user, workspace_id, db)
    if ws_role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Zweite Bestätigung erfordert mindestens Manager-Berechtigung.")

    if item.approved_by == current_user.email:
        raise HTTPException(status_code=409, detail="Der zweite Reviewer muss ein anderer Nutzer sein als der erste.")

    settings = get_policy_settings(db, workspace_id)
    role = get_workspace_role(db, current_user, workspace_id)
    _, policy = can_approve_action(role, item.risk_score, item.impact_score, settings=settings)

    _record_review(item, current_user, ws_role, "approved", body.note, db)
    item.approval_note = (item.approval_note or "") + f" | 2nd: {body.note or 'confirmed'}"
    item.progress_stage = "dual_approved"
    item.next_action_text = "Dual-Freigabe abgeschlossen — bereit zur Ausführung."

    is_ai_suggestion = item.execution_type == _AI_EXECUTION_TYPE
    if body.execute_now and not is_ai_suggestion and policy.get("auto_execute_on_approval", True):
        await _execute_action_request(item, current_user, db, body.assigned_to)

    db.commit()
    db.refresh(item)

    record_audit_event(
        db, workspace_id, current_user.id, ws_role,
        action="action_request_second_confirmed",
        entity_type="action_request", entity_id=item.id,
        metadata_json=json.dumps({"title": item.title, "second_reviewer": current_user.email}),
    )
    return {**_to_response(item, policy), "review_history": _review_history(db, item.id)}


@router.get("/command-center")
def command_center(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """List all pending AI suggestions for manual approval/execution."""
    ws_role = _get_workspace_role(current_user, workspace_id, db)

    query = db.query(ActionRequest).filter(
        ActionRequest.workspace_id == workspace_id,
        ActionRequest.execution_type == _AI_EXECUTION_TYPE,
        ActionRequest.status.in_(["pending_approval", "approved"]),
    )
    if ws_role not in MANAGER_ROLES:
        query = query.filter(ActionRequest.requested_by == current_user.email)

    items = query.order_by(ActionRequest.created_at.desc()).limit(200).all()
    return {
        "viewer_role": ws_role,
        "items": [_to_response(item) for item in items],
        "count": len(items),
    }
