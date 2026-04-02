import uuid


VALID_PASSWORD = "SecureTest123!"


def unique_email():
    return f"action_{uuid.uuid4().hex[:8]}@intlyst.test"


def register_and_auth(client):
    email = unique_email()
    register = client.post("/api/auth/register", json={
        "email": email,
        "password": VALID_PASSWORD,
        "name": "Action Tester",
    })
    assert register.status_code in (200, 201), register.text
    data = register.json()
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    if data.get("active_workspace_id"):
      headers["X-Workspace-ID"] = str(data["active_workspace_id"])
    return headers


def test_action_request_policy_and_artifact_flow(client):
    headers = register_and_auth(client)

    create = client.post("/api/action-requests", headers=headers, json={
        "title": "Revenue Recovery Sprint",
        "description": "Prepare outreach and executive report.",
        "category": "operations",
        "priority": "high",
        "impact_score": 18,
        "risk_score": 24,
        "estimated_hours": 2.5,
        "execution_type": "report",
    })
    assert create.status_code == 200, create.text
    created = create.json()
    assert created["status"] == "pending_approval"
    assert created["approval_policy"]["required_role"] in ("manager", "admin", "owner")

    approve = client.post(
        f"/api/action-requests/{created['id']}/approve",
        headers=headers,
        json={"execute_now": True},
    )
    assert approve.status_code == 200, approve.text
    approved = approve.json()
    assert approved["status"] == "executed"
    assert approved["execution_ref"]

    artifact = client.get(f"/api/action-requests/{created['id']}/artifact", headers=headers)
    assert artifact.status_code == 200, artifact.text
    artifact_json = artifact.json()
    assert artifact_json["artifact"] is not None
    assert artifact_json["artifact"]["type"] == "report"


def test_action_request_simulation(client):
    headers = register_and_auth(client)
    resp = client.post("/api/action-requests/simulate", headers=headers, json={
        "title": "Campaign Push",
        "impact_score": 20,
        "risk_score": 30,
        "estimated_hours": 3,
        "category": "marketing",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "projected" in data
    assert "guardrails" in data
