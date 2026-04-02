from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Index, Integer, String, Text

from models.base import Base


class Insight(Base):
    """
    Persistent analysis record. Each AI-generated or system-generated insight is stored here.

    Structure follows: What happened → Why → What it means → What to do → Expected outcome

    insight_type: problem|root_cause|opportunity|trend|benchmark|market|forecast|
                  review|team|finance|marketing|sales
    status: new|acknowledged|in_progress|resolved|dismissed
    priority: critical|high|medium|low
    """

    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False, default=1, index=True)
    title = Column(String(500), nullable=False)
    # insight_type: problem|root_cause|opportunity|trend|benchmark|market|forecast|review|team|finance|marketing|sales
    insight_type = Column(String(50), nullable=False, default="problem")

    # The five questions every insight must answer
    what_happened = Column(Text, nullable=True)    # What is the problem / observation?
    why_it_happened = Column(Text, nullable=True)  # Root cause
    what_it_means = Column(Text, nullable=True)    # Business interpretation
    what_to_do = Column(Text, nullable=True)       # Recommended measure
    expected_outcome = Column(Text, nullable=True) # Projected impact if measure is taken

    # Legacy fields kept for backward compat
    problem = Column(Text, nullable=True)
    cause = Column(Text, nullable=True)
    measure = Column(Text, nullable=True)

    affected_kpi_ids = Column(Text, nullable=True)   # JSON array
    relevance_score = Column(Float, nullable=True, default=50.0)   # 0–100
    # priority: critical|high|medium|low
    priority = Column(String(20), nullable=False, default="medium")
    confidence_score = Column(Float, nullable=True, default=70.0)  # 0–100
    impact_score = Column(Float, nullable=True, default=50.0)      # 0–100
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    target_role = Column(String(50), nullable=True)       # Which role should see this: ceo|coo|cmo|cfo|all
    generated_by_ai_role = Column(String(50), nullable=True)  # Which AI role produced this
    # status: new|acknowledged|in_progress|resolved|dismissed
    status = Column(String(30), nullable=False, default="new")
    linked_task_ids = Column(Text, nullable=True)   # JSON array
    linked_goal_ids = Column(Text, nullable=True)   # JSON array
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_insights_workspace_type", "workspace_id", "insight_type"),
        Index("ix_insights_workspace_status", "workspace_id", "status"),
        Index("ix_insights_workspace_role", "workspace_id", "target_role"),
    )
