"""
ai_team_service.py
Manages AI Team agents (AIAgent) and generates/persists role-specific AI outputs (AIOutput).

Each workspace has 6 default agents: ceo, coo, cmo, cfo, strategist, assistant.
Each agent generates role-specific outputs using the existing enterprise_ai_service (Claude).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from models.ai_agent import AIAgent, DEFAULT_AI_AGENTS
from models.ai_output import AIOutput
from models.activity_log_di import ActivityLog

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")


# ── Role-specific system prompts ──────────────────────────────────────────────

_ROLE_PROMPTS: dict[str, str] = {
    "ceo": (
        "You are an AI CEO advisor. Analyze the provided business context and deliver:\n"
        "1. Top 3 strategic priorities this week\n"
        "2. Most critical risk to address\n"
        "3. Biggest opportunity to capture\n"
        "4. One key management decision needed\n"
        "Be concise, direct, and executive-level. Focus on impact and urgency."
    ),
    "coo": (
        "You are an AI COO advisor. Analyze the provided business context and deliver:\n"
        "1. Top operational bottlenecks blocking performance\n"
        "2. Resource gaps or capacity issues\n"
        "3. Process improvements with highest ROI\n"
        "4. Priority task sequence for the operations team\n"
        "Focus on execution, efficiency, and removing blockers."
    ),
    "cmo": (
        "You are an AI CMO advisor. Analyze the provided business context and deliver:\n"
        "1. Marketing channel performance assessment\n"
        "2. Lead quality and conversion opportunities\n"
        "3. Content or campaign recommendations\n"
        "4. Audience or reach expansion potential\n"
        "Focus on growth, brand, and revenue impact of marketing."
    ),
    "cfo": (
        "You are an AI CFO advisor. Analyze the provided business context and deliver:\n"
        "1. Financial health assessment (cashflow, margin, P&L)\n"
        "2. Key financial risks in the next 30 days\n"
        "3. Budget optimization opportunities\n"
        "4. Investment or cost-reduction recommendations\n"
        "Be precise with numbers. Flag anything that threatens financial stability."
    ),
    "strategist": (
        "You are an AI Business Strategist. Analyze the provided business context and deliver:\n"
        "1. Market trend assessment\n"
        "2. Competitive positioning insights\n"
        "3. Long-term strategic opportunities (3–12 month horizon)\n"
        "4. Strategic risks and how to mitigate them\n"
        "Think in terms of competitive advantage, positioning, and sustainable growth."
    ),
    "assistant": (
        "You are an AI Business Assistant. Based on the provided context:\n"
        "1. Summarize the most important open items\n"
        "2. Structure pending tasks by priority\n"
        "3. Highlight what needs review or decision this week\n"
        "4. Note any progress or achievements worth recognizing\n"
        "Be organized, clear, and actionable. Help the team stay on track."
    ),
}


# ── Agent initialization ───────────────────────────────────────────────────────

def get_or_init_agents(db: Session, workspace_id: int) -> list[AIAgent]:
    """Ensure all 6 default agents exist for a workspace. Create missing ones."""
    existing = {
        a.role: a
        for a in db.query(AIAgent).filter(AIAgent.workspace_id == workspace_id).all()
    }
    created: list[AIAgent] = []
    for cfg in DEFAULT_AI_AGENTS:
        if cfg["role"] not in existing:
            agent = AIAgent(
                workspace_id=workspace_id,
                role=cfg["role"],
                display_name=cfg["display_name"],
                focus_areas=json.dumps(cfg["focus_areas"]),
                output_types=json.dumps(cfg["output_types"]),
                is_active=True,
            )
            db.add(agent)
            created.append(agent)
    if created:
        db.commit()
        for a in created:
            db.refresh(a)
    return list(existing.values()) + created


def get_agents(db: Session, workspace_id: int) -> list[AIAgent]:
    return db.query(AIAgent).filter(
        AIAgent.workspace_id == workspace_id, AIAgent.is_active == True
    ).all()


# ── Output generation ─────────────────────────────────────────────────────────

def generate_role_output(
    db: Session,
    workspace_id: int,
    role: str,
    context: dict[str, Any],
    actor_user_id: int | None = None,
) -> AIOutput:
    """
    Generate a role-specific AI analysis using Claude and persist as AIOutput.
    `context` should contain relevant KPI data, goals, tasks, and insights.
    """
    system_prompt = _get_system_prompt(db, workspace_id, role)
    user_message = _build_context_message(context)

    content = _call_claude(system_prompt, user_message)

    output = AIOutput(
        workspace_id=workspace_id,
        agent_role=role,
        output_type=_default_output_type(role),
        content=content,
        structured_data=json.dumps({"context_keys": list(context.keys())}),
        priority=_infer_priority(content),
        confidence_score=75.0,
        impact_score=60.0,
        status="new",
    )
    db.add(output)

    # Update agent last_triggered_at
    agent = db.query(AIAgent).filter(
        AIAgent.workspace_id == workspace_id, AIAgent.role == role
    ).first()
    if agent:
        agent.last_triggered_at = datetime.utcnow()

    # Audit log
    _log_activity(db, workspace_id=workspace_id, user_id=actor_user_id,
                  ai_agent_role=role, action_type="generate",
                  entity_type="ai_output", reason=f"Role output generated: {role}")

    db.commit()
    db.refresh(output)
    logger.info("AIOutput %s generated (workspace=%s role=%s)", output.id, workspace_id, role)
    return output


def get_outputs_by_role(
    db: Session,
    workspace_id: int,
    role: str,
    limit: int = 20,
    status: str | None = None,
) -> list[AIOutput]:
    q = db.query(AIOutput).filter(
        AIOutput.workspace_id == workspace_id,
        AIOutput.agent_role == role,
    )
    if status:
        q = q.filter(AIOutput.status == status)
    return q.order_by(AIOutput.generated_at.desc()).limit(limit).all()


def submit_output_feedback(
    db: Session,
    workspace_id: int,
    output_id: int,
    rating: int,
    comment: str | None = None,
    user_id: int | None = None,
) -> AIOutput | None:
    output = (
        db.query(AIOutput)
        .filter(AIOutput.workspace_id == workspace_id, AIOutput.id == output_id)
        .first()
    )
    if not output:
        return None
    output.feedback_rating = rating
    output.feedback_comment = comment
    output.feedback_at = datetime.utcnow()
    output.status = "acknowledged"
    db.commit()
    db.refresh(output)
    return output


# ── Private helpers ────────────────────────────────────────────────────────────

def _get_system_prompt(db: Session, workspace_id: int, role: str) -> str:
    agent = db.query(AIAgent).filter(
        AIAgent.workspace_id == workspace_id, AIAgent.role == role
    ).first()
    if agent and agent.system_prompt_override:
        return agent.system_prompt_override
    return _ROLE_PROMPTS.get(role, _ROLE_PROMPTS["assistant"])


def _build_context_message(context: dict[str, Any]) -> str:
    lines = ["# Business Context\n"]
    for key, value in context.items():
        if value is None:
            continue
        label = key.replace("_", " ").title()
        if isinstance(value, (dict, list)):
            lines.append(f"## {label}\n```json\n{json.dumps(value, indent=2, default=str)}\n```\n")
        else:
            lines.append(f"## {label}\n{value}\n")
    lines.append("\nProvide your analysis based on the above context.")
    return "\n".join(lines)


def _call_claude(system_prompt: str, user_message: str) -> str:
    """Call Claude API synchronously. Returns text content."""
    if not ANTHROPIC_API_KEY:
        logger.warning("No ANTHROPIC_API_KEY – returning placeholder AI output")
        return "[AI output unavailable: ANTHROPIC_API_KEY not configured]"

    try:
        headers = {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": CLAUDE_MODEL,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }
        with httpx.Client(timeout=30.0) as client:
            resp = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]
    except Exception as exc:
        logger.error("Claude API call failed: %s", exc)
        return f"[AI analysis temporarily unavailable: {exc}]"


def _default_output_type(role: str) -> str:
    mapping = {
        "ceo": "strategic_priority",
        "coo": "action_plan",
        "cmo": "analysis",
        "cfo": "analysis",
        "strategist": "opportunity",
        "assistant": "summary",
    }
    return mapping.get(role, "analysis")


def _infer_priority(content: str) -> str:
    content_lower = content.lower()
    if any(w in content_lower for w in ["critical", "urgent", "immediate", "crisis", "dringend"]):
        return "critical"
    if any(w in content_lower for w in ["high priority", "important", "significant", "major"]):
        return "high"
    if any(w in content_lower for w in ["low priority", "minor", "eventually", "nice to have"]):
        return "low"
    return "medium"


def _log_activity(db: Session, workspace_id: int, action_type: str, entity_type: str,
                  user_id: int | None = None, ai_agent_role: str | None = None,
                  entity_id: str | None = None, reason: str | None = None) -> None:
    try:
        log = ActivityLog(
            workspace_id=workspace_id,
            user_id=user_id,
            ai_agent_role=ai_agent_role,
            action_type=action_type,
            entity_type=entity_type,
            entity_id=entity_id,
            reason=reason,
        )
        db.add(log)
    except Exception as exc:
        logger.warning("Activity log failed: %s", exc)
