"""
Tag 11 - Backend Test
Ausfuehren: python test_tag11.py
"""
import requests, sys

BASE = "http://localhost:8000"
PASS, FAIL = [], []

def ok(n): PASS.append(n); print(f"  [OK]  {n}")
def fail(n, r=""): FAIL.append(n); print(f"  [FAIL]  {n}" + (f"  ->  {r}" if r else ""))
def section(t): print(f"\n{'-'*50}\n  {t}\n{'-'*50}")

section("1 · Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server erreichbar") if r.ok else fail("Server", r.status_code)
except Exception as e:
    fail("Server", str(e)); print("\nWARN: uvicorn main:app --reload starten\n"); sys.exit(1)

section("2 · Notifications")
nid = None
try:
    r = requests.post(f"{BASE}/api/notifications", json={"title": "Test", "message": "Test-Msg", "type": "alert"})
    nid = r.json().get("id") if r.ok else None
    ok(f"POST /api/notifications -> id={nid}") if r.ok else fail("POST notifications", r.status_code)
except Exception as e: fail("POST notifications", str(e))

try:
    r = requests.get(f"{BASE}/api/notifications")
    ok(f"GET /api/notifications -> {len(r.json())} Eintraege") if r.ok else fail("GET notifications", r.status_code)
except Exception as e: fail("GET notifications", str(e))

try:
    r = requests.get(f"{BASE}/api/notifications/unread-count")
    d = r.json()
    ok(f"unread-count -> {d.get('count')}") if r.ok and "count" in d else fail("unread-count")
except Exception as e: fail("unread-count", str(e))

if nid:
    try:
        r = requests.patch(f"{BASE}/api/notifications/{nid}/read")
        ok("PATCH read -> 200") if r.ok else fail("PATCH read", r.status_code)
    except Exception as e: fail("PATCH read", str(e))
    try:
        requests.patch(f"{BASE}/api/notifications/read-all")
        ok("PATCH read-all -> 200")
    except Exception as e: fail("PATCH read-all", str(e))
    try:
        r = requests.delete(f"{BASE}/api/notifications/{nid}")
        ok("DELETE notification -> 200") if r.ok else fail("DELETE notification", r.status_code)
    except Exception as e: fail("DELETE notification", str(e))

section("3 · Tasks")
tid = None
try:
    r = requests.post(f"{BASE}/api/tasks", json={"title": "Test-Task", "priority": "high", "description": "Auto-Test"})
    tid = r.json().get("id") if r.ok else None
    ok(f"POST /api/tasks -> id={tid}") if r.ok else fail("POST tasks", r.text[:80])
except Exception as e: fail("POST tasks", str(e))

try:
    r = requests.get(f"{BASE}/api/tasks")
    ok(f"GET /api/tasks -> {len(r.json())} Tasks") if r.ok else fail("GET tasks", r.status_code)
except Exception as e: fail("GET tasks", str(e))

try:
    r = requests.get(f"{BASE}/api/tasks?status=open")
    ok("GET tasks?status=open -> 200") if r.ok else fail("GET tasks filter", r.status_code)
except Exception as e: fail("GET tasks filter", str(e))

if tid:
    try:
        r = requests.patch(f"{BASE}/api/tasks/{tid}/next-status")
        d = r.json()
        ok(f"next-status -> {d.get('status')}") if r.ok else fail("next-status", r.status_code)
    except Exception as e: fail("next-status", str(e))
    try:
        r = requests.patch(f"{BASE}/api/tasks/{tid}", json={"status": "done", "assigned_to": "Dev1"})
        ok("PATCH task update -> 200") if r.ok else fail("PATCH task", r.status_code)
    except Exception as e: fail("PATCH task", str(e))
    try:
        r = requests.delete(f"{BASE}/api/tasks/{tid}")
        ok("DELETE task -> 200") if r.ok else fail("DELETE task", r.status_code)
    except Exception as e: fail("DELETE task", str(e))

try:
    r = requests.post(f"{BASE}/api/tasks", json={"title": "Test", "priority": "invalid"})
    ok("Ungueltige Priority -> 400") if r.status_code == 400 else fail("Validierung Priority", r.status_code)
except Exception as e: fail("Validierung", str(e))

section("4 · Recommendations")
try:
    r = requests.get(f"{BASE}/api/recommendations")
    d = r.json()
    if r.ok and isinstance(d, list) and len(d) > 0:
        ok(f"GET /api/recommendations -> {len(d)} Empfehlungen")
        first = d[0]
        for key in ["id", "title", "description", "impact_pct", "priority", "category", "action_label"]:
            ok(f"  hat '{key}'") if key in first else fail(f"  fehlt '{key}'")
        ok(f"  priority gueltig: {first['priority']}") if first.get("priority") in ["high","medium","low"] else fail("  priority ungueltig")
    else:
        fail("GET /api/recommendations", f"Status {r.status_code} oder leer")
except Exception as e: fail("GET recommendations", str(e))

section("5 · Regression Tag 9+10")
for url in ["/api/timeseries?metric=revenue&days=7", "/api/actions", "/api/goals", "/api/anomalies"]:
    try:
        r = requests.get(f"{BASE}{url}")
        ok(f"GET {url} -> {r.status_code}") if r.ok else fail(f"GET {url}", r.status_code)
    except Exception as e: fail(f"GET {url}", str(e))

print(f"\n{'='*50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'='*50}")
if FAIL:
    print(f"\n  Fehlgeschlagen ({len(FAIL)}):")
    for f in FAIL: print(f"    * {f}")
    sys.exit(1)
else:
    print("\n  Alle Tests bestanden - bereit fuer Tag 12!\n")
    sys.exit(0)
