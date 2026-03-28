"""Tag 16 - Backend Test. Ausfuehren: python test_tag16.py"""
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []


def ok(n, d: object = ""):
    PASS.append(n)
    print(f"  ✅  {n}" + (f"  →  {d}" if d else ""))


def fail(n, d: object = ""):
    FAIL.append(n)
    print(f"  ❌  {n}" + (f"  →  {d}" if d else ""))


def section(t):
    print(f"\n{'─' * 50}\n  {t}\n{'─' * 50}")


section("1 · Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if r.ok else fail("Server", r.status_code)
except Exception as e:
    fail("Server", str(e))
    sys.exit(1)

section("2 · Integration Status")
try:
    r = requests.get(f"{BASE}/api/integrations/status")
    d = r.json()
    if r.ok and isinstance(d, list):
        ok(f"GET /api/integrations/status → {len(d)} Integrationen")
        for integration in d:
            for key in ["name", "connected"]:
                ok(f"  {integration.get('name')} hat '{key}'") if key in integration else fail(f"  fehlt '{key}'")
    else:
        fail("GET /api/integrations/status", r.status_code)
except Exception as e:
    fail("integration status", str(e))

section("3 · CSV Import")
try:
    payload = {
        "rows": [
            {"date": "2024-01-15", "revenue": 1250.0, "traffic": 45, "conversions": 12, "new_customers": 3},
            {"date": "2024-01-16", "revenue": 980.0, "traffic": 38, "conversions": 9, "new_customers": 2},
        ]
    }
    r = requests.post(f"{BASE}/api/integrations/csv/import", json=payload)
    d = r.json()
    if r.ok:
        ok(f"POST /api/integrations/csv/import → {d.get('imported')} importiert")
        for key in ["imported", "skipped", "errors"]:
            ok(f"  hat '{key}'") if key in d else fail(f"  fehlt '{key}'")
    else:
        fail("CSV import", f"{r.status_code}: {str(d)[:80]}")
except Exception as e:
    fail("CSV import", str(e))

section("4 · Webhook")
try:
    r = requests.post(
        f"{BASE}/api/integrations/webhook",
        json={
            "source": "custom",
            "event": "test.event",
            "data": {"test": True},
        },
    )
    ok("POST /api/integrations/webhook → " + str(r.status_code)) if r.ok else fail("webhook", r.status_code)
except Exception as e:
    fail("webhook", str(e))

section("5 · Stripe (ohne Key - sollte 400 geben)")
try:
    r = requests.post(f"{BASE}/api/integrations/stripe/sync")
    ok("Stripe ohne Key → 400") if r.status_code == 400 else fail("Stripe Validierung", r.status_code)
except Exception as e:
    fail("Stripe test", str(e))

section("6 · Regression Tag 9–15")
for url in ["/api/kpi", "/api/alerts", "/api/tasks", "/api/goals/progress", "/api/digest"]:
    try:
        r = requests.get(f"{BASE}{url}", timeout=35)
        ok(f"GET {url} → {r.status_code}") if r.ok else fail(f"GET {url}", r.status_code)
    except Exception as e:
        fail(f"GET {url}", str(e))

print(f"\n{'═' * 50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'═' * 50}")
if FAIL:
    for f in FAIL:
        print(f"    • {f}")
    sys.exit(1)
else:
    print("\n  🎉 Tag 16 komplett — Integrationen laufen!\n")
    sys.exit(0)
