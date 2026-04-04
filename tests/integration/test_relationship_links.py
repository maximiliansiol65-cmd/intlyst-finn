from datetime import date

from models.goals import Goal
from models.insight import Insight
from models.task import Task
from models.user import User
from services.relationship_service import sync_insight_goal_links, sync_insight_task_links
from tests.conftest import TestingSessionLocal


def _current_workspace_id() -> int:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == "pytest_user@intlyst.test").first()
        assert user is not None
        assert user.active_workspace_id is not None
        return int(user.active_workspace_id)
    finally:
        db.close()


class TestRelationshipLinks:
    def test_goal_create_and_list_return_relational_kpi_links(self, client, auth_headers):
        resp = client.post(
            "/api/goals",
            json={
                "metric": "revenue",
                "target_value": 25000,
                "period": "monthly",
                "linked_kpi_ids": [11, 12, 12],
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert payload["linked_kpi_ids"] == [11, 12]

        list_resp = client.get("/api/goals", headers=auth_headers)
        assert list_resp.status_code == 200, list_resp.text
        created = next(item for item in list_resp.json() if item["id"] == payload["id"])
        assert created["linked_kpi_ids"] == [11, 12]

    def test_insight_detail_returns_resolved_task_and_goal_links(self, client, auth_headers):
        workspace_id = _current_workspace_id()
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
            task = Task(
                workspace_id=workspace_id,
                title="Linked task",
                status="open",
                priority="medium",
            )
            insight = Insight(
                workspace_id=workspace_id,
                title="Linked insight",
                insight_type="problem",
                priority="high",
                status="new",
            )
            db.add_all([goal, task, insight])
            db.commit()
            db.refresh(goal)
            db.refresh(task)
            db.refresh(insight)

            sync_insight_task_links(db, workspace_id, insight.id, [task.id])
            sync_insight_goal_links(db, workspace_id, insight.id, [goal.id])
            db.commit()
            insight_id = insight.id
            task_id = task.id
            goal_id = goal.id
        finally:
            db.close()

        resp = client.get(f"/api/insights/{insight_id}", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        payload = resp.json()
        assert payload["linked_task_id_list"] == [task_id]
        assert payload["linked_goal_id_list"] == [goal_id]
