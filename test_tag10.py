"""
Tag 10 - Backend Test
Run: /Users/maxi/Intlyst/Backend/backend/.venv/bin/python test_tag10.py
Backend must be running: uvicorn main:app --reload
"""

import requests
import sys

BASE = "http://localhost:8000"
PASS = []
FAIL = []


def ok(name):
    PASS.append(name)
    print(f"  [OK]  {name}")


def fail(name, reason=""):
    FAIL.append(name)
    print(f"  [FAIL]  {name}" + (f"  ->  {reason}" if reason else ""))


def section(title):
    print(f"\n{'-' * 50}")
    print(f"  {title}")
    print(f"{'-' * 50}")


# Server
section("1 - Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server reachable") if r.ok else fail("Server", f"Status {r.status_code}")
except Exception as e:
    fail("Server not reachable", str(e))
    print("\nStart with: uvicorn main:app --reload\n")
    sys.exit(1)


# Goals
section("2 - Goals API")
created_id = None

try:
    payload = {"metric": "revenue", "target_value": 5000.0, "period": "monthly"}
    r = requests.post(f"{BASE}/api/goals", json=payload)
    if r.ok:
        created_id = r.json().get("id")
        ok(f"POST /api/goals -> ID {created_id}")
    else:
        fail("POST /api/goals", f"Status {r.status_code}: {r.text[:80]}")
except Exception as e:
    fail("POST /api/goals", str(e))

try:
    r = requests.get(f"{BASE}/api/goals")
    d = r.json()
    if r.ok and isinstance(d, list):
        ok(f"GET /api/goals -> {len(d)} goals")
    else:
        fail("GET /api/goals", f"Status {r.status_code}")
except Exception as e:
    fail("GET /api/goals", str(e))

try:
    r = requests.get(f"{BASE}/api/goals/progress")
    d = r.json()
    if r.ok and isinstance(d, list):
        ok(f"GET /api/goals/progress -> {len(d)} entries")
        if d:
            first = d[0]
            for key in ["metric", "target_value", "current_value", "progress_pct", "on_track", "remaining"]:
                if key in first:
                    ok(f"  progress has '{key}'")
                else:
                    fail(f"  progress missing '{key}'")
    else:
        fail("GET /api/goals/progress", f"Status {r.status_code}")
except Exception as e:
    fail("GET /api/goals/progress", str(e))

# Validation
try:
    r = requests.post(f"{BASE}/api/goals", json={"metric": "invalid", "target_value": 100})
    if r.status_code == 400:
        ok("Invalid metric -> 400")
    else:
        fail("Metric validation", f"Expected 400, got {r.status_code}")
except Exception as e:
    fail("Validation", str(e))

# Cleanup
if created_id:
    try:
        r = requests.delete(f"{BASE}/api/goals/{created_id}")
        ok(f"DELETE /api/goals/{created_id}") if r.ok else fail("DELETE goal")
    except Exception as e:
        fail("DELETE goal", str(e))


# Anomalies
section("3 - Anomalies API")
try:
    r = requests.get(f"{BASE}/api/anomalies")
    d = r.json()
    if r.ok and isinstance(d, list):
        ok(f"GET /api/anomalies -> {len(d)} anomalies (can be empty)")
        if d:
            first = d[0]
            for key in ["metric", "metric_label", "severity", "current_value", "average_value", "deviation_pct", "description"]:
                if key in first:
                    ok(f"  anomaly has '{key}'")
                else:
                    fail(f"  anomaly missing '{key}'")
            if first.get("severity") in ["high", "medium", "low"]:
                ok(f"  severity valid: '{first['severity']}'")
            else:
                fail("  severity invalid", str(first.get("severity")))
    else:
        fail("GET /api/anomalies", f"Status {r.status_code}")
except Exception as e:
    fail("GET /api/anomalies", str(e))


# Tag 9 regression
section("4 - Regression: Tag 9 endpoints still OK")
for url in [
    "/api/timeseries?metric=revenue&days=7",
    "/api/actions",
]:
    try:
        r = requests.get(f"{BASE}{url}")
        ok(f"GET {url} -> {r.status_code}") if r.ok else fail(f"GET {url}", f"Status {r.status_code}")
    except Exception as e:
        fail(f"GET {url}", str(e))


# Result
print(f"\n{'=' * 50}")
total = len(PASS) + len(FAIL)
print(f"  Result: {len(PASS)}/{total} tests passed")
print(f"{'=' * 50}")

if FAIL:
    print(f"\n  Failed ({len(FAIL)}):")
    for f in FAIL:
        print(f"    - {f}")
    print()
    sys.exit(1)
else:
    print("\n  All tests passed - ready for Tag 11!\n")
    sys.exit(0)
