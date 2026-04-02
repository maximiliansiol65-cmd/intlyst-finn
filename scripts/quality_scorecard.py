#!/usr/bin/env python3
"""Reproduzierbare App-Scorecard fuer Technik, AI, Datenbasis und Betrieb.

Nutzung:
  python scripts/quality_scorecard.py
  python scripts/quality_scorecard.py --run-tests
  python scripts/quality_scorecard.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from main import app


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


def _clamp_score(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _safe_json(response) -> dict[str, Any]:
    try:
        data = response.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _register_and_login(client: TestClient) -> tuple[dict[str, str], list[Check]]:
    checks: list[Check] = []
    email = f"scorecard-{int(time.time())}@intlyst.test"
    password = "TestPass123!Secure"

    register = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "name": "Scorecard User",
            "company": "Test GmbH",
            "industry": "tech",
        },
    )
    checks.append(Check("register user", register.status_code in (200, 201), f"status={register.status_code}"))

    login = client.post("/api/auth/login", data={"username": email, "password": password})
    login_data = _safe_json(login)
    token = str(login_data.get("access_token", ""))
    checks.append(Check("login", login.status_code == 200 and bool(token), f"status={login.status_code}"))

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return headers, checks


def _score_technical(checks: list[Check], run_tests: bool) -> tuple[int, list[Check]]:
    tech_checks = list(checks)
    if run_tests:
        cmd = [
            "pytest",
            "tests/integration/test_api_analytics.py",
            "tests/integration/test_api_growth.py",
            "-q",
        ]
        run = subprocess.run(cmd, capture_output=True, text=True)
        ok = run.returncode == 0
        detail = "pytest ok" if ok else (run.stdout + "\n" + run.stderr)[-300:]
        tech_checks.append(Check("integration tests", ok, detail))

    passed = sum(1 for c in tech_checks if c.ok)
    total = max(1, len(tech_checks))
    return _clamp_score(passed / total * 100), tech_checks


def _run_scorecard(run_tests: bool) -> dict[str, Any]:
    result: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "categories": {},
        "checks": [],
    }

    with TestClient(app, raise_server_exceptions=False) as client:
        headers, auth_checks = _register_and_login(client)
        seed = client.post("/api/dev/seed-demo", headers=headers)
        seed_data = _safe_json(seed)
        seed_created = seed_data.get("created", {}) if isinstance(seed_data.get("created"), dict) else {}

        checks: list[Check] = []
        checks.extend(auth_checks)
        checks.append(Check("seed demo", seed.status_code == 200, f"status={seed.status_code}"))
        checks.append(
            Check(
                "seed daily metrics",
                int(seed_created.get("daily_metrics", 0)) >= 30,
                f"created={seed_created.get('daily_metrics', 0)}",
            )
        )

        # AI Analysis
        analysis = client.get("/api/ai/analysis?days=30&force_fallback=true", headers=headers)
        analysis_data = _safe_json(analysis)
        insights = analysis_data.get("insights", []) if isinstance(analysis_data.get("insights"), list) else []
        checks.append(Check("analysis endpoint", analysis.status_code == 200, f"status={analysis.status_code}"))
        checks.append(Check("analysis fields", all(k in analysis_data for k in ("summary", "health_score", "source")), "schema"))
        checks.append(Check("analysis insights", len(insights) >= 2, f"count={len(insights)}"))

        # Recommendations
        rec = client.get("/api/ai/recommendations?days=30&force_fallback=true", headers=headers)
        rec_data = _safe_json(rec)
        rec_items = rec_data.get("recommendations", []) if isinstance(rec_data.get("recommendations"), list) else []
        checks.append(Check("recommendations endpoint", rec.status_code == 200, f"status={rec.status_code}"))
        checks.append(Check("recommendations list", len(rec_items) >= 2, f"count={len(rec_items)}"))

        # Forecast
        fc = client.get("/api/ai/forecast/revenue?horizon=30&force_fallback=true", headers=headers)
        fc_data = _safe_json(fc)
        historical = fc_data.get("historical", []) if isinstance(fc_data.get("historical"), list) else []
        forecast = fc_data.get("forecast", []) if isinstance(fc_data.get("forecast"), list) else []
        checks.append(Check("ai forecast endpoint", fc.status_code == 200, f"status={fc.status_code}"))
        checks.append(Check("forecast horizon 30", len(forecast) == 30, f"count={len(forecast)}"))
        checks.append(Check("historical >= 14", len(historical) >= 14, f"count={len(historical)}"))

        # Intlyst
        intlyst = client.get("/api/intlyst/analyze?auto_tasks=false", headers=headers)
        int_data = _safe_json(intlyst)
        alerts = int_data.get("alerts", []) if isinstance(int_data.get("alerts"), list) else []
        recs = int_data.get("recommendations", []) if isinstance(int_data.get("recommendations"), list) else []
        patterns = int_data.get("patterns", []) if isinstance(int_data.get("patterns"), list) else []
        checks.append(Check("intlyst endpoint", intlyst.status_code == 200, f"status={intlyst.status_code}"))
        checks.append(Check("intlyst findings", (len(alerts) + len(recs) + len(patterns)) >= 2, f"total={len(alerts)+len(recs)+len(patterns)}"))

        # Ops/health
        health = client.get("/health")
        metrics = client.get("/api/ai/metrics", headers=headers)
        checks.append(Check("health endpoint", health.status_code == 200, f"status={health.status_code}"))
        checks.append(Check("ai metrics endpoint", metrics.status_code == 200, f"status={metrics.status_code}"))

        # Category scoring
        ai_checks = [
            c for c in checks if c.name in {
                "analysis endpoint", "analysis fields", "analysis insights",
                "recommendations endpoint", "recommendations list",
                "intlyst endpoint", "intlyst findings",
            }
        ]
        data_checks = [
            c for c in checks if c.name in {
                "seed demo", "seed daily metrics", "ai forecast endpoint", "forecast horizon 30", "historical >= 14"
            }
        ]
        ops_checks = [
            c for c in checks if c.name in {"health endpoint", "ai metrics endpoint", "register user", "login"}
        ]

        technical_score, tech_checks = _score_technical(checks, run_tests=run_tests)

        def score_from(cs: list[Check]) -> int:
            passed = sum(1 for c in cs if c.ok)
            total = max(1, len(cs))
            return _clamp_score(passed / total * 100)

        result["categories"] = {
            "technical": technical_score,
            "ai_quality": score_from(ai_checks),
            "data_basis": score_from(data_checks),
            "operations": score_from(ops_checks),
        }

        overall = (
            result["categories"]["technical"] * 0.35
            + result["categories"]["ai_quality"] * 0.30
            + result["categories"]["data_basis"] * 0.20
            + result["categories"]["operations"] * 0.15
        )
        result["overall"] = _clamp_score(overall)

        all_checks = tech_checks if run_tests else checks
        result["checks"] = [
            {"name": c.name, "ok": c.ok, "detail": c.detail}
            for c in all_checks
        ]

    return result


def _print_human(result: dict[str, Any]) -> None:
    categories = result["categories"]
    print("\nINTLYST QUALITY SCORECARD")
    print("=" * 30)
    print(f"Timestamp (UTC): {result['timestamp']}")
    print(f"Overall Score: {result['overall']}/100")
    print("\nCategory Scores:")
    print(f"  - Technical : {categories['technical']}/100")
    print(f"  - AI Quality: {categories['ai_quality']}/100")
    print(f"  - Data Basis: {categories['data_basis']}/100")
    print(f"  - Operations: {categories['operations']}/100")

    failed = [c for c in result["checks"] if not c["ok"]]
    print(f"\nChecks: {len(result['checks']) - len(failed)}/{len(result['checks'])} passed")
    if failed:
        print("Failed Checks:")
        for item in failed:
            print(f"  - {item['name']}: {item['detail']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run reproducible quality scorecard for Intlyst app")
    parser.add_argument("--run-tests", action="store_true", help="Include selected pytest integration tests")
    parser.add_argument("--json", action="store_true", help="Print JSON output")
    args = parser.parse_args()

    result = _run_scorecard(run_tests=args.run_tests)
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=True))
    else:
        _print_human(result)


if __name__ == "__main__":
    main()
