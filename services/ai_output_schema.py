"""
ai_output_schema.py
Phase 4: Structured JSON schema for AI team outputs.

Every AI role response is parsed against this schema before being stored.
Confidence and impact scores are computed from data signals, not from text.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ── Structured output schema ──────────────────────────────────────────────────

class AIOutputStructured(BaseModel):
    """
    The canonical shape of every AI team response.
    Claude is instructed to return JSON matching this schema.
    """
    # Core insight chain (mirrors Insight model's 5-question structure)
    what_is_happening: str = Field(..., description="What is the current situation / observation?")
    root_cause: str = Field(..., description="Why is this happening? Underlying driver.")
    business_meaning: str = Field(..., description="What does this mean for the business?")
    recommended_action: str = Field(..., description="The single most important action to take.")
    expected_outcome: str = Field(..., description="What result does taking this action produce?")

    # Scoring (AI's self-assessment, validated against data signals)
    urgency: int = Field(..., ge=1, le=10, description="How time-sensitive is this? 1=low, 10=critical")
    revenue_impact: int = Field(..., ge=1, le=10, description="Expected revenue effect")
    growth_impact: int = Field(..., ge=1, le=10, description="Expected growth/scale effect")
    risk_impact: int = Field(..., ge=1, le=10, description="Risk reduction / prevention value")
    team_impact: int = Field(..., ge=1, le=10, description="Team focus / efficiency improvement")

    # Output metadata
    output_type: str = Field(
        "analysis",
        description="strategic_priority|risk|opportunity|task_suggestion|analysis|forecast_comment|summary|review_prep|action_plan",
    )
    affected_kpi_names: list[str] = Field(default_factory=list, description="KPI names this output relates to")
    suggested_tasks: list[str] = Field(default_factory=list, description="Concrete task titles to create")
    timeframe: str = Field("this_week", description="immediately|this_week|this_month|this_quarter")
    confidence_in_analysis: int = Field(..., ge=1, le=10, description="AI's confidence in this analysis")

    @field_validator("output_type")
    @classmethod
    def validate_output_type(cls, v: str) -> str:
        valid = {
            "strategic_priority", "risk", "opportunity", "task_suggestion",
            "analysis", "forecast_comment", "summary", "review_prep", "action_plan",
        }
        return v if v in valid else "analysis"


# ── Score computation ─────────────────────────────────────────────────────────

def compute_business_impact_score(structured: AIOutputStructured) -> float:
    """
    business_impact_score = (revenue * 0.4) + (growth * 0.3) + (risk * 0.2) + (team * 0.1)
    Scaled to 0–100.
    """
    raw = (
        structured.revenue_impact * 0.4
        + structured.growth_impact * 0.3
        + structured.risk_impact * 0.2
        + structured.team_impact * 0.1
    )
    return round(raw * 10, 1)  # scale 1–10 → 10–100


def compute_confidence_score(
    structured: AIOutputStructured,
    historical_accuracy: Optional[float] = None,
) -> float:
    """
    confidence_score = AI self-assessment * 10 (scaled to 100),
    blended with historical_accuracy if available (50/50 blend).
    """
    ai_confidence = structured.confidence_in_analysis * 10.0
    if historical_accuracy is not None:
        return round((ai_confidence * 0.5) + (historical_accuracy * 0.5), 1)
    return round(ai_confidence, 1)


def infer_priority_from_score(impact_score: float, urgency: int) -> str:
    """Map computed scores → priority string."""
    if impact_score >= 80 or urgency >= 9:
        return "critical"
    if impact_score >= 60 or urgency >= 7:
        return "high"
    if impact_score >= 40 or urgency >= 4:
        return "medium"
    return "low"


# ── Claude JSON prompt builder ────────────────────────────────────────────────

STRUCTURED_OUTPUT_INSTRUCTION = """
Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt. Kein Text davor oder danach.
Das JSON muss folgendes Schema erfüllen:

{
  "what_is_happening": "<Was ist die aktuelle Situation / Beobachtung?>",
  "root_cause": "<Warum passiert das? Was ist der eigentliche Treiber?>",
  "business_meaning": "<Was bedeutet das für das Unternehmen?>",
  "recommended_action": "<Die eine wichtigste Maßnahme, die sofort ergriffen werden soll>",
  "expected_outcome": "<Welches Ergebnis erzielt diese Maßnahme? Konkret, messbar>",
  "urgency": <1-10, wie zeitkritisch ist das?>,
  "revenue_impact": <1-10, erwarteter Umsatzeffekt>,
  "growth_impact": <1-10, erwarteter Wachstumseffekt>,
  "risk_impact": <1-10, Risikominderung / Schutzwert>,
  "team_impact": <1-10, Team-Fokus / Effizienzgewinn>,
  "output_type": "<strategic_priority|risk|opportunity|task_suggestion|analysis|forecast_comment|summary|review_prep|action_plan>",
  "affected_kpi_names": ["<KPI-Name>", ...],
  "suggested_tasks": ["<Aufgabentitel 1>", "<Aufgabentitel 2>"],
  "timeframe": "<immediately|this_week|this_month|this_quarter>",
  "confidence_in_analysis": <1-10, wie sicher bist du in dieser Analyse?>
}

Gib NUR das JSON zurück. Keine Erklärungen, kein Markdown.
"""


def parse_structured_output(raw_text: str) -> tuple[Optional[AIOutputStructured], str]:
    """
    Parse Claude's response. Returns (structured, plain_text_fallback).
    If JSON parsing fails, returns (None, raw_text) so the caller can store the text as-is.
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)

    data = _extract_first_json_object(cleaned)
    if not data:
        return None, raw_text

    try:
        structured = AIOutputStructured(**data)
        return structured, _structured_to_prose(structured)
    except Exception:
        return None, raw_text


def _extract_first_json_object(text: str) -> Optional[dict]:
    decoder = json.JSONDecoder()
    start = 0
    while True:
        start = text.find("{", start)
        if start == -1:
            return None
        try:
            obj, _ = decoder.raw_decode(text[start:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            start += 1
            continue


def _structured_to_prose(s: AIOutputStructured) -> str:
    """Convert structured output back to readable prose for display."""
    lines = [
        f"**Situation:** {s.what_is_happening}",
        f"**Ursache:** {s.root_cause}",
        f"**Bedeutung:** {s.business_meaning}",
        f"**Empfohlene Maßnahme:** {s.recommended_action}",
        f"**Erwartetes Ergebnis:** {s.expected_outcome}",
    ]
    if s.suggested_tasks:
        lines.append(f"**Nächste Schritte:** {', '.join(s.suggested_tasks)}")
    return "\n\n".join(lines)


# ── Historical accuracy lookup ────────────────────────────────────────────────

def get_role_historical_accuracy(db: Any, workspace_id: int, role: str) -> Optional[float]:
    """
    Compute historical accuracy for a role based on past AI output feedback.
    Returns average feedback_rating scaled to 0–100, or None if no data.
    """
    try:
        from models.ai_output import AIOutput
        from sqlalchemy import func

        result = (
            db.query(func.avg(AIOutput.feedback_rating))
            .filter(
                AIOutput.workspace_id == workspace_id,
                AIOutput.agent_role == role,
                AIOutput.feedback_rating.isnot(None),
            )
            .scalar()
        )
        if result is None:
            return None
        # feedback_rating is 1–5, scale to 0–100
        return round((float(result) - 1) / 4 * 100, 1)
    except Exception:
        return None
