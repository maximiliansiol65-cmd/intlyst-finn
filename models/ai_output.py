from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text

from models.base import Base


class AIOutput(Base):
    """
    Persistent storage for every AI team member output.
    Every response from an AI role is archived here for tracking, feedback, and learning.

    agent_role: ceo|coo|cmo|cfo|strategist|assistant
    output_type: strategic_priority|risk|opportunity|task_suggestion|analysis|
                 forecast_comment|summary|review_prep|action_plan
    status: new|acknowledged|acted_upon|dismissed
    """

    __tablename__ = "ai_outputs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    # agent_role: ceo|coo|cmo|cfo|strategist|assistant
    agent_role = Column(String(30), nullable=False, index=True)
    # output_type: strategic_priority|risk|opportunity|task_suggestion|analysis|
    #              forecast_comment|summary|review_prep|action_plan
    output_type = Column(String(50), nullable=False, default="analysis")
    content = Column(Text, nullable=False)               # Full text of the AI response
    structured_data = Column(Text, nullable=True)        # JSON for structured outputs
    linked_kpi_id = Column(Integer, ForeignKey("custom_kpis.id"), nullable=True)
    linked_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    linked_goal_id = Column(Integer, ForeignKey("goals.id"), nullable=True)
    linked_insight_id = Column(Integer, ForeignKey("insights.id"), nullable=True)
    # priority: critical|high|medium|low
    priority = Column(String(20), nullable=False, default="medium")
    confidence_score = Column(Float, nullable=True, default=70.0)   # 0–100
    impact_score = Column(Float, nullable=True, default=50.0)       # 0–100
    generated_at = Column(DateTime, default=datetime.utcnow)
    # status: new|acknowledged|acted_upon|dismissed
    status = Column(String(30), nullable=False, default="new")
    # Feedback fields
    feedback_rating = Column(Integer, nullable=True)      # 1–5
    feedback_comment = Column(Text, nullable=True)
    feedback_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_ai_outputs_workspace_role", "workspace_id", "agent_role"),
        Index("ix_ai_outputs_workspace_type", "workspace_id", "output_type"),
        Index("ix_ai_outputs_workspace_status", "workspace_id", "status"),
    )
