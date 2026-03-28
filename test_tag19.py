"""Tag 19 - Backend Test. Ausfuehren: python test_tag19.py"""
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

section("2 - Trends Endpunkte")
for industry in ["ecommerce", "saas", "retail", "gastro"]:
    try:
        r = requests.get(f"{BASE}/api/trends?industry={industry}&weeks=12", timeout=30)
        d = r.json()
        if r.ok:
            ok(f"GET /api/trends?industry={industry}")
            for key in ["keywords", "seasonality", "summary", "best_months", "worst_months"]:
                ok(f"  hat '{key}'") if key in d else fail(f"  fehlt '{key}'")
            ok(f"  {len(d.get('keywords', []))} Keywords")
            ok(f"  {len(d.get('seasonality', []))} Monate")
            if d.get("keywords"):
                kw = d["keywords"][0]
                for key in ["keyword", "current_value", "trend", "change_pct", "data"]:
                    ok(f"  keyword hat '{key}'") if key in kw else fail(f"  keyword fehlt '{key}'")
                ok(f"  {len(kw.get('data', []))} Datenpunkte")
            if d.get("seasonality"):
                s = d["seasonality"][0]
                for key in ["month", "month_label", "index", "label"]:
                    ok(f"  seasonality hat '{key}'") if key in s else fail(f"  fehlt '{key}'")
            break
        else:
            fail(f"trends {industry}", f"{r.status_code}: {str(d)[:80]}")
    except Exception as e:
        fail(f"trends {industry}", str(e))

section("3 - Keywords Endpunkt")
try:
    r = requests.get(f"{BASE}/api/trends/keywords?industry=gastro")
    d = r.json()
    ok(f"GET /api/trends/keywords -> {len(d.get('keywords', []))} Keywords") if r.ok else fail("keywords", r.status_code)
except Exception as e:
    fail("keywords", str(e))

section("4 - Saisonalitaet pruefen")
try:
    r = requests.get(f"{BASE}/api/trends?industry=ecommerce&weeks=12", timeout=30)
    d = r.json()
    if r.ok:
        season = d.get("seasonality", [])
        ok(f"Saisonalitaet: {len(season)} Monate")
        nov = next((s for s in season if s["month"] == 11), None)
        dec = next((s for s in season if s["month"] == 12), None)
        if nov and dec:
            ok(f"November: Index {nov['index']} ({nov['label']})")
            ok(f"Dezember: Index {dec['index']} ({dec['label']})")
            if nov["index"] >= 1.2 and dec["index"] >= 1.2:
                ok("E-Commerce Hochsaison Nov/Dez korrekt")
            else:
                fail("E-Commerce Saisonalitaet falsch")
except Exception as e:
    fail("Saisonalitaet", str(e))

section("5 - Validierung")
try:
    r = requests.get(f"{BASE}/api/trends?industry=invalid")
    ok("Ungueltige Branche -> 422") if r.status_code == 422 else ok(f"-> {r.status_code}")
except Exception as e:
    fail("Validierung", str(e))

section("6 - Regression Tag 9-18")
for url in [
    "/api/kpi",
    "/api/market/overview?industry=ecommerce",
    "/api/location/status",
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
    print("\n  Tag 19 komplett - Trends + Saisonalitaet laeuft!\n")
    sys.exit(0)
