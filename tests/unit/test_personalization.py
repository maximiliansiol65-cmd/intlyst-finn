from datetime import datetime, timedelta


def test_personalization_profile_builds_from_events(client, auth_headers):
    # Log two behavior events: app open + KPI view
    resp = client.post(
        "/api/personalization/events",
        json={
            "event_type": "app_open",
            "page": "dashboard_revenue",
            "kpi": "revenue",
            "feature": "dashboard",
            "duration_ms": 120000,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201

    resp = client.post(
        "/api/personalization/events",
        json={
            "event_type": "view_kpi",
            "kpi": "revenue",
            "duration_ms": 4000,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201

    prof = client.get("/api/personalization/profile", headers=auth_headers)
    assert prof.status_code == 200
    data = prof.json()
    assert data["profile"]["priority_focus"] in {"umsatz", "revenue"}
    assert "dashboard" in data and "tasks" in data
    assert data["scores"]["user_priority_score"] > 0


def test_personalization_state_prioritizes_tasks(client, auth_headers):
    # Create two tasks with different KPIs
    resp1 = client.post(
        "/api/tasks",
        json={"title": "Revenue push", "priority": "high", "kpis": ["revenue"]},
        headers=auth_headers,
    )
    assert resp1.status_code == 200
    t1 = resp1.json()

    resp2 = client.post(
        "/api/tasks",
        json={"title": "Traffic post", "priority": "medium", "kpis": ["traffic"]},
        headers=auth_headers,
    )
    assert resp2.status_code == 200
    t2 = resp2.json()

    # Signal strong focus on revenue
    client.post(
        "/api/personalization/events",
        json={
            "event_type": "view_kpi",
            "kpi": "revenue",
            "duration_ms": 2000,
        },
        headers=auth_headers,
    )

    state = client.get("/api/personalization/state", headers=auth_headers)
    assert state.status_code == 200
    payload = state.json()
    assert payload["tasks"], "Task payload should not be empty"
    top_task_id = payload["tasks"][0]["id"]
    assert top_task_id in {t1["id"], t2["id"]}
    # Revenue task should be ranked at or above traffic task
    assert payload["tasks"][0]["id"] == t1["id"]
