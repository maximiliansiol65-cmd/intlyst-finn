"""AI v2 test suite. Run: python test_ai_v2.py"""
import sys
import requests

BASE = "http://127.0.0.1:8000"
PASS, FAIL = [], []


def ok(name: str, detail: object = ""):
    detail = str(detail) if detail != "" else ""
    PASS.append(name)
    print(f"  [OK] {name}" + (f" -> {detail}" if detail else ""))


def fail(name: str, detail: object = ""):
    detail = str(detail) if detail != "" else ""
    FAIL.append(name)
    print(f"  [FAIL] {name}" + (f" -> {detail}" if detail else ""))


def section(title):
    line = "-" * 56
    print(f"\n{line}\n  {title}\n{line}")


def get_json(url, timeout=60):
    r = requests.get(url, timeout=timeout)
    return r, r.json()


def check_quality_list(items, label, minimum_score):
    if not isinstance(items, list):
        fail(f"{label} list type", type(items).__name__)
        return
    for index, item in enumerate(items):
        score = item.get("quality_score")
        quality_label = item.get("quality_label")
        ok(f"{label}[{index}] has quality_score") if isinstance(score, int) else fail(f"{label}[{index}] missing quality_score", score)
        ok(f"{label}[{index}] has quality_label") if isinstance(quality_label, str) and quality_label else fail(f"{label}[{index}] missing quality_label", quality_label)
        if isinstance(score, int):
            ok(f"{label}[{index}] threshold") if score >= minimum_score else fail(f"{label}[{index}] threshold", score)


section("1) Server + Health")
try:
    r, d = get_json(f"{BASE}/")
    ok("Server root") if r.ok else fail("Server root", r.status_code)
    r, d = get_json(f"{BASE}/api/ai/health-check")
    ok("AI health") if r.ok else fail("AI health", r.status_code)
except Exception as exc:
    fail("Server/health", str(exc))
    sys.exit(1)


section("2) Analysis endpoint")
try:
    r, d = get_json(f"{BASE}/api/ai/analysis?days=30")
    if r.ok:
        ok("analysis -> 200")
        for key in ["summary", "health_score", "insights", "source", "processing_ms"]:
            ok(f"analysis has {key}") if key in d else fail(f"analysis missing {key}")
        ok("analysis source value") if d.get("source") in ("claude", "fallback", "local") else fail("analysis source invalid", d.get("source"))
        check_quality_list(d.get("insights", []), "analysis insights", 60)
    else:
        fail("analysis", f"{r.status_code}: {str(d)[:140]}")
except Exception as exc:
    fail("analysis", str(exc))


section("2b) Insights alias endpoint")
try:
    r, d = get_json(f"{BASE}/api/ai/insights?days=30")
    if r.ok:
        ok("insights alias -> 200")
        ok("insights alias returns list") if isinstance(d.get("insights"), list) else fail("insights alias list", type(d.get("insights")).__name__)
        check_quality_list(d.get("insights", []), "insights alias", 60)
    else:
        fail("insights alias", f"{r.status_code}: {str(d)[:140]}")
except Exception as exc:
    fail("insights alias", str(exc))


section("3) Recommendations endpoint")
try:
    r, d = get_json(f"{BASE}/api/ai/recommendations?days=30")
    if r.ok:
        ok("recommendations -> 200")
        for key in ["recommendations", "quick_wins", "strategic", "source", "processing_ms"]:
            ok(f"recommendations has {key}") if key in d else fail(f"recommendations missing {key}")
        ok("recommendations source value") if d.get("source") in ("claude", "fallback", "local") else fail("recommendations source invalid", d.get("source"))
        check_quality_list(d.get("recommendations", []), "recommendations", 60)
    else:
        fail("recommendations", f"{r.status_code}: {str(d)[:140]}")
except Exception as exc:
    fail("recommendations", str(exc))


section("4) Chat endpoint")
try:
    r = requests.post(
        f"{BASE}/api/ai/chat",
        json={"message": "Wie ist die aktuelle Lage?", "history": []},
        timeout=60,
    )
    d = r.json()
    if r.ok:
        ok("chat -> 200")
        for key in ["reply", "data_used", "source", "processing_ms"]:
            ok(f"chat has {key}") if key in d else fail(f"chat missing {key}")
    else:
        fail("chat", f"{r.status_code}: {str(d)[:140]}")
except Exception as exc:
    fail("chat", str(exc))


section("5) Forecast endpoint")
try:
    r, d = get_json(f"{BASE}/api/ai/forecast/revenue?horizon=30")
    if r.ok:
        ok("forecast -> 200")
        for key in ["forecast", "trend", "confidence", "source", "processing_ms"]:
            ok(f"forecast has {key}") if key in d else fail(f"forecast missing {key}")
        ok("forecast length 30") if len(d.get("forecast", [])) == 30 else fail("forecast length", len(d.get("forecast", [])))
    else:
        fail("forecast", f"{r.status_code}: {str(d)[:140]}")
except Exception as exc:
    fail("forecast", str(exc))


section("6) Forced fallback checks")
try:
    r, d = get_json(f"{BASE}/api/ai/analysis?days=30&force_fallback=true")
    ok("analysis forced fallback status") if r.ok else fail("analysis forced fallback status", r.status_code)
    ok("analysis forced fallback source") if d.get("source") == "fallback" else fail("analysis forced fallback source", d.get("source"))
    check_quality_list(d.get("insights", []), "analysis forced fallback insights", 60)

    r, d = get_json(f"{BASE}/api/ai/recommendations?days=30&force_fallback=true")
    ok("recommendations forced fallback status") if r.ok else fail("recommendations forced fallback status", r.status_code)
    ok("recommendations forced fallback source") if d.get("source") == "fallback" else fail("recommendations forced fallback source", d.get("source"))
    check_quality_list(d.get("recommendations", []), "recommendations forced fallback", 60)

    r = requests.post(
        f"{BASE}/api/ai/chat",
        json={"message": "Fallback testen", "history": [], "force_fallback": True},
        timeout=60,
    )
    d = r.json()
    ok("chat forced fallback status") if r.ok else fail("chat forced fallback status", r.status_code)
    ok("chat forced fallback source") if d.get("source") == "fallback" else fail("chat forced fallback source", d.get("source"))

    r, d = get_json(f"{BASE}/api/ai/forecast/revenue?horizon=30&force_fallback=true")
    ok("forecast forced fallback status") if r.ok else fail("forecast forced fallback status", r.status_code)
    ok("forecast forced fallback source") if d.get("source") == "fallback" else fail("forecast forced fallback source", d.get("source"))
except Exception as exc:
    fail("forced fallback", str(exc))


section("7) Intlyst endpoint")
try:
    r, d = get_json(f"{BASE}/api/intlyst/analyze?auto_tasks=false", timeout=70)
    if r.ok:
        ok("intlyst -> 200")
        for key in ["executive_summary", "health_score", "alerts", "recommendations", "patterns", "automations", "dashboard_improvements"]:
            ok(f"intlyst has {key}") if key in d else fail(f"intlyst missing {key}")
        check_quality_list(d.get("alerts", []), "intlyst alerts", 58)
        check_quality_list(d.get("recommendations", []), "intlyst recommendations", 60)
        check_quality_list(d.get("patterns", []), "intlyst patterns", 55)
        check_quality_list(d.get("automations", []), "intlyst automations", 50)
    else:
        fail("intlyst", f"{r.status_code}: {str(d)[:140]}")
except Exception as exc:
    fail("intlyst", str(exc))


section("8) Monitoring endpoint")
try:
    r, d = get_json(f"{BASE}/api/ai/metrics")
    if r.ok:
        ok("metrics -> 200")
        for key in ["endpoints", "totals", "model"]:
            ok(f"metrics has {key}") if key in d else fail(f"metrics missing {key}")
        for endpoint in ["analysis", "recommendations", "chat", "forecast"]:
            ok(f"metrics has {endpoint}") if endpoint in d.get("endpoints", {}) else fail(f"metrics missing endpoint {endpoint}")
        total_requests = int(d.get("totals", {}).get("requests", 0))
        ok("metrics captured requests") if total_requests > 0 else fail("metrics captured requests", total_requests)
    else:
        fail("metrics", r.status_code)
except Exception as exc:
    fail("metrics", str(exc))


print("\n" + "=" * 56)
total = len(PASS) + len(FAIL)
print(f"  Result: {len(PASS)}/{total} checks passed")
print("=" * 56)
if FAIL:
    for name in FAIL:
        print(f"   - {name}")
    sys.exit(1)
print("\n  AI v2 checks completed successfully.\n")
sys.exit(0)
