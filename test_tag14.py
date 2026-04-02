"""Tag 14 — Backend Test. Ausführen: python test_tag14.py"""
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []


def ok(name, detail: object = ""):
    PASS.append(name)
    print(f"  ✅  {name}" + (f"  →  {detail}" if detail else ""))


def fail(name, detail: object = ""):
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

section("2 · API Key")
key = os.getenv("ANTHROPIC_API_KEY", "")
ok(f"Key gesetzt ({len(key)} Zeichen)") if key and key.startswith("sk-ant-") else fail("Key fehlt oder falsch")

section("3 · Forecast Endpunkte")
for metric in ["revenue", "traffic", "conversions"]:
    for horizon in [30, 60]:
        try:
            response = requests.get(f"{BASE}/api/forecast/{metric}?horizon={horizon}", timeout=35)
            data = response.json()
            if response.ok:
                ok(f"GET /api/forecast/{metric}?horizon={horizon}")
                for field in ["metric", "forecast", "historical", "trend", "growth_pct", "summary"]:
                    ok(f"  hat '{field}'") if field in data else fail(f"  fehlt '{field}'")
                ok(f"  {len(data.get('forecast', []))} Forecast-Punkte") if len(data.get("forecast", [])) == horizon else fail(
                    "  Forecast-Länge falsch",
                    f"erwartet {horizon}, bekam {len(data.get('forecast', []))}",
                )
                ok(f"  {len(data.get('historical', []))} historische Punkte")
                ok(f"  trend: {data.get('trend')}") if data.get("trend") in ["up", "down", "stable"] else fail("  trend ungültig")
                break
            else:
                fail(f"GET /api/forecast/{metric}", f"{response.status_code}: {str(data)[:80]}")
                break
        except Exception as exc:
            fail(f"GET /api/forecast/{metric}", str(exc))
            break

section("4 · Forecast Validierung")
try:
    response = requests.get(f"{BASE}/api/forecast/invalid_metric?horizon=30", timeout=10)
    ok("Ungültige Metrik → 400") if response.status_code == 400 else fail("Validierung Metrik", response.status_code)
except Exception as exc:
    fail("Validierung", str(exc))

try:
    response = requests.get(f"{BASE}/api/forecast/revenue?horizon=45", timeout=10)
    ok("Ungültiger Horizon → 400") if response.status_code == 400 else fail("Validierung Horizon", response.status_code)
except Exception as exc:
    fail("Validierung Horizon", str(exc))

section("5 · Regression Tag 9–13")
for url in ["/api/kpi", "/api/ai/insights", "/api/ai/recommendations", "/api/alerts", "/api/goals/progress", "/api/tasks"]:
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
    print("\n  🎉 Tag 14 komplett — Prognosen laufen!\n")
    sys.exit(0)
