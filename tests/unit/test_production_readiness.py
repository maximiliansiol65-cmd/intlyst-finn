import asyncio
import json

import api.ai_routes as ai_routes
from main import _build_scheduler
from models.custom_kpi import CustomKPI
from models.kpi_data_point import KPIDataPoint
from models.task import Task
from services.priority_service import compute_task_priority_from_db
from tests.conftest import TestingSessionLocal


def test_drilldown_returns_goal_target_for_matching_metric(client, auth_headers):
    create = client.post(
        "/api/goals",
        json={"metric": "revenue", "target_value": 5000, "period": "monthly"},
        headers=auth_headers,
    )
    assert create.status_code == 200

    drill = client.get("/api/drilldown/revenue?days=30", headers=auth_headers)
    assert drill.status_code == 200
    assert drill.json()["goal_target"] == 5000


def test_compute_task_priority_from_named_kpi_reference_uses_signal_data():
    db = TestingSessionLocal()
    try:
        workspace_id = 1
        kpi = CustomKPI(
            workspace_id=workspace_id,
            name="Revenue",
            formula_type="simple",
            formula_config=json.dumps({"metric": "revenue", "aggregation": "sum"}),
        )
        db.add(kpi)
        db.flush()

        db.add(
            KPIDataPoint(
                workspace_id=workspace_id,
                kpi_id=kpi.id,
                kpi_name="revenue",
                value=1000,
                comparison_value=1400,
                change_pct=-28.6,
                trend_direction="down",
                quality_score=92,
            )
        )

        task = Task(
            workspace_id=workspace_id,
            title="Revenue Rescue",
            priority="high",
            status="open",
            kpis_json=json.dumps(["revenue"]),
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        score, priority, reason = compute_task_priority_from_db(db, workspace_id, task)

        assert score >= 20
        assert priority in {"medium", "high", "critical"}
        assert "KPI-Abweichung" in reason
    finally:
        db.close()


def test_ai_routes_call_claude_uses_runtime_model(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-runtime-key-1234567890")
    monkeypatch.setenv("CLAUDE_MODEL", "claude-runtime-test-model")

    captured: dict[str, object] = {}

    class _FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"content": [{"text": "ok"}]}

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers or {}
            captured["json"] = json or {}
            return _FakeResponse()

    monkeypatch.setattr(ai_routes.httpx, "AsyncClient", lambda timeout=40: _FakeClient())

    result = asyncio.run(ai_routes.call_claude("system", "user", max_tokens=123))

    assert result == "ok"
    assert captured["json"]["model"] == "claude-runtime-test-model"
    assert captured["json"]["max_tokens"] == 123


def test_scheduler_uses_safe_job_defaults():
    scheduler = _build_scheduler()

    assert scheduler.timezone.zone == "Europe/Berlin"
    assert scheduler._job_defaults.get("coalesce") is True
    assert scheduler._job_defaults.get("max_instances") == 1
    assert scheduler._job_defaults.get("misfire_grace_time") >= 300


def test_health_endpoint_reports_runtime_scheduler_state(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    payload = resp.json()

    assert payload["scheduler"] in {"running", "stopped"}
    assert isinstance(payload["scheduler_jobs"], int)
    assert payload["database"] in {"connected", "disconnected"}
