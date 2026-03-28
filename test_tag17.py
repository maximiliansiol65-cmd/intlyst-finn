"""Tag 17 - Backend Test. Ausfuehren: python test_tag17.py"""
import requests
import sys
from dotenv import load_dotenv

load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []


def ok(name, detail: object = ""):
    PASS.append(name)
    print(f"  ✅  {name}" + (f"  ->  {detail}" if detail else ""))


def fail(name, detail: object = ""):
    FAIL.append(name)
    print(f"  ❌  {name}" + (f"  ->  {detail}" if detail else ""))


def section(title):
    print(f"\n{'-' * 50}\n  {title}\n{'-' * 50}")


section("1 - Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if r.ok else fail("Server", r.status_code)
except Exception as e:
    fail("Server", str(e))
    sys.exit(1)

section("2 - Industries")
try:
    r = requests.get(f"{BASE}/api/market/industries")
    d = r.json()
    ok(f"GET /api/market/industries -> {len(d.get('industries', []))} Branchen") if r.ok else fail("industries", r.status_code)
except Exception as e:
    fail("industries", str(e))

section("3 - Market Overview")
for industry in ["ecommerce", "saas", "retail", "gastro", "manufacturing", "finance", "healthcare", "public"]:
    try:
        r = requests.get(f"{BASE}/api/market/overview?industry={industry}", timeout=30)
        d = r.json()
        if r.ok:
            ok(f"GET /api/market/overview?industry={industry}")
            for key in ["industry", "season", "benchmarks", "trends", "insights", "summary"]:
                ok(f"  hat '{key}'") if key in d else fail(f"  fehlt '{key}'")
            ok(f"  {len(d.get('benchmarks', []))} Benchmarks")
            ok(f"  season: {d.get('season')}")
            if d.get("benchmarks"):
                b = d["benchmarks"][0]
                for k in ["metric", "your_value", "industry_avg", "percentile", "status"]:
                    ok(f"  benchmark hat '{k}'") if k in b else fail(f"  benchmark fehlt '{k}'")
            break
        else:
            fail(f"overview {industry}", f"{r.status_code}: {str(d)[:80]}")
    except Exception as e:
        fail(f"overview {industry}", str(e))

section("4 - Location")
for city in ["Muenchen", "Berlin", "Hamburg"]:
    try:
        r = requests.get(f"{BASE}/api/market/location?city={city}")
        d = r.json()
        if r.ok:
            ok(f"GET /api/market/location?city={city}")
            for k in ["city", "lat", "lng", "local_market_size", "competitors_nearby"]:
                ok(f"  hat '{k}'") if k in d else fail(f"  fehlt '{k}'")
            break
        else:
            fail(f"location {city}", r.status_code)
    except Exception as e:
        fail(f"location {city}", str(e))

section("5 - Validierung")
try:
    r = requests.get(f"{BASE}/api/market/overview?industry=invalid")
    ok("Ungueltige Branche -> 400") if r.status_code == 400 else fail("Validierung", r.status_code)
except Exception as e:
    fail("Validierung", str(e))

section("6 - Regression Tag 9-16")
for url in [
    "/api/kpi",
    "/api/alerts",
    "/api/tasks",
    "/api/integrations/status",
    "/api/forecast/revenue?horizon=30",
]:
    try:
        r = requests.get(f"{BASE}{url}", timeout=35)
        ok(f"GET {url} -> {r.status_code}") if r.ok else fail(f"GET {url}", r.status_code)
    except Exception as e:
        fail(f"GET {url}", str(e))

print(f"\n{'=' * 50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'=' * 50}")
if FAIL:
    for failed in FAIL:
        print(f"    - {failed}")
    sys.exit(1)
else:
    print("\n  Tag 17 komplett - Marktanalyse laeuft!\n")
    sys.exit(0)
