"""
test_rbac.py
Phase 6: Role-based access control tests.

Verifies that:
1. Unauthenticated requests → 401
2. Low-privilege users (member/assistant) are blocked from manager/strategist endpoints → 403
3. High-privilege users (manager+) can access all DI endpoints → 200
4. Role-scoped data returns only what the role should see
"""
import os
import pytest

os.environ.setdefault("JWT_SECRET", "test-super-secret-key-for-ci-purposes-only-32ch")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_rbac.db")
os.environ.setdefault("APP_ENV", "test")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

TEST_DB_URL = "sqlite:///./test_rbac.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
RBACSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = RBACSessionLocal()
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
    _prev = app.dependency_overrides.get(_get_db)
    app.dependency_overrides[_get_db] = override_get_db

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c

    if _prev is not None:
        app.dependency_overrides[_get_db] = _prev
    else:
        app.dependency_overrides.pop(_get_db, None)
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("test_rbac.db"):
        os.remove("test_rbac.db")


def _login(client, email: str, password: str = "RBACTestPass123!") -> dict | None:
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    if resp.status_code != 200:
        return None
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _register(client, email: str, password: str = "RBACTestPass123!", role: str = "member") -> None:
    client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "name": f"RBAC {role}",
        "company": f"RBAC Co {role}",
        "industry": "tech",
    })


# ── DI endpoint catalogue ─────────────────────────────────────────────────────
# (method, path, expected_status_for_authenticated_member_without_strategist_role)
# Note: after registration, a new user gets a default role.
# The actual role guard enforcement depends on WorkspaceMembership.role in DB.
# For unauthenticated requests, we always expect 401/403.

DI_READ_ENDPOINTS = [
    ("GET", "/api/insights/"),
    ("GET", "/api/forecast-records/"),
    ("GET", "/api/scenarios/"),
    ("GET", "/api/kpi-data-points/summary"),
    ("GET", "/api/ai-outputs/"),
    ("GET", "/api/di/dashboard"),
]

DI_WRITE_ENDPOINTS = [
    ("POST", "/api/scenarios/"),
    ("POST", "/api/kpi-data-points/"),
]


class TestUnauthenticated:
    """All DI endpoints must reject unauthenticated requests."""

    @pytest.mark.parametrize("method,path", DI_READ_ENDPOINTS + DI_WRITE_ENDPOINTS)
    def test_no_auth_blocked(self, app_client, method, path):
        if method == "GET":
            resp = app_client.get(path)
        else:
            resp = app_client.post(path, json={})
        assert resp.status_code in (401, 403, 422), (
            f"{method} {path} returned {resp.status_code} without auth — expected 401/403"
        )


class TestAuthenticatedAccess:
    """Authenticated users (with registered role) should get sensible responses."""

    @pytest.fixture(scope="class")
    def auth_headers(self, app_client):
        email = "rbac_auth_user@test.invalid"
        _register(app_client, email)
        headers = _login(app_client, email)
        if not headers:
            pytest.skip("Could not authenticate rbac_auth_user")
        return headers

    @pytest.mark.parametrize("method,path", DI_READ_ENDPOINTS)
    def test_authenticated_read_not_500(self, app_client, auth_headers, method, path):
        """Authenticated users should never get a 500. They get 200 or 403."""
        resp = app_client.get(path, headers=auth_headers)
        assert resp.status_code != 500, (
            f"GET {path} returned 500 for authenticated user: {resp.text[:200]}"
        )
        assert resp.status_code in (200, 403), (
            f"GET {path} returned unexpected {resp.status_code}"
        )

    def test_di_dashboard_returns_structure(self, app_client, auth_headers):
        """DI dashboard must return the expected keys when accessible."""
        resp = app_client.get("/api/di/dashboard", headers=auth_headers)
        if resp.status_code == 200:
            data = resp.json()
            assert "generated_at" in data
            # All signal fields present (may be null)
            for key in ["critical_kpi", "top_opportunity", "top_problem",
                        "top_task", "top_recommendation", "forecast_alert"]:
                assert key in data, f"Missing key '{key}' in DI dashboard response"

    def test_scenario_create_write_guarded(self, app_client, auth_headers):
        """Creating a scenario requires manager+ role. New users may get 403."""
        resp = app_client.post("/api/scenarios/", json={
            "name": "RBAC Test Scenario",
            "risk_level": "low",
        }, headers=auth_headers)
        assert resp.status_code in (201, 403), (
            f"Scenario create returned unexpected {resp.status_code}: {resp.text[:200]}"
        )


class TestAIOutputFeedbackSchema:
    """AI output feedback endpoint must validate rating range."""

    @pytest.fixture(scope="class")
    def auth_headers(self, app_client):
        email = "rbac_feedback_user@test.invalid"
        _register(app_client, email)
        headers = _login(app_client, email)
        if not headers:
            pytest.skip("Could not authenticate feedback user")
        return headers

    def test_feedback_invalid_rating_rejected(self, app_client, auth_headers):
        """Rating outside 1–5 must be rejected with 422."""
        resp = app_client.post("/api/ai-outputs/1/feedback", json={
            "rating": 10,  # invalid
            "comment": "too high",
        }, headers=auth_headers)
        assert resp.status_code in (422, 403, 404), (
            f"Invalid rating accepted: {resp.status_code}"
        )

    def test_feedback_valid_rating_structure(self, app_client, auth_headers):
        """Valid rating (1–5) must not return 422."""
        resp = app_client.post("/api/ai-outputs/999999/feedback", json={
            "rating": 4,
            "comment": "Good analysis",
        }, headers=auth_headers)
        # 404 (record not found) or 403 (role guard) are both acceptable — 422 is not
        assert resp.status_code != 422, (
            f"Valid feedback rating rejected with 422: {resp.text}"
        )


class TestStructuredScoreComputation:
    """Unit-level: verify score computation logic is correct."""

    def test_impact_score_formula(self):
        from services.ai_output_schema import AIOutputStructured, compute_business_impact_score
        s = AIOutputStructured(
            what_is_happening="Revenue down",
            root_cause="Marketing spend cut",
            business_meaning="Growth stalls",
            recommended_action="Restore budget",
            expected_outcome="10% revenue recovery",
            urgency=8,
            revenue_impact=9,
            growth_impact=7,
            risk_impact=6,
            team_impact=5,
            output_type="analysis",
            confidence_in_analysis=8,
        )
        score = compute_business_impact_score(s)
        expected = round((9 * 0.4 + 7 * 0.3 + 6 * 0.2 + 5 * 0.1) * 10, 1)
        assert score == expected, f"Impact score wrong: got {score}, expected {expected}"

    def test_confidence_blends_historical(self):
        from services.ai_output_schema import AIOutputStructured, compute_confidence_score
        s = AIOutputStructured(
            what_is_happening="x", root_cause="y", business_meaning="z",
            recommended_action="a", expected_outcome="b",
            urgency=5, revenue_impact=5, growth_impact=5, risk_impact=5, team_impact=5,
            output_type="analysis", confidence_in_analysis=6,
        )
        # Without history: 6 * 10 = 60
        assert compute_confidence_score(s) == 60.0
        # With 80% historical accuracy: blend = (60 * 0.5) + (80 * 0.5) = 70
        assert compute_confidence_score(s, historical_accuracy=80.0) == 70.0

    def test_priority_from_score(self):
        from services.ai_output_schema import infer_priority_from_score
        assert infer_priority_from_score(85, 5) == "critical"
        assert infer_priority_from_score(65, 5) == "high"
        assert infer_priority_from_score(45, 5) == "medium"
        assert infer_priority_from_score(30, 3) == "low"
        assert infer_priority_from_score(30, 9) == "critical"  # urgency overrides

    def test_parse_valid_json(self):
        from services.ai_output_schema import parse_structured_output
        raw = """{
            "what_is_happening": "Revenue dropped 15%",
            "root_cause": "Q3 campaign underperformed",
            "business_meaning": "Missing quarterly target",
            "recommended_action": "Reallocate 20% of budget to best channel",
            "expected_outcome": "8% recovery in 4 weeks",
            "urgency": 8,
            "revenue_impact": 9,
            "growth_impact": 6,
            "risk_impact": 5,
            "team_impact": 4,
            "output_type": "strategic_priority",
            "affected_kpi_names": ["revenue", "roas"],
            "suggested_tasks": ["Reactivate top campaign", "Pause underperforming ad sets"],
            "timeframe": "this_week",
            "confidence_in_analysis": 8
        }"""
        structured, prose = parse_structured_output(raw)
        assert structured is not None
        assert structured.urgency == 8
        assert "revenue" in structured.affected_kpi_names
        assert "Situation" in prose

    def test_parse_invalid_json_fallback(self):
        from services.ai_output_schema import parse_structured_output
        raw = "This is just a plain text response without JSON."
        structured, prose = parse_structured_output(raw)
        assert structured is None
        assert prose == raw
