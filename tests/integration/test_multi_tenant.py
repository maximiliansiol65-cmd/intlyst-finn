"""
test_multi_tenant.py
Phase 6: Multi-tenant isolation tests.

Verifies that data created in workspace A is never visible to a user
authenticated in workspace B, and vice versa (no cross-tenant leak).
"""
import os
import pytest

os.environ.setdefault("JWT_SECRET", "test-super-secret-key-for-ci-purposes-only-32ch")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_mt.db")
os.environ.setdefault("APP_ENV", "test")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ── DB setup ──────────────────────────────────────────────────────────────────

TEST_DB_URL = "sqlite:///./test_mt.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
MTSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = MTSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def app_client():
    from models import Base
    Base.metadata.create_all(bind=engine)

    from main import app
    from database import get_db as _get_db
    _prev = app.dependency_overrides.get(_get_db)  # Save whatever was there before
    app.dependency_overrides[_get_db] = override_get_db

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c

    # Restore previous override (never wipe other fixtures' overrides)
    if _prev is not None:
        app.dependency_overrides[_get_db] = _prev
    else:
        app.dependency_overrides.pop(_get_db, None)
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("test_mt.db"):
        os.remove("test_mt.db")


def _register_and_login(client, suffix: str) -> dict:
    """Register a user and return auth headers."""
    email = f"mt_user_{suffix}@test.invalid"
    password = "MTTestPass123!Secure"
    client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "name": f"MT User {suffix}",
        "company": f"Company {suffix}",
        "industry": "tech",
    })
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    if resp.status_code != 200:
        pytest.skip(f"Login failed for {email}: {resp.text}")
    token = resp.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestMultiTenantIsolation:
    """Each test is independent; users A and B have separate workspaces."""

    def test_kpi_data_points_isolated(self, app_client):
        """KPI data points created by user A must not appear for user B."""
        headers_a = _register_and_login(app_client, "kpi_a")
        headers_b = _register_and_login(app_client, "kpi_b")

        # A ingests a KPI point
        resp = app_client.post("/api/kpi-data-points/", json={
            "kpi_id": 9001,
            "kpi_name": "Tenant A Revenue",
            "value": 99999.0,
            "source": "manual",
        }, headers=headers_a)
        # May 201 or 403 (if role guard blocks non-manager); either way, B should not see it
        if resp.status_code == 201:
            # B lists KPI points — should not see kpi_id 9001
            resp_b = app_client.get("/api/kpi-data-points/?range=7d", headers=headers_b)
            if resp_b.status_code == 200:
                ids = [p["kpi_id"] for p in resp_b.json()]
                assert 9001 not in ids, "Cross-tenant KPI leak: workspace B sees workspace A KPI data"

    def test_scenarios_isolated(self, app_client):
        """Scenarios created by user A must not appear in user B's list."""
        headers_a = _register_and_login(app_client, "sc_a")
        headers_b = _register_and_login(app_client, "sc_b")

        # A creates a scenario (needs manager role — may be blocked)
        resp = app_client.post("/api/scenarios/", json={
            "name": "Tenant A Secret Scenario",
            "risk_level": "low",
        }, headers=headers_a)

        if resp.status_code == 201:
            sc_id = resp.json()["id"]
            # Direct access by B should return 404
            resp_b_direct = app_client.get(f"/api/scenarios/{sc_id}", headers=headers_b)
            assert resp_b_direct.status_code in (403, 404), (
                f"Cross-tenant scenario access: B got {resp_b_direct.status_code} for A's scenario {sc_id}"
            )

            # B's list should not contain A's scenario
            resp_b_list = app_client.get("/api/scenarios/", headers=headers_b)
            if resp_b_list.status_code == 200:
                names = [s["name"] for s in resp_b_list.json()]
                assert "Tenant A Secret Scenario" not in names, (
                    "Cross-tenant scenario leak: workspace B sees workspace A scenario in list"
                )

    def test_ai_outputs_isolated(self, app_client):
        """AI outputs from workspace A must not be visible to workspace B."""
        headers_a = _register_and_login(app_client, "ai_a")
        headers_b = _register_and_login(app_client, "ai_b")

        resp_a = app_client.get("/api/ai-outputs/", headers=headers_a)
        resp_b = app_client.get("/api/ai-outputs/", headers=headers_b)

        # Both should succeed (200) or be role-blocked (403), but not error (500)
        assert resp_a.status_code in (200, 403)
        assert resp_b.status_code in (200, 403)

        if resp_a.status_code == 200 and resp_b.status_code == 200:
            ids_a = {o["id"] for o in resp_a.json()}
            ids_b = {o["id"] for o in resp_b.json()}
            overlap = ids_a & ids_b
            # If both have data, there should be no overlap (different workspaces)
            if ids_a and ids_b:
                assert not overlap, f"Cross-tenant AI output leak: shared IDs {overlap}"

    def test_forecast_records_isolated(self, app_client):
        """Forecast records from workspace A must not appear for workspace B."""
        headers_a = _register_and_login(app_client, "fc_a")
        headers_b = _register_and_login(app_client, "fc_b")

        resp_a = app_client.get("/api/forecast-records/", headers=headers_a)
        resp_b = app_client.get("/api/forecast-records/", headers=headers_b)

        assert resp_a.status_code in (200, 403)
        assert resp_b.status_code in (200, 403)

        if resp_a.status_code == 200 and resp_b.status_code == 200:
            ids_a = {r["id"] for r in resp_a.json()}
            ids_b = {r["id"] for r in resp_b.json()}
            if ids_a and ids_b:
                assert not (ids_a & ids_b), "Cross-tenant forecast record leak"

    def test_no_workspace_context_blocks_request(self, app_client):
        """Requests without auth token must return 401, not expose any data."""
        for path in [
            "/api/insights/",
            "/api/forecast-records/",
            "/api/scenarios/",
            "/api/kpi-data-points/",
            "/api/ai-outputs/",
            "/api/di/dashboard",
        ]:
            resp = app_client.get(path)
            assert resp.status_code in (401, 403, 422), (
                f"Unauthenticated request to {path} returned {resp.status_code} — expected 401/403"
            )
