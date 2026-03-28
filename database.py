from __future__ import annotations

import os
from contextvars import ContextVar, Token
from typing import Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, with_loader_criteria
from models import Base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

_connect_args = {"check_same_thread": False, "timeout": 20} if _IS_SQLITE else {}
_engine_kwargs = {
    "connect_args": _connect_args,
    "pool_pre_ping": True,  # prüft Connection vor Nutzung
    "pool_recycle": 3600,   # Connection nach 1h recyceln
}
if not _IS_SQLITE:
    _engine_kwargs.update({"pool_size": 10, "max_overflow": 20})

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

_WORKSPACE_SCOPED_TABLES = {
    "daily_metrics",
    "goals",
    "notifications",
    "tasks",
    "task_history",
    "user_events",
    "user_profiles",
    "action_logs",
    "reports",
    "growth_profiles",
    "customers",
    "ab_tests",
    "subscriptions",
    "business_events",
    "social_accounts",
    "action_requests",
    "recommendation_outcomes",
    "approval_policy_settings",
    "action_request_reviews",
    "error_traces",
    "decision_problems",
    "strategy_cycles",
    "recommendation_policies",
}

_current_workspace_id: ContextVar[int | None] = ContextVar("current_workspace_id", default=None)


def set_current_workspace_id(workspace_id: int | None) -> Token:
    return _current_workspace_id.set(workspace_id)


def reset_current_workspace_id(token: Token) -> None:
    _current_workspace_id.reset(token)


def get_current_workspace_id() -> int | None:
    return _current_workspace_id.get()


def _enable_wal(dbapi_conn, _connection_record):
    """Aktiviert WAL-Mode für bessere Lese-/Schreib-Concurrency."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-64000")   # 64MB RAM-Cache
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


if _IS_SQLITE:
    event.listen(engine, "connect", _enable_wal)


@event.listens_for(SessionLocal, "do_orm_execute")
def _apply_workspace_scope(execute_state):
    if execute_state.execution_options.get("skip_workspace_scope"):
        return
    if not execute_state.is_select:
        return

    workspace_id = get_current_workspace_id()
    if workspace_id is None:
        return

    statement = execute_state.statement
    for desc in statement.column_descriptions:
        entity = desc.get("entity")
        if entity is None:
            continue
        table_name = getattr(entity, "__tablename__", "")
        if table_name in _WORKSPACE_SCOPED_TABLES and hasattr(entity, "workspace_id"):
            statement = statement.options(
                with_loader_criteria(
                    entity,
                    lambda cls: cls.workspace_id == workspace_id,
                    include_aliases=True,
                )
            )
    execute_state.statement = statement


@event.listens_for(SessionLocal, "before_flush")
def _default_workspace_for_new_rows(session, _flush_context, _instances):
    workspace_id = get_current_workspace_id()
    if workspace_id is None:
        return
    for obj in session.new:
        table_name = getattr(obj.__class__, "__tablename__", "")
        if table_name in _WORKSPACE_SCOPED_TABLES and hasattr(obj, "workspace_id"):
            current = getattr(obj, "workspace_id", None)
            if current in (None, 0):
                setattr(obj, "workspace_id", workspace_id)


def _column_exists(connection, table: str, column: str) -> bool:
    rows = connection.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(str(row[1]) == column for row in rows)


def _ensure_column(connection, table: str, column: str, ddl: str) -> None:
    if not _column_exists(connection, table, column):
        connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def run_lightweight_migrations() -> None:
    # SQLite-only lightweight schema evolution for workspace tenancy.
    with engine.begin() as conn:
        for table, column, ddl in [
            ("users", "active_workspace_id", "INTEGER"),
            ("daily_metrics", "workspace_id", "INTEGER DEFAULT 1"),
            ("goals", "workspace_id", "INTEGER DEFAULT 1"),
            ("notifications", "workspace_id", "INTEGER DEFAULT 1"),
            ("tasks", "workspace_id", "INTEGER DEFAULT 1"),
            ("tasks", "goal", "TEXT"),
            ("tasks", "expected_result", "TEXT"),
            ("tasks", "steps_json", "TEXT"),
            ("tasks", "time_estimate_minutes", "INTEGER DEFAULT 0"),
            ("tasks", "kpis_json", "TEXT"),
            ("tasks", "impact", "VARCHAR(16)"),
            ("task_history", "workspace_id", "INTEGER DEFAULT 1"),
            ("action_logs", "workspace_id", "INTEGER DEFAULT 1"),
            ("reports", "workspace_id", "INTEGER DEFAULT 1"),
            ("growth_profiles", "workspace_id", "INTEGER DEFAULT 1"),
            ("subscriptions", "workspace_id", "INTEGER DEFAULT 1"),
            ("permissions", "workspace_id", "INTEGER DEFAULT 1"),
            ("team_invites", "workspace_id", "INTEGER DEFAULT 1"),
            ("customers", "workspace_id", "INTEGER DEFAULT 1"),
            ("ab_tests", "workspace_id", "INTEGER DEFAULT 1"),
            ("social_accounts", "workspace_id", "INTEGER DEFAULT 1"),
            ("action_requests", "workspace_id", "INTEGER DEFAULT 1"),
            ("recommendation_outcomes", "workspace_id", "INTEGER DEFAULT 1"),
            ("approval_policy_settings", "workspace_id", "INTEGER DEFAULT 1"),
            ("action_request_reviews", "workspace_id", "INTEGER DEFAULT 1"),
            ("error_traces", "workspace_id", "INTEGER"),
            ("decision_problems", "workspace_id", "INTEGER DEFAULT 1"),
            ("strategy_cycles", "workspace_id", "INTEGER DEFAULT 1"),
        ]:
            try:
                _ensure_column(conn, table, column, ddl)
            except Exception:
                # Ignore absent tables in partial test setups.
                continue
        for table, column, ddl in [
            ("action_requests", "artifact_payload", "TEXT"),
            ("action_requests", "execution_plan_json", "TEXT"),
            ("action_requests", "target_systems_json", "TEXT"),
            ("action_requests", "live_feedback_json", "TEXT"),
            ("action_requests", "progress_pct", "FLOAT DEFAULT 0"),
            ("action_requests", "progress_stage", "VARCHAR(64) DEFAULT 'draft'"),
            ("action_requests", "next_action_text", "VARCHAR(255)"),
            ("action_requests", "last_live_sync_at", "DATETIME"),
            ("daily_metrics", "cost", "FLOAT DEFAULT 0"),
            ("daily_metrics", "profit", "FLOAT DEFAULT 0"),
            ("daily_metrics", "gross_margin", "FLOAT DEFAULT 0"),
            ("daily_metrics", "cashflow", "FLOAT DEFAULT 0"),
            ("daily_metrics", "liquidity", "FLOAT DEFAULT 0"),
        ]:
            try:
                _ensure_column(conn, table, column, ddl)
            except Exception:
                continue

def init_db():
    Base.metadata.create_all(bind=engine)
    run_lightweight_migrations()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
