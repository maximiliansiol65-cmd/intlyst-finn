"""Tag 21+22 — Backend Test. Ausfuehren: python test_tag21_22.py"""

import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

BASE = os.getenv("BASE_URL", "http://localhost:8000")
PASS, FAIL = [], []


def ok(name, detail=""):
    PASS.append(name)
    print(f"  ✅  {name}" + (f"  →  {detail}" if detail else ""))


def fail(name, detail=""):
    FAIL.append(name)
    print(f"  ❌  {name}" + (f"  →  {detail}" if detail else ""))


def section(title):
    print(f"\n{'─' * 50}\n  {title}\n{'─' * 50}")


section("1 · Server")
try:
    response = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if response.ok else fail("Server", response.status_code)
except Exception as exc:
    fail("Server", str(exc))
    sys.exit(1)

section("2 · Billing Plans")
try:
    response = requests.get(f"{BASE}/api/billing/plans")
    data = response.json()
    if response.ok and isinstance(data, list) and len(data) == 3:
        ok(f"GET /api/billing/plans → {len(data)} Plaene")
        for plan in data:
            for key in ["key", "name", "price", "currency", "features", "max_users"]:
                ok(f"  {plan.get('key')} hat '{key}'") if key in plan else fail(f"  {plan.get('key')} fehlt '{key}'")
    else:
        fail("billing/plans", f"{response.status_code}: {str(data)[:80]}")
except Exception as exc:
    fail("billing/plans", str(exc))

section("3 · Billing Status")
try:
    response = requests.get(f"{BASE}/api/billing/status")
    data = response.json()
    if response.ok:
        ok("GET /api/billing/status → 200")
        for key in ["plan", "plan_name", "status", "price", "features"]:
            ok(f"  hat '{key}'") if key in data else fail(f"  fehlt '{key}'")
    else:
        fail("billing/status", response.status_code)
except Exception as exc:
    fail("billing/status", str(exc))

section("4 · Checkout Validierung")
try:
    response = requests.post(f"{BASE}/api/billing/checkout", json={"plan": "invalid"})
    ok("Ungueltiger Plan → 400") if response.status_code == 400 else fail("Validierung Plan", response.status_code)
except Exception as exc:
    fail("Validierung", str(exc))

section("5 · Google Analytics")
try:
    response = requests.get(f"{BASE}/api/integrations/connect/google-analytics?days=30", timeout=15)
    data = response.json()
    if response.ok:
        ok("GET /api/integrations/connect/google-analytics → 200")
        for key in ["sessions", "users", "new_users", "pageviews", "bounce_rate", "source"]:
            ok(f"  hat '{key}'") if key in data else fail(f"  fehlt '{key}'")
        ok(f"  sessions: {data.get('sessions')}, source: {data.get('source')}")
    else:
        fail("google-analytics", f"{response.status_code}: {str(data)[:80]}")
except Exception as exc:
    fail("google-analytics", str(exc))

section("6 · HubSpot")
try:
    response = requests.get(f"{BASE}/api/integrations/connect/hubspot", timeout=15)
    data = response.json()
    if response.ok:
        ok("GET /api/integrations/connect/hubspot → 200")
        for key in ["total_contacts", "total_deals", "total_deal_value", "contacts"]:
            ok(f"  hat '{key}'") if key in data else fail(f"  fehlt '{key}'")
        ok(f"  {data.get('total_contacts')} Kontakte · EUR {data.get('total_deal_value')} Pipeline")
    else:
        fail("hubspot", f"{response.status_code}: {str(data)[:80]}")
except Exception as exc:
    fail("hubspot", str(exc))

section("7 · CSV Export")
try:
    response = requests.get(f"{BASE}/api/integrations/connect/export/csv?days=30", timeout=10)
    if response.ok and "text/csv" in response.headers.get("content-type", ""):
        lines = response.text.strip().split("\n")
        ok(f"GET export/csv → {len(lines)} Zeilen")
        ok("Header korrekt") if "date,revenue" in lines[0] else fail("CSV Header falsch")
    else:
        fail("export/csv", response.status_code)
except Exception as exc:
    fail("export/csv", str(exc))

section("8 · JSON Export")
try:
    response = requests.get(f"{BASE}/api/integrations/connect/export/json?days=30", timeout=10)
    data = response.json()
    if response.ok and "data" in data:
        ok(f"GET export/json → {data.get('rows')} Zeilen")
    else:
        fail("export/json", response.status_code)
except Exception as exc:
    fail("export/json", str(exc))

section("9 · Regression Tag 9–20")
for url in ["/api/kpi", "/api/benchmark/industries", "/api/customers/list", "/api/location/geocode?address=Berlin"]:
    try:
        response = requests.get(f"{BASE}{url}", timeout=35)
        ok(f"GET {url} → {response.status_code}") if response.ok else fail(f"GET {url}", response.status_code)
    except Exception as exc:
        fail(f"GET {url}", str(exc))

print(f"\n{'═' * 50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'═' * 50}")
if FAIL:
    for failed in FAIL:
        print(f"    • {failed}")
    sys.exit(1)
else:
    print("\n  🎉 Tag 21+22 komplett — Integrationen + Billing laufen!\n")
    sys.exit(0)