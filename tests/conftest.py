"""
Shared pytest fixtures for all backend tests.
Sets up: JWT secret, in-memory SQLite DB, FastAPI TestClient, auth helpers.
"""
import os
import sys
import pytest

# ── Set required env vars BEFORE any app module is imported ──────────────────
os.environ.setdefault("JWT_SECRET", "test-super-secret-key-for-ci-purposes-only-32ch")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_app.db")
os.environ.setdefault("APP_ENV", "test")

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db

# Ensure all SQLAlchemy models are registered on the shared Base before tests run.
# These modules define additional models (GA4, growth profiles, customers, billing, team, AB tests, reports).
import api.ga4_routes  # noqa: F401
import api.growth_routes  # noqa: F401
import api.customers_routes  # noqa: F401
import api.abtests_routes  # noqa: F401
import api.billing_routes  # noqa: F401
import api.team_routes  # noqa: F401
import models.report  # noqa: F401
import api.personalization_routes  # noqa: F401

# ── In-memory SQLite for tests ────────────────────────────────────────────────
TEST_DB_URL = "sqlite:///./pytest_test.db"

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create all tables once per test session, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    # Clean up db file
    if os.path.exists("pytest_test.db"):
        os.remove("pytest_test.db")


@pytest.fixture(scope="session")
def client():
    """FastAPI TestClient with DB override."""
    from main import app
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def auth_headers(client):
    """Register + login a test user; return Authorization headers."""
    email = "pytest_user@intlyst.test"
    password = "TestPass123!Secure"

    # Register (ignore if already exists)
    client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "name": "Pytest User",
        "company": "Test GmbH",
        "industry": "tech",
    })

    # Login
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
