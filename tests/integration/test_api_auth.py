"""
Integration tests for /api/auth — register, login, token refresh, me endpoint.
Uses the shared TestClient from conftest.py.
"""
import pytest
import uuid


def unique_email():
    return f"test_{uuid.uuid4().hex[:8]}@intlyst.test"


VALID_PASSWORD = "SecureTest123!"


# ── Register ─────────────────────────────────────────────────────────────────

class TestRegister:
    def test_register_success(self, client):
        resp = client.post("/api/auth/register", json={
            "email": unique_email(),
            "password": VALID_PASSWORD,
            "name": "Test User",
            "company": "Test GmbH",
            "industry": "tech",
        })
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_register_duplicate_email(self, client):
        email = unique_email()
        payload = {"email": email, "password": VALID_PASSWORD, "name": "U", "company": "C", "industry": "tech"}
        client.post("/api/auth/register", json=payload)
        resp = client.post("/api/auth/register", json=payload)
        assert resp.status_code in (400, 409, 422)

    def test_register_invalid_email(self, client):
        resp = client.post("/api/auth/register", json={
            "email": "not-an-email",
            "password": VALID_PASSWORD,
            "name": "X",
            "company": "Y",
            "industry": "tech",
        })
        assert resp.status_code == 422

    def test_register_weak_password(self, client):
        resp = client.post("/api/auth/register", json={
            "email": unique_email(),
            "password": "weak",
            "name": "X",
            "company": "Y",
            "industry": "tech",
        })
        assert resp.status_code in (400, 422)

    def test_register_missing_fields(self, client):
        resp = client.post("/api/auth/register", json={"email": unique_email()})
        assert resp.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_success(self, client):
        email = unique_email()
        client.post("/api/auth/register", json={
            "email": email, "password": VALID_PASSWORD,
            "name": "L", "company": "C", "industry": "tech",
        })
        resp = client.post("/api/auth/login", data={"username": email, "password": VALID_PASSWORD})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_login_wrong_password(self, client):
        email = unique_email()
        client.post("/api/auth/register", json={
            "email": email, "password": VALID_PASSWORD,
            "name": "L", "company": "C", "industry": "tech",
        })
        resp = client.post("/api/auth/login", data={"username": email, "password": "wrongwrong123"})
        assert resp.status_code in (400, 401)

    def test_login_nonexistent_user(self, client):
        resp = client.post("/api/auth/login", data={
            "username": "nobody@nowhere.com", "password": VALID_PASSWORD,
        })
        assert resp.status_code in (400, 401, 404)

    def test_login_missing_credentials(self, client):
        resp = client.post("/api/auth/login", data={})
        assert resp.status_code == 422


# ── /api/auth/me ─────────────────────────────────────────────────────────────

class TestMe:
    def test_me_authenticated(self, client, auth_headers):
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data

    def test_me_no_token(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    def test_me_invalid_token(self, client):
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code in (401, 403)
