from datetime import date, timedelta

from models.daily_metrics import DailyMetrics
from models.user import User
from tests.conftest import TestingSessionLocal


def _register_and_login(client, suffix: str) -> dict[str, str]:
    email = f"legacy_{suffix}@test.invalid"
    password = "LegacyPass123!Secure"
    client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "name": f"Legacy {suffix}",
        },
    )
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _workspace_id_by_email(email: str) -> int:
    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        assert user is not None and user.active_workspace_id is not None
        return int(user.active_workspace_id)
    finally:
        db.close()


class TestLegacyRouteIsolation:
    def test_custom_kpis_are_workspace_scoped(self, client):
        headers_a = _register_and_login(client, "kpi_a")
        headers_b = _register_and_login(client, "kpi_b")

        resp = client.post(
            "/api/kpis/custom",
            json={
                "name": "Tenant A KPI",
                "formula_type": "simple",
                "formula_config": {"metric": "revenue", "aggregation": "sum"},
                "unit": "€",
            },
            headers=headers_a,
        )
        assert resp.status_code == 200, resp.text

        resp_b = client.get("/api/kpis/custom", headers=headers_b)
        assert resp_b.status_code == 200, resp_b.text
        names = [item["name"] for item in resp_b.json()]
        assert "Tenant A KPI" not in names

    def test_forecast_uses_workspace_specific_daily_metrics(self, client):
        headers_a = _register_and_login(client, "forecast_a")
        headers_b = _register_and_login(client, "forecast_b")
        email_a = "legacy_forecast_a@test.invalid"
        email_b = "legacy_forecast_b@test.invalid"
        workspace_a = _workspace_id_by_email(email_a)
        workspace_b = _workspace_id_by_email(email_b)

        db = TestingSessionLocal()
        try:
            start = date.today() - timedelta(days=29)
            for offset in range(30):
                day = start + timedelta(days=offset)
                db.add(
                    DailyMetrics(
                        workspace_id=workspace_a,
                        date=day,
                        period="daily",
                        revenue=100 + offset,
                        traffic=10 + offset,
                    )
                )
                db.add(
                    DailyMetrics(
                        workspace_id=workspace_b,
                        date=day,
                        period="daily",
                        revenue=1000 + offset,
                        traffic=100 + offset,
                    )
                )
            db.commit()
        finally:
            db.close()

        resp_a = client.get("/api/forecast/revenue?horizon=30", headers=headers_a)
        resp_b = client.get("/api/forecast/revenue?horizon=30", headers=headers_b)
        assert resp_a.status_code == 200, resp_a.text
        assert resp_b.status_code == 200, resp_b.text

        first_a = resp_a.json()["historical"][0]["value"]
        first_b = resp_b.json()["historical"][0]["value"]
        assert first_a != first_b
        assert first_a < first_b
