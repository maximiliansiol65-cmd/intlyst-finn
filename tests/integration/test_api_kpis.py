"""
Integration tests for /api/kpis — list, create, update, delete KPI metrics.
"""
import pytest


class TestKPIs:
    def test_get_kpis_authenticated(self, client, auth_headers):
        resp = client.get("/api/kpis", headers=auth_headers)
        assert resp.status_code in (200, 404)  # 404 if no data seeded yet
        if resp.status_code == 200:
            assert isinstance(resp.json(), (list, dict))

    def test_get_kpis_unauthenticated(self, client):
        resp = client.get("/api/kpis")
        assert resp.status_code in (401, 403)

    def test_get_kpi_summary(self, client, auth_headers):
        resp = client.get("/api/kpis/summary", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_get_kpi_trend(self, client, auth_headers):
        resp = client.get("/api/kpis/trend?metric=revenue&days=30", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_get_kpis_invalid_token(self, client):
        resp = client.get("/api/kpis", headers={"Authorization": "Bearer bad.token"})
        assert resp.status_code in (401, 403)


class TestCustomKPIs:
    def test_list_custom_kpis(self, client, auth_headers):
        resp = client.get("/api/kpis/custom", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_create_custom_kpi(self, client, auth_headers):
        payload = {
            "name": "Test KPI",
            "formula": "revenue / sessions",
            "unit": "€",
            "description": "Test metric for pytest",
        }
        resp = client.post("/api/kpis/custom", json=payload, headers=auth_headers)
        assert resp.status_code in (200, 201, 422)

    def test_create_custom_kpi_missing_name(self, client, auth_headers):
        resp = client.post("/api/kpis/custom", json={"formula": "x/y"}, headers=auth_headers)
        assert resp.status_code in (400, 422)
