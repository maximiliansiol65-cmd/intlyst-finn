"""
junction_tables.py
Phase 2: Proper relational junction tables replacing JSON ID arrays.

These replace the anti-pattern of storing IDs as JSON strings in Text columns.
JSON fields are kept on parent models for backward compat but junction tables
are the authoritative source for all new queries.

Tables:
  goal_kpis         – Goal ↔ KPI (custom_kpis)
  insight_tasks     – Insight ↔ Task
  insight_goals     – Insight ↔ Goal
  forecast_scenarios – ForecastRecord ↔ Scenario
  task_goals        – Task ↔ Goal (reverse of insight_tasks for direct links)
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, UniqueConstraint, Index

from models.base import Base


class GoalKPI(Base):
    """Junction: Goal ↔ KPI. Replaces goals.linked_kpi_ids JSON."""
    __tablename__ = "goal_kpis"

    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, nullable=False, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False, index=True)
    kpi_id = Column(Integer, ForeignKey("custom_kpis.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "goal_id", "kpi_id", name="uq_goal_kpi"),
        Index("ix_goal_kpis_goal", "goal_id"),
        Index("ix_goal_kpis_kpi", "kpi_id"),
    )


class InsightTask(Base):
    """Junction: Insight ↔ Task. Replaces insights.linked_task_ids JSON."""
    __tablename__ = "insight_tasks"

    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, nullable=False, index=True)
    insight_id = Column(Integer, ForeignKey("insights.id"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "insight_id", "task_id", name="uq_insight_task"),
        Index("ix_insight_tasks_insight", "insight_id"),
        Index("ix_insight_tasks_task", "task_id"),
    )


class InsightGoal(Base):
    """Junction: Insight ↔ Goal. Replaces insights.linked_goal_ids JSON."""
    __tablename__ = "insight_goals"

    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, nullable=False, index=True)
    insight_id = Column(Integer, ForeignKey("insights.id"), nullable=False, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "insight_id", "goal_id", name="uq_insight_goal"),
        Index("ix_insight_goals_insight", "insight_id"),
        Index("ix_insight_goals_goal", "goal_id"),
    )


class ForecastScenario(Base):
    """Junction: ForecastRecord ↔ Scenario. Replaces forecast_records.linked_scenario_ids JSON."""
    __tablename__ = "forecast_scenarios"

    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, nullable=False, index=True)
    forecast_id = Column(Integer, ForeignKey("forecast_records.id"), nullable=False, index=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "forecast_id", "scenario_id", name="uq_forecast_scenario"),
        Index("ix_forecast_scenarios_forecast", "forecast_id"),
        Index("ix_forecast_scenarios_scenario", "scenario_id"),
    )


class TaskGoal(Base):
    """Junction: Task ↔ Goal. Direct task-to-goal linkage."""
    __tablename__ = "task_goals"

    id = Column(Integer, primary_key=True)
    workspace_id = Column(Integer, nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("workspace_id", "task_id", "goal_id", name="uq_task_goal"),
        Index("ix_task_goals_task", "task_id"),
        Index("ix_task_goals_goal", "goal_id"),
    )
