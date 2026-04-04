from datetime import date

from models.goals import Goal
from models.insight import Insight
from models.scenario import Scenario
from models.user import User
from tests.conftest import TestingSessionLocal


def _workspace_id() -> int:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "pytest_user@intlyst.test").first()
        assert user is not None and user.active_workspace_id is not None
        return int(user.active_workspace_id)
    finally:
        db.close()


class TestTaskReferences:
    def test_create_task_persists_relational_references(self, client, auth_headers):
        workspace_id = _workspace_id()
        db = TestingSessionLocal()
        try:
            goal = Goal(
                workspace_id=workspace_id,
                metric="revenue",
                target_value=1000,
                period="monthly",
                start_date=date.today(),
                end_date=date.today(),
            )
            insight = Insight(
                workspace_id=workspace_id,
                title="Task ref insight",
                insight_type="problem",
                priority="high",
                status="new",
            )
            scenario = Scenario(
                workspace_id=workspace_id,
                name="Task ref scenario",
                risk_level="medium",
                status="draft",
            )
            db.add_all([goal, insight, scenario])
            db.commit()
            db.refresh(goal)
            db.refresh(insight)
            db.refresh(scenario)
            goal_id = goal.id
            insight_id = insight.id
            scenario_id = scenario.id
        finally:
            db.close()

        resp = client.post(
            "/api/tasks",
            json={
                "title": "Referenced task",
                "priority": "medium",
                "goal_ids": [goal_id],
                "linked_insight_id": insight_id,
                "linked_scenario_id": scenario_id,
                "kpis": ["revenue"],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert payload["goal_id_list"] == [goal_id]
        assert payload["linked_insight_id"] == insight_id
        assert payload["linked_scenario_id"] == scenario_id

    def test_create_task_rejects_unknown_relations(self, client, auth_headers):
        resp = client.post(
            "/api/tasks",
            json={
                "title": "Broken refs",
                "priority": "medium",
                "goal_ids": [999999],
                "linked_insight_id": 999999,
                "linked_scenario_id": 999999,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 404, resp.text
