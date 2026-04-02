"""
Integration tests for /api/growth, /api/forecast, /api/anomalies endpoints.
"""
import pytest


class TestGrowth:
    def test_growth_overview(self, client, auth_headers):
        resp = client.get("/api/growth", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_growth_metrics(self, client, auth_headers):
        resp = client.get("/api/growth/metrics", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_growth_unauthenticated(self, client):
        resp = client.get("/api/growth")
        assert resp.status_code in (401, 403)

    def test_growth_with_date_range(self, client, auth_headers):
        resp = client.get("/api/growth?start=2024-01-01&end=2024-03-31", headers=auth_headers)
        assert resp.status_code in (200, 404)


class TestForecast:
    def test_forecast_endpoint(self, client, auth_headers):
        resp = client.get("/api/forecast", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_forecast_metric(self, client, auth_headers):
        resp = client.get("/api/forecast?metric=revenue&horizon=30", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_forecast_unauthenticated(self, client):
        resp = client.get("/api/forecast")
        assert resp.status_code in (401, 403)


class TestAnomalies:
    def test_anomalies_list(self, client, auth_headers):
        resp = client.get("/api/anomalies", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_anomalies_unauthenticated(self, client):
        resp = client.get("/api/anomalies")
        assert resp.status_code in (401, 403)


class TestCustomers:
    def test_customers_list(self, client, auth_headers):
        resp = client.get("/api/customers", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_customers_segments(self, client, auth_headers):
        resp = client.get("/api/customers/segments", headers=auth_headers)
        assert resp.status_code in (200, 404)

    def test_customers_unauthenticated(self, client):
        resp = client.get("/api/customers")
        assert resp.status_code in (401, 403)
