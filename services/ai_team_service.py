"""
ai_team_service.py
Manages AI Team agents (AIAgent) and generates/persists role-specific AI outputs (AIOutput).

Each workspace has 6 default agents: ceo, coo, cmo, cfo, strategist, assistant.
Each agent generates role-specific outputs using the existing enterprise_ai_service (Claude).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from services.claude_runtime import (
    CLAUDE_API_URL,
    build_claude_headers,
    build_claude_payload,
    get_claude_runtime_config,
)
from security_config import is_configured_secret
from models.ai_agent import AIAgent, DEFAULT_AI_AGENTS
from models.ai_output import AIOutput
from models.activity_log_di import ActivityLog
from services.decision_prompting import build_role_decision_prompt, MARKETING_SALES_DECISION_APPENDIX
from services.ai_output_schema import (
    STRUCTURED_OUTPUT_INSTRUCTION,
    parse_structured_output,
    compute_business_impact_score,
    compute_confidence_score,
    infer_priority_from_score,
    get_role_historical_accuracy,
)
from services.ai_output_linker import AIOutputEntityLinks, resolve_ai_output_entity_links
from services.ai_task_factory import create_tasks_from_ai_output

logger = logging.getLogger(__name__)


# ── Role-specific system prompts ──────────────────────────────────────────────

_ROLE_PROMPTS: dict[str, str] = {
    "ceo": build_role_decision_prompt("ceo", "Strategie, Prioritaeten, Risiken, wichtigste Management-Entscheidung"),
    "coo": build_role_decision_prompt("coo", "Bottlenecks, Sequenzierung, operative Umsetzung, Effizienz"),
    "cmo": (
        build_role_decision_prompt("cmo", "Marketing, Pipeline, Conversion, Kampagnenleistung, Wachstum")
        + "\n\n"
        + MARKETING_SALES_DECISION_APPENDIX
    ),
    "cfo": build_role_decision_prompt("cfo", "Cashflow, Marge, Budgetallokation, finanzielle Risiken"),
    "strategist": build_role_decision_prompt("strategist", "Positionierung, Marktchancen, strukturelles Wachstum"),
    "assistant": build_role_decision_prompt("assistant", "offene Entscheidungen, Priorisierung, naechste Schritte"),
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
    # Append JSON schema instruction so Claude returns structured output
    system_prompt_with_schema = system_prompt + "\n\n" + STRUCTURED_OUTPUT_INSTRUCTION
    user_message = _build_context_message(context)

    raw_response = _call_claude(system_prompt_with_schema, user_message)

    # Parse structured output; fall back to raw text on failure
    structured, prose_content = parse_structured_output(raw_response)

    linked_kpi_id = None
    linked_task_id = None
    linked_goal_id = None
    entity_links = AIOutputEntityLinks([], [], [])
    entity_links_payload = {"kpi_ids": [], "task_ids": [], "goal_ids": []}
    structured_payload: dict[str, object]
    if structured:
        # Compute scores from data signals, not keyword matching
        historical_acc = get_role_historical_accuracy(db, workspace_id, role)
        impact_score = compute_business_impact_score(structured)
        confidence_score = compute_confidence_score(structured, historical_accuracy=historical_acc)
        priority = infer_priority_from_score(impact_score, structured.urgency)
        output_type = structured.output_type
        entity_links = resolve_ai_output_entity_links(
            db,
            workspace_id,
            structured.affected_kpi_names or [],
            structured.suggested_tasks or [],
        )
        linked_kpi_id = entity_links.kpi_ids[0] if entity_links.kpi_ids else None
        linked_task_id = entity_links.task_ids[0] if entity_links.task_ids else None
        linked_goal_id = entity_links.goal_ids[0] if entity_links.goal_ids else None
        entity_links_payload = {
            "kpi_ids": entity_links.kpi_ids,
            "task_ids": entity_links.task_ids,
            "goal_ids": entity_links.goal_ids,
        }
        structured_payload = {
            "schema_version": "1.0",
            "what_is_happening": structured.what_is_happening,
            "root_cause": structured.root_cause,
            "business_meaning": structured.business_meaning,
            "recommended_action": structured.recommended_action,
            "expected_outcome": structured.expected_outcome,
            "urgency": structured.urgency,
            "scores": {
                "revenue_impact": structured.revenue_impact,
                "growth_impact": structured.growth_impact,
                "risk_impact": structured.risk_impact,
                "team_impact": structured.team_impact,
            },
            "affected_kpi_names": structured.affected_kpi_names,
            "suggested_tasks": structured.suggested_tasks,
            "timeframe": structured.timeframe,
            "entity_links": entity_links_payload,
        }
    else:
        # Fallback: text output, use defaults
        prose_content = raw_response
        impact_score = 50.0
        confidence_score = 60.0
        priority = _infer_priority(raw_response)
        output_type = _default_output_type(role)
        structured_payload = {
            "schema_version": "unstructured",
            "raw": True,
            "entity_links": entity_links_payload,
        }

    structured_data_json = json.dumps(structured_payload)

    output = AIOutput(
        workspace_id=workspace_id,
        agent_role=role,
        output_type=output_type,
        content=prose_content,
        structured_data=structured_data_json,
        priority=priority,
        linked_task_id=linked_task_id,
        linked_kpi_id=linked_kpi_id,
        linked_goal_id=linked_goal_id,
        confidence_score=confidence_score,
        impact_score=impact_score,
        status="new",
    )
    db.add(output)
    db.flush()
    created_task_ids: list[int] = []
    if structured:
        created_task_ids = create_tasks_from_ai_output(
            db,
            workspace_id,
            output,
            structured,
            entity_links,
        )
        if created_task_ids:
            entity_links.task_ids.extend(created_task_ids)
            entity_links_payload["task_ids"] = entity_links.task_ids
            structured_payload["entity_links"] = entity_links_payload
            structured_data_json = json.dumps(structured_payload)
            output.structured_data = structured_data_json
            if not linked_task_id:
                linked_task_id = created_task_ids[0]
                output.linked_task_id = linked_task_id

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
    api_key, claude_model = get_claude_runtime_config()
    if not is_configured_secret(api_key, prefixes=("sk-ant-",), min_length=20):
        logger.warning("No valid ANTHROPIC_API_KEY – returning placeholder AI output")
        return "[AI output unavailable: ANTHROPIC_API_KEY not configured]"

    try:
        headers = build_claude_headers(api_key)
        payload = build_claude_payload(
            user_message,
            model=claude_model,
            max_tokens=1024,
            system_prompt=system_prompt,
        )
        timeout = httpx.Timeout(30.0, connect=5.0)
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(CLAUDE_API_URL, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data.get("content") or []
            if not content:
                return "[AI analysis temporarily unavailable: empty Claude response]"
            return str(content[0].get("text", "") or "[AI analysis temporarily unavailable: empty content]")
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
