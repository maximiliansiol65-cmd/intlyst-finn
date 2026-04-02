from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Index, Integer, String, Text

from models.base import Base


class AIAgent(Base):
    """
    AI Team Role definition per workspace.
    Each workspace gets 6 default agents initialized at onboarding.

    role: ceo|coo|cmo|cfo|strategist|assistant
    """

    __tablename__ = "ai_agents"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    # role: ceo|coo|cmo|cfo|strategist|assistant
    role = Column(String(30), nullable=False)
    display_name = Column(String(100), nullable=True)
    focus_areas = Column(Text, nullable=True)              # JSON array of focus areas
    output_types = Column(Text, nullable=True)             # JSON array of output types this role produces
    is_active = Column(Boolean, default=True)
    system_prompt_override = Column(Text, nullable=True)   # Custom system prompt (overrides default)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_ai_agents_workspace_role", "workspace_id", "role"),
    )


# Default configuration for the 6 standard AI team roles
DEFAULT_AI_AGENTS = [
    {
        "role": "ceo",
        "display_name": "AI CEO",
        "focus_areas": ["strategy", "priorities", "risks", "opportunities", "management_review"],
        "output_types": ["strategic_priority", "risk", "opportunity", "analysis"],
    },
    {
        "role": "coo",
        "display_name": "AI COO",
        "focus_areas": ["operations", "bottlenecks", "capacity", "process_issues", "task_sequencing"],
        "output_types": ["task_suggestion", "analysis", "action_plan"],
    },
    {
        "role": "cmo",
        "display_name": "AI CMO",
        "focus_areas": ["marketing", "content", "reach", "leads", "campaign_performance"],
        "output_types": ["analysis", "opportunity", "action_plan"],
    },
    {
        "role": "cfo",
        "display_name": "AI CFO",
        "focus_areas": ["finance", "cashflow", "margin", "budget", "financial_risk"],
        "output_types": ["analysis", "risk", "forecast_comment"],
    },
    {
        "role": "strategist",
        "display_name": "AI Strategist",
        "focus_areas": ["market_trends", "competitive_analysis", "long_term_direction", "opportunities"],
        "output_types": ["strategic_priority", "opportunity", "analysis"],
    },
    {
        "role": "assistant",
        "display_name": "AI Assistant",
        "focus_areas": ["summaries", "structuring", "todo_ordering", "review_prep", "progress_comments"],
        "output_types": ["summary", "review_prep", "action_plan"],
    },
]
