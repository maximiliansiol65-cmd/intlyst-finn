"""Tag 15 — Backend Test. Ausführen: python test_tag15.py"""
import os
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

section("2 · Daily Digest")
try:
    r = requests.get(f"{BASE}/api/digest", timeout=30)
    d = r.json()
    if r.ok:
        ok("GET /api/digest → 200")
        for key in ["date", "summary", "top_insight", "top_action", "mood", "generated_by"]:
            ok(f"  hat '{key}'") if key in d else fail(f"  fehlt '{key}'")
        ok(f"  mood: {d.get('mood')}") if d.get("mood") in ["great", "good", "neutral", "concerning", "critical"] else fail("  mood ungültig")
        ok(f"  summary: '{d.get('summary', '')[:60]}...'")
    else:
        fail("GET /api/digest", f"{r.status_code}: {str(d)[:100]}")
except Exception as e:
    fail("GET /api/digest", str(e))

try:
    r = requests.post(f"{BASE}/api/digest/trigger", timeout=30)
    d = r.json()
    ok("POST /api/digest/trigger → " + d.get("mood", "?")) if r.ok else fail("POST /api/digest/trigger", r.status_code)
except Exception as e:
    fail("POST /api/digest/trigger", str(e))

section("3 · KI-Alert-Analyse")
try:
    r = requests.get(f"{BASE}/api/ai/alert-analysis", timeout=30)
    d = r.json()
    if r.ok and isinstance(d, list):
        ok(f"GET /api/ai/alert-analysis → {len(d)} Alerts")
        if d:
            first = d[0]
            for key in ["metric", "metric_label", "severity", "explanation", "root_cause", "recommended_action", "urgency_score"]:
                ok(f"  hat '{key}'") if key in first else fail(f"  fehlt '{key}'")
            ok(f"  urgency_score: {first.get('urgency_score')}") if isinstance(first.get("urgency_score"), int) else fail("  urgency_score kein int")
    else:
        fail("GET /api/ai/alert-analysis", f"{r.status_code}: {str(d)[:100]}")
except Exception as e:
    fail("GET /api/ai/alert-analysis", str(e))

section("4 · Regression Tag 9–14")
for url in [
    "/api/kpi",
    "/api/forecast/revenue?horizon=30",
    "/api/ai/insights",
    "/api/ai/recommendations",
    "/api/alerts",
    "/api/tasks",
    "/api/goals/progress",
]:
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
    print("\n  🎉 Tag 15 komplett — KI-Phase abgeschlossen!\n")
    sys.exit(0)
