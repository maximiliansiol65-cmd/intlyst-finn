"""Growth Engine Test. Ausfuehren: python test_growth.py"""

import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []


def ok(name, detail=""):
    PASS.append(name)
    print(f"  [PASS] {name}" + (f"  ->  {detail}" if detail else ""))


def fail(name, detail=""):
    FAIL.append(name)
    print(f"  [FAIL] {name}" + (f"  ->  {detail}" if detail else ""))


def section(title):
    print(f"\n{'-' * 50}\n  {title}\n{'-' * 50}")


section("1 · Server")
try:
    response = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if response.ok else fail("Server")
except Exception as exc:
    fail("Server", str(exc))
    sys.exit(1)

section("2 · Growth Goals")
try:
    response = requests.get(f"{BASE}/api/growth/goals", timeout=10)
    data = response.json()
    if response.ok and isinstance(data, list) and len(data) == 8:
        ok(f"GET /api/growth/goals -> {len(data)} Ziele")
        for goal in data:
            for key in ["key", "label", "focus", "icon", "strategy"]:
                ok(f"  {goal.get('key')} hat '{key}'") if key in goal else fail(f"  {goal.get('key')} fehlt '{key}'")
    else:
        fail("goals", f"{response.status_code}: {len(data) if isinstance(data, list) else 'kein array'}")
except Exception as exc:
    fail("goals", str(exc))

section("3 · Set Growth Goal")
for goal_key in ["more_revenue", "more_customers", "social_media", "fast_growth"]:
    try:
        response = requests.post(
            f"{BASE}/api/growth/set-goal",
            json={
                "growth_goal": goal_key,
                "company_name": "Test GmbH",
                "industry": "E-Commerce",
                "social_handles": {
                    "instagram": "testshop",
                    "tiktok": "testshop_tiktok",
                },
            },
            timeout=10,
        )
        data = response.json()
        ok(f"Set goal '{goal_key}' -> {data.get('message', '')}") if response.ok else fail(
            f"set-goal {goal_key}", f"{response.status_code}: {str(data)[:80]}"
        )
    except Exception as exc:
        fail(f"set-goal {goal_key}", str(exc))

section("4 · Growth Profile")
try:
    response = requests.get(f"{BASE}/api/growth/profile", timeout=10)
    data = response.json()
    if response.ok:
        ok(f"GET /api/growth/profile -> goal={data.get('growth_goal')}")
        for key in ["growth_goal", "goal_label", "goal_icon", "focus"]:
            ok(f"  hat '{key}'") if key in data else fail(f"  fehlt '{key}'")
    else:
        fail("profile", str(response.status_code))
except Exception as exc:
    fail("profile", str(exc))

section("5 · Growth Strategy (KI)")
api_key = os.getenv("ANTHROPIC_API_KEY", "")
if not api_key or not api_key.startswith("sk-ant-"):
    ok("KI-Test uebersprungen - API Key fehlt")
else:
    try:
        response = requests.get(f"{BASE}/api/growth/strategy", timeout=50)
        data = response.json()
        if response.ok:
            ok(f"GET /api/growth/strategy -> score={data.get('growth_score')}")
            for key in [
                "growth_goal",
                "executive_summary",
                "growth_score",
                "growth_velocity",
                "biggest_lever",
                "actions",
                "social_strategies",
                "quick_wins",
                "warnings",
                "next_30_days",
            ]:
                ok(f"  hat '{key}'") if key in data else fail(f"  fehlt '{key}'")
            ok(f"  {len(data.get('actions', []))} Massnahmen")
            ok(f"  {len(data.get('social_strategies', []))} Social Strategien")
            ok(f"  growth_velocity: {data.get('growth_velocity')}")
            if data.get("actions"):
                action = data["actions"][0]
                for key in ["id", "title", "description", "why_now", "impact", "impact_pct", "specific_steps"]:
                    ok(f"  action hat '{key}'") if key in action else fail(f"  action fehlt '{key}'")
            if data.get("social_strategies"):
                social = data["social_strategies"][0]
                for key in ["platform", "content_type", "frequency", "hook_formula", "example_idea", "converts_to"]:
                    ok(f"  social hat '{key}'") if key in social else fail(f"  social fehlt '{key}'")
        else:
            fail("strategy", f"{response.status_code}: {str(data)[:100]}")
    except Exception as exc:
        fail("strategy", str(exc))

section("6 · Content Ideas")
if api_key and api_key.startswith("sk-ant-"):
    try:
        response = requests.get(f"{BASE}/api/growth/content-ideas?count=3", timeout=30)
        data = response.json()
        if response.ok and isinstance(data, list):
            ok(f"GET /api/growth/content-ideas -> {len(data)} Ideen")
            if data:
                idea = data[0]
                for key in ["platform", "format", "hook", "content", "cta", "best_time", "goal"]:
                    ok(f"  idea hat '{key}'") if key in idea else fail(f"  idea fehlt '{key}'")
        else:
            fail("content-ideas", f"{response.status_code}: {str(data)[:80]}")
    except Exception as exc:
        fail("content-ideas", str(exc))

section("7 · Validierung")
try:
    response = requests.post(f"{BASE}/api/growth/set-goal", json={"growth_goal": "invalid_goal"}, timeout=10)
    ok("Ungueltiges Ziel -> 400") if response.status_code == 400 else fail("Validierung", str(response.status_code))
except Exception as exc:
    fail("Validierung", str(exc))

print(f"\n{'=' * 50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'=' * 50}")
if FAIL:
    for failed in FAIL:
        print(f"    - {failed}")
    sys.exit(1)

print("\n  Growth Engine komplett!\n")
sys.exit(0)