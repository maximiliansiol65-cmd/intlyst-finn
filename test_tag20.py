"""Tag 20 - Backend Test. Ausfuehren: python test_tag20.py"""
import requests, sys
from dotenv import load_dotenv

load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []


def ok(n, d=""):
    PASS.append(n)
    print(f"  ✅  {n}" + (f"  →  {d}" if d else ""))


def fail(n, d=""):
    FAIL.append(n)
    print(f"  ❌  {n}" + (f"  →  {d}" if d else ""))


def section(t):
    print(f"\n{'─'*50}\n  {t}\n{'─'*50}")


section("1 · Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if r.ok else fail("Server", r.status_code)
except Exception as e:
    fail("Server", str(e))
    sys.exit(1)


section("2 · Industries")
try:
    r = requests.get(f"{BASE}/api/benchmark/industries")
    d = r.json()
    ok(f"GET /api/benchmark/industries → {len(d)} Branchen") if r.ok and isinstance(d, list) else fail("industries", r.status_code)
except Exception as e:
    fail("industries", str(e))


section("3 · Benchmark Analyse")
for industry in ["ecommerce", "saas", "retail", "gastro"]:
    try:
        r = requests.get(f"{BASE}/api/benchmark/analyze?industry={industry}", timeout=30)
        d = r.json()
        if r.ok:
            ok(f"GET /api/benchmark/analyze?industry={industry}")
            for k in ["industry", "overall_percentile", "overall_status", "benchmarks", "ai_summary", "top_priority"]:
                ok(f"  hat '{k}'") if k in d else fail(f"  fehlt '{k}'")
            ok(f"  {len(d.get('benchmarks', []))} Benchmarks")
            ok(f"  overall_percentile: {d.get('overall_percentile')}")
            ok(f"  overall_status: {d.get('overall_status')}")
            if d.get("benchmarks"):
                b = d["benchmarks"][0]
                for k in ["metric_key", "your_value", "industry_avg", "percentile", "status", "gap_to_avg", "ai_comment", "ai_action"]:
                    ok(f"  benchmark hat '{k}'") if k in b else fail(f"  benchmark fehlt '{k}'")
            break
        else:
            fail(f"benchmark {industry}", f"{r.status_code}: {str(d)[:100]}")
    except Exception as e:
        fail(f"benchmark {industry}", str(e))


section("4 · Validierung")
try:
    r = requests.get(f"{BASE}/api/benchmark/analyze?industry=invalid")
    ok("Ungültige Branche → 400") if r.status_code == 400 else fail("Validierung", r.status_code)
except Exception as e:
    fail("Validierung", str(e))


section("5 · Regression Tag 9–19")
for url in ["/api/kpi", "/api/customers/rfm", "/api/market/overview?industry=ecommerce", "/api/forecast/revenue?horizon=30"]:
    try:
        r = requests.get(f"{BASE}{url}", timeout=35)
        ok(f"GET {url} → {r.status_code}") if r.ok else fail(f"GET {url}", r.status_code)
    except Exception as e:
        fail(f"GET {url}", str(e))


print(f"\n{'═'*50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'═'*50}")
if FAIL:
    for f in FAIL:
        print(f"    • {f}")
    sys.exit(1)
else:
    print("\n  🎉 Tag 20 komplett — Branchenvergleich läuft!\n")
    sys.exit(0)