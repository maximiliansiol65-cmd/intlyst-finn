from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from models.task import Task
from models.user_event import UserEvent
from models.user_profile import UserProfile

DEFAULT_PROFILE = {
    "priority_focus": "analyse",
    "preferred_task_size": "mittel",
    "preferred_dashboard": "kpi",
    "working_time": "Morgen",
    "content_style": "professionell",
    "behavior_type": "strategisch",
}

DASHBOARD_SECTIONS = ["umsatz", "kpi", "tasks", "strategy", "social_media", "marketing", "analysis", "growth"]


def _safe_json_loads(payload: Optional[str]) -> dict:
    if not payload:
        return {}
    try:
        return json.loads(payload)
    except Exception:
        return {}


def _normalize(counter: Counter) -> dict[str, float]:
    total = sum(counter.values())
    if not total:
        return {}
    return {k: round(v / total, 3) for k, v in counter.most_common()}


def _daypart(dt: datetime) -> str:
    hour = dt.hour
    if 5 <= hour < 11:
        return "Morgen"
    if 11 <= hour < 15:
        return "Mittag"
    if 15 <= hour < 21:
        return "Abend"
    return "Nacht"


def record_user_event(
    db: Session,
    *,
    user_id: int,
    workspace_id: Optional[int],
    payload: dict,
) -> UserEvent:
    metadata = payload.get("metadata") or {}
    outcome = payload.get("outcome")
    if outcome is None and payload.get("accepted") is True:
        outcome = "accepted"
    elif outcome is None and payload.get("accepted") is False:
        outcome = "ignored"

    event = UserEvent(
        user_id=user_id,
        workspace_id=workspace_id or 1,
        event_type=payload.get("event_type", "unknown"),
        page=payload.get("page"),
        kpi=payload.get("kpi"),
        feature=payload.get("feature"),
        task_id=payload.get("task_id"),
        suggestion_id=payload.get("suggestion_id"),
        content_style=payload.get("content_style"),
        content_length=payload.get("content_length"),
        tone=payload.get("tone"),
        outcome=outcome,
        duration_ms=payload.get("duration_ms"),
        extra=json.dumps(metadata),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def _aggregate_events(events: Iterable[UserEvent]) -> Tuple[dict, datetime | None]:
    stats: dict[str, Any] = {
        "event_counts": Counter(),
        "kpi_views": Counter(),
        "page_views": Counter(),
        "feature_use": Counter(),
        "task_interactions": Counter(),
        "task_times_ms": [],
        "suggestion_accept": Counter(),
        "suggestion_ignore": Counter(),
        "content_styles": Counter(),
        "content_lengths": Counter(),
        "tones": Counter(),
        "dayparts": Counter(),
        "first_pages": Counter(),
    }
    latest: datetime | None = None

    for ev in events:
        stats["event_counts"][ev.event_type] += 1
        if ev.kpi:
            stats["kpi_views"][ev.kpi] += 1
        if ev.page:
            stats["page_views"][ev.page] += 1
        if ev.feature:
            stats["feature_use"][ev.feature] += 1
        if ev.task_id:
            stats["task_interactions"][str(ev.task_id)] += 1
        if ev.duration_ms and ev.event_type in {"task_open", "task_complete"}:
            stats["task_times_ms"].append(ev.duration_ms)

        ctx = _safe_json_loads(ev.extra)
        category = ctx.get("category") or ctx.get("topic") or ev.feature or "general"
        if ev.outcome == "accepted":
            stats["suggestion_accept"][category] += 1
        if ev.outcome in {"ignored", "skipped"}:
            stats["suggestion_ignore"][category] += 1
        if ev.content_style:
            stats["content_styles"][ev.content_style] += 1
        if ev.content_length:
            stats["content_lengths"][ev.content_length] += 1
        if ev.tone:
            stats["tones"][ev.tone] += 1
        if ev.created_at:
            stats["dayparts"][_daypart(ev.created_at)] += 1
            latest = ev.created_at if latest is None or ev.created_at > latest else latest
        if ev.event_type == "app_open" and ev.page:
            stats["first_pages"][ev.page] += 1
    return stats, latest


def _infer_priority_focus(stats: dict) -> str:
    kpi_counts = stats.get("kpi_views", Counter())
    feature_counts = stats.get("feature_use", Counter())
    candidate = None

    if kpi_counts:
        top_kpi, _ = kpi_counts.most_common(1)[0]
        if any(x in top_kpi.lower() for x in ["revenue", "umsatz", "sales"]):
            candidate = "umsatz"
        elif "traffic" in top_kpi.lower() or "social" in top_kpi.lower():
            candidate = "social_media"
        elif "growth" in top_kpi.lower() or "kunden" in top_kpi.lower():
            candidate = "wachstum"
        elif "conversion" in top_kpi.lower():
            candidate = "marketing"
        else:
            candidate = top_kpi

    if not candidate and feature_counts:
        top_feature, _ = feature_counts.most_common(1)[0]
        if "social" in top_feature.lower():
            candidate = "social_media"
        elif "kpi" in top_feature.lower():
            candidate = "kpi"
        elif "task" in top_feature.lower():
            candidate = "tasks"
        elif "market" in top_feature.lower():
            candidate = "analysis"

    return candidate or DEFAULT_PROFILE["priority_focus"]


def _infer_preferred_dashboard(stats: dict, priority_focus: str) -> str:
    page_counts: Counter = stats.get("page_views", Counter())
    if page_counts:
        top_page, _ = page_counts.most_common(1)[0]
        if "social" in top_page.lower():
            return "social_media"
        if "revenue" in top_page.lower() or "umsatz" in top_page.lower():
            return "umsatz"
        if "tasks" in top_page.lower():
            return "tasks"
        if "kpi" in top_page.lower():
            return "kpi"
    return priority_focus if priority_focus in DASHBOARD_SECTIONS else DEFAULT_PROFILE["preferred_dashboard"]


def _infer_task_size(stats: dict) -> str:
    durations = stats.get("task_times_ms", [])
    if not durations:
        return DEFAULT_PROFILE["preferred_task_size"]
    avg_minutes = (sum(durations) / len(durations)) / 60000
    if avg_minutes >= 25:
        return "lang"
    if avg_minutes >= 10:
        return "mittel"
    return "kurz"


def _infer_content_style(stats: dict) -> str:
    style_counts: Counter = stats.get("content_styles", Counter())
    if style_counts:
        return style_counts.most_common(1)[0][0]
    length_counts: Counter = stats.get("content_lengths", Counter())
    tone_counts: Counter = stats.get("tones", Counter())
    length = length_counts.most_common(1)[0][0] if length_counts else "mittel"
    tone = tone_counts.most_common(1)[0][0] if tone_counts else "professionell"
    return f"{tone}-{length}"


def _infer_behavior_type(stats: dict) -> str:
    accept = sum(stats.get("suggestion_accept", {}).values())
    ignore = sum(stats.get("suggestion_ignore", {}).values())
    task_opens = stats.get("event_counts", Counter()).get("task_open", 0)
    task_done = stats.get("event_counts", Counter()).get("task_complete", 0)
    accept_rate = accept / max(1, accept + ignore)
    completion_rate = task_done / max(1, task_opens)

    if accept_rate >= 0.6 and completion_rate >= 0.6:
        return "schnell entscheidend"
    if completion_rate >= 0.6 and accept_rate < 0.4:
        return "operativ"
    if accept_rate >= 0.5 and completion_rate < 0.4:
        return "strategisch"
    return "vorsichtig"


def build_profile(stats: dict) -> dict:
    priority_focus = _infer_priority_focus(stats)
    profile = {
        "priority_focus": priority_focus,
        "preferred_task_size": _infer_task_size(stats),
        "preferred_dashboard": _infer_preferred_dashboard(stats, priority_focus),
        "working_time": stats.get("dayparts", Counter()).most_common(1)[0][0] if stats.get("dayparts") else DEFAULT_PROFILE["working_time"],
        "content_style": _infer_content_style(stats),
        "behavior_type": _infer_behavior_type(stats),
    }
    return profile


def _score_user(events: list[UserEvent], stats: dict) -> float:
    now = datetime.utcnow()
    recent = [e for e in events if e.created_at and e.created_at >= now - timedelta(days=7)]
    accept = sum(stats.get("suggestion_accept", {}).values())
    ignore = sum(stats.get("suggestion_ignore", {}).values())
    accept_rate = accept / max(1, accept + ignore)
    task_opens = stats.get("event_counts", Counter()).get("task_open", 0)
    task_done = stats.get("event_counts", Counter()).get("task_complete", 0)
    completion_rate = task_done / max(1, task_opens)
    score = 35 + len(recent) * 3 + accept_rate * 25 + completion_rate * 25
    return round(min(score, 100), 2)


def compute_scores(events: list[UserEvent], stats: dict, profile: dict) -> dict:
    dashboard_priority = _normalize(stats.get("page_views", Counter()))
    kpi_focus = _normalize(stats.get("kpi_views", Counter()))
    suggestion_priority = _normalize(stats.get("suggestion_accept", Counter()) or stats.get("suggestion_ignore", Counter()))

    content_style_score = {}
    style = profile.get("content_style")
    if style:
        content_style_score[style] = 1.0
    for alt, weight in (_normalize(stats.get("content_styles", Counter())) or {}).items():
        content_style_score.setdefault(alt, weight)

    task_priority = {}
    if kpi_focus:
        # tie task priority to KPI focus
        task_priority = {k: v for k, v in kpi_focus.items()}
    else:
        task_priority = {profile["priority_focus"]: 1.0}

    return {
        "user_priority_score": _score_user(events, stats),
        "dashboard_priority": dashboard_priority,
        "task_priority": task_priority,
        "content_style_score": content_style_score,
        "suggestion_priority": suggestion_priority,
        "kpi_focus": kpi_focus,
    }


def _persist_profile(db: Session, user_id: int, workspace_id: int, profile: dict, scores: dict, last_event: datetime | None):
    row = (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id, UserProfile.workspace_id == (workspace_id or 1))
        .first()
    )
    serialized_profile = json.dumps(profile)
    serialized_scores = json.dumps(scores)
    kpi_focus_json = json.dumps(scores.get("kpi_focus", {}))

    if not row:
        row = UserProfile(
            user_id=user_id,
            workspace_id=workspace_id or 1,
            priority_focus=profile.get("priority_focus"),
            preferred_task_size=profile.get("preferred_task_size"),
            preferred_dashboard=profile.get("preferred_dashboard"),
            working_time=profile.get("working_time"),
            content_style=profile.get("content_style"),
            behavior_type=profile.get("behavior_type"),
            kpi_focus_json=kpi_focus_json,
            scores_json=serialized_scores,
            profile_json=serialized_profile,
            last_event_at=last_event,
        )
        db.add(row)
    else:
        row.priority_focus = profile.get("priority_focus")
        row.preferred_task_size = profile.get("preferred_task_size")
        row.preferred_dashboard = profile.get("preferred_dashboard")
        row.working_time = profile.get("working_time")
        row.content_style = profile.get("content_style")
        row.behavior_type = profile.get("behavior_type")
        row.kpi_focus_json = kpi_focus_json
        row.scores_json = serialized_scores
        row.profile_json = serialized_profile
        row.last_event_at = last_event
        row.updated_at = datetime.utcnow()
    db.commit()
    return row


def _task_kpis(task: Task) -> list[str]:
    if not task.kpis_json:
        return []
    try:
        return [str(x) for x in json.loads(task.kpis_json) if x]
    except Exception:
        return []


def personalize_tasks(tasks: list[Task], profile: dict, scores: dict) -> list[dict]:
    prioritized = []
    focus = str(profile.get("priority_focus") or "").strip().lower()
    focus_scores = scores.get("kpi_focus", {})
    preferred_size = profile.get("preferred_task_size", "mittel")

    for task in tasks:
        base = {"high": 0.8, "medium": 0.6, "low": 0.4}.get(task.priority, 0.5)
        priority_rank = {"high": 3, "medium": 2, "low": 1}.get(task.priority, 0)
        kpis = _task_kpis(task)
        kpi_match = max((focus_scores.get(k, 0) for k in kpis), default=0) if kpis else 0

        task_text = " ".join(filter(None, [task.title, task.description, task.goal])).lower()
        focus_text_match = 0.15 if focus and focus in task_text else 0.0
        if not kpi_match:
            kpi_match = focus_text_match

        due_bonus = 0.1 if task.due_date and (task.due_date - datetime.utcnow().date()).days <= 3 else 0

        recency_bonus = 0.0
        created_at = getattr(task, "created_at", None)
        if isinstance(created_at, datetime):
            age_hours = max(0.0, (datetime.utcnow() - created_at).total_seconds() / 3600)
            recency_bonus = max(0.0, 0.06 - min(age_hours / (24 * 7), 1.0) * 0.06)

        predicted = min(1.0, round(base + kpi_match * 0.4 + due_bonus + recency_bonus, 3))

        display_size = "medium"
        if preferred_size == "kurz":
            display_size = "compact" if predicted < 0.7 else "medium"
        elif preferred_size == "mittel":
            display_size = "medium"
        else:
            display_size = "large" if predicted >= 0.65 else "medium"

        reason_parts = []
        if kpi_match:
            reason_parts.append("passt zu deinem KPI-Fokus")
        if due_bonus:
            reason_parts.append("Fälligkeits-Bonus")
        if recency_bonus:
            reason_parts.append("aktuell und relevant")
        if not reason_parts:
            reason_parts.append("Grundpriorität der Aufgabe")

        prioritized.append({
            "id": task.id,
            "title": task.title,
            "priority": task.priority,
            "predicted_success": predicted,
            "display_size": display_size,
            "reason": "; ".join(reason_parts),
            "_sort_kpi_match": round(kpi_match, 3),
            "_sort_due_bonus": round(due_bonus, 3),
            "_sort_priority": priority_rank,
            "_sort_created_at": created_at.timestamp() if isinstance(created_at, datetime) else 0.0,
        })

    prioritized.sort(
        key=lambda item: (
            item["predicted_success"],
            item["_sort_kpi_match"],
            item["_sort_due_bonus"],
            item["_sort_priority"],
            item["_sort_created_at"],
            item["id"],
        ),
        reverse=True,
    )

    for item in prioritized:
        item.pop("_sort_kpi_match", None)
        item.pop("_sort_due_bonus", None)
        item.pop("_sort_priority", None)
        item.pop("_sort_created_at", None)

    return prioritized


def build_dashboard_state(profile: dict, scores: dict) -> dict:
    order = []
    dashboard_priority = scores.get("dashboard_priority") or {}
    fallback = list(DASHBOARD_SECTIONS)

    # Build ordered sections by score then fallback
    scored = sorted(dashboard_priority.items(), key=lambda kv: kv[1], reverse=True)
    order.extend([k for k, _ in scored])
    for section in fallback:
        if section not in order:
            order.append(section)

    top = order[:5]
    highlights = []
    if profile.get("priority_focus") and profile["priority_focus"] not in top:
        highlights.append(profile["priority_focus"])
    return {"order": order, "top": top, "highlights": highlights}


def build_content_preferences(profile: dict, scores: dict) -> dict:
    tone = "professionell"
    if "freundlich" in profile.get("content_style", ""):
        tone = "freundlich"
    elif "direkt" in profile.get("content_style", ""):
        tone = "direkt"

    length = "mittel"
    if "kurz" in profile.get("content_style", ""):
        length = "kurz"
    elif "lang" in profile.get("content_style", "") or "ausführlich" in profile.get("content_style", ""):
        length = "lang"

    target = "unternehmen" if profile.get("priority_focus") == "umsatz" else "kunden"
    return {
        "tone": tone,
        "length": length,
        "style": profile.get("content_style"),
        "target_audience": target,
        "rationale": f"Abgeleitet aus Verhaltenstyp {profile.get('behavior_type')} und Stil {profile.get('content_style')}",
        "scores": scores.get("content_style_score", {}),
    }


def build_state(db: Session, user_id: int, workspace_id: Optional[int] = None) -> dict:
    events = (
        db.query(UserEvent)
        .filter(UserEvent.user_id == user_id)
        .order_by(UserEvent.created_at.desc())
        .limit(2000)
        .all()
    )
    stats, last_event = _aggregate_events(events)
    profile = build_profile(stats)
    scores = compute_scores(events, stats, profile)
    _persist_profile(db, user_id, workspace_id or 1, profile, scores, last_event)

    current_workspace_id = workspace_id or 1
    tasks = (
        db.query(Task)
        .filter(Task.workspace_id == current_workspace_id)
        .filter(Task.status.in_(["open", "in_progress"]))
        .order_by(Task.created_at.desc())
        .all()
    )
    return {
        "generated_at": datetime.utcnow().isoformat(),
        "profile": profile,
        "scores": scores,
        "dashboard": build_dashboard_state(profile, scores),
        "tasks": personalize_tasks(tasks, profile, scores),
        "suggestions": scores.get("suggestion_priority", {}),
        "content": build_content_preferences(profile, scores),
    }
