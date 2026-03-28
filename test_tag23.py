"""Tag 23 - Backend Test. Ausfuehren: python test_tag23.py"""

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

section("2 · Demo Seed")
try:
    response = requests.post(f"{BASE}/api/abtests/seed-demo")
    data = response.json()
    ok(f"POST seed-demo → {data.get('message', '')}") if response.ok else fail("seed-demo", response.status_code)
except Exception as exc:
    fail("seed-demo", str(exc))

section("3 · GET alle Tests")
try:
    response = requests.get(f"{BASE}/api/abtests")
    data = response.json()
    if response.ok and isinstance(data, list) and len(data) > 0:
        ok(f"GET /api/abtests → {len(data)} Tests")
        test = data[0]
        for key in ["id", "name", "category", "status", "variant_a", "variant_b", "winner", "lift_pct", "significant", "confidence"]:
            ok(f"  hat '{key}'") if key in test else fail(f"  fehlt '{key}'")
    else:
        fail("GET /api/abtests", response.status_code)
except Exception as exc:
    fail("GET /api/abtests", str(exc))

section("4 · Filter nach Status")
for status in ["running", "completed", "paused"]:
    try:
        response = requests.get(f"{BASE}/api/abtests?status={status}")
        data = response.json()
        ok(f"Filter status={status} → {len(data)} Tests") if response.ok and isinstance(data, list) else fail(f"Filter {status}", response.status_code)
    except Exception as exc:
        fail(f"Filter {status}", str(exc))

section("5 · GET einzelner Test mit KI")
try:
    all_response = requests.get(f"{BASE}/api/abtests")
    tests = all_response.json()
    if tests:
        test_id = tests[0]["id"]
        response = requests.get(f"{BASE}/api/abtests/{test_id}", timeout=30)
        data = response.json()
        if response.ok:
            ok(f"GET /api/abtests/{test_id} → 200")
            for key in ["id", "variant_a", "variant_b", "significance", "ai_verdict", "ai_recommendation", "lift_pct"]:
                ok(f"  hat '{key}'") if key in data else fail(f"  fehlt '{key}'")
            significance = data.get("significance", {})
            for key in ["significant", "confidence", "p_value", "verdict"]:
                ok(f"  significance hat '{key}'") if key in significance else fail(f"  significance fehlt '{key}'")
            ok(f"  confidence: {significance.get('confidence')}%")
            ok(f"  significant: {significance.get('significant')}")
    
        else:
            fail(f"GET /api/abtests/{test_id}", f"{response.status_code}: {str(data)[:80]}")
except Exception as exc:
    fail("GET einzelner Test", str(exc))

section("6 · POST neuer Test")
try:
    payload = {
        "name": "Test-Kampagne",
        "category": "marketing",
        "variant_a_name": "Alt",
        "variant_b_name": "Neu",
        "hypothesis": "Neues Design konvertiert besser",
    }
    response = requests.post(f"{BASE}/api/abtests", json=payload)
    data = response.json()
    if response.ok:
        ok(f"POST /api/abtests → id={data.get('id')}")
        new_id = data.get("id")
        update_response = requests.patch(
            f"{BASE}/api/abtests/{new_id}",
            json={
                "variant_a_visitors": 500,
                "variant_a_conversions": 25,
                "variant_b_visitors": 500,
                "variant_b_conversions": 35,
            },
        )
        ok("PATCH Update Daten → 200") if update_response.ok else fail("PATCH update", update_response.status_code)
        delete_response = requests.delete(f"{BASE}/api/abtests/{new_id}")
        ok("DELETE Test → 200") if delete_response.ok else fail("DELETE test", delete_response.status_code)
    else:
        fail("POST /api/abtests", f"{response.status_code}: {str(data)[:80]}")
except Exception as exc:
    fail("POST /api/abtests", str(exc))

section("7 · Validierung")
try:
    response = requests.post(f"{BASE}/api/abtests", json={"name": "Test", "category": "invalid"})
    ok("Ungueltige Kategorie → 400") if response.status_code == 400 else fail("Validierung Kategorie", response.status_code)
except Exception as exc:
    fail("Validierung", str(exc))

section("8 · Regression Tag 9–22")
for url in ["/api/kpi", "/api/benchmark/industries", "/api/billing/plans", "/api/customers/list"]:
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
    print("\n  🎉 Tag 23 komplett — A/B Tests laufen!\n")
    sys.exit(0)