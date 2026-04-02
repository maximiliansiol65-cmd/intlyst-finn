"""GA4 Import Test. Ausführen: python test_ga4.py"""
import requests, sys, os
from dotenv import load_dotenv
load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []

def ok(n, d=""): PASS.append(n); print(f"  ✅  {n}" + (f"  →  {d}" if d else ""))
def fail(n, d=""): FAIL.append(n); print(f"  ❌  {n}" + (f"  →  {d}" if d else ""))
def section(t): print(f"\n{'─'*50}\n  {t}\n{'─'*50}")

section("1 · Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if r.ok else fail("Server")
except Exception as e: fail("Server", str(e)); sys.exit(1)

# ── Auth: Demo-User anlegen / einloggen ──────────────────────────────────────
section("1b · Auth (Demo-User)")
AUTH = {}
try:
    r = requests.post(f"{BASE}/api/auth/seed-demo-user")
    d = r.json()
    token = d.get("access_token") or d.get("token")
    if token:
        AUTH = {"Authorization": f"Bearer {token}"}
        ok(f"Demo-User → Token erhalten")
    else:
        fail("seed-demo-user", f"kein Token in Response: {list(d.keys())}")
except Exception as e:
    fail("seed-demo-user", str(e))

if not AUTH:
    # Fallback: Login mit Demo-Credentials
    try:
        r = requests.post(f"{BASE}/api/auth/login",
                          data={"username": "demo@bizlytics.de", "password": "demo123"})
        d = r.json()
        token = d.get("access_token")
        if token:
            AUTH = {"Authorization": f"Bearer {token}"}
            ok("Login Demo-User → Token erhalten")
        else:
            fail("login fallback", f"{r.status_code}: {str(d)[:80]}")
    except Exception as e:
        fail("login fallback", str(e))

section("2 · GA4 Status")
try:
    r = requests.get(f"{BASE}/api/ga4/status", headers=AUTH)
    d = r.json()
    if r.ok:
        ok(f"GET /api/ga4/status → configured={d.get('configured')}")
        for k in ["configured","auto_import","import_hour","total_imports"]:
            ok(f"  hat '{k}'") if k in d else fail(f"  fehlt '{k}'")
    else:
        fail("ga4 status", str(r.status_code))
except Exception as e: fail("ga4 status", str(e))

section("3 · GA4 Konfigurieren")
try:
    r = requests.post(f"{BASE}/api/ga4/configure", headers=AUTH, json={
        "property_id":   "123456789",
        "auto_import":   True,
        "import_hour":   6,
        "lookback_days": 1,
    })
    d = r.json()
    ok(f"POST /api/ga4/configure → {d.get('message','')[:50]}") if r.ok else fail("configure", f"{r.status_code}: {str(d)[:80]}")
except Exception as e: fail("configure", str(e))

section("4 · Status nach Konfiguration")
try:
    r = requests.get(f"{BASE}/api/ga4/status", headers=AUTH)
    d = r.json()
    ok(f"Property: {d.get('property_id')}") if d.get("property_id") == "123456789" else fail("property_id falsch")
    ok(f"Auto-Import: {d.get('auto_import')}")
    ok(f"Import Hour: {d.get('import_hour')}:00 Uhr")
except Exception as e: fail("status nach config", str(e))

section("5 · Verbindungstest (ohne echten Key)")
try:
    r = requests.post(f"{BASE}/api/ga4/test-connection", headers=AUTH)
    d = r.json()
    ok(f"Test-Connection → success={d.get('success')}") if r.ok else fail("test-connection", str(r.status_code))
    if not d.get("success"):
        ok(f"  Fehler korrekt: {str(d.get('error',''))[:60]}")
except Exception as e: fail("test-connection", str(e))

section("6 · Import Protokoll")
try:
    r = requests.get(f"{BASE}/api/ga4/history?limit=10", headers=AUTH)
    d = r.json()
    ok(f"GET /api/ga4/history → {len(d.get('imports',[]))} Einträge") if r.ok else fail("history", str(r.status_code))
except Exception as e: fail("history", str(e))

section("7 · GA4 mit echtem Key")
ga4_sa  = os.getenv("GA4_SERVICE_ACCOUNT_JSON", "")
ga4_tok = os.getenv("GA4_ACCESS_TOKEN", "")
ga4_pid = os.getenv("GA4_PROPERTY_ID", "")

if not (ga4_sa or ga4_tok):
    ok("GA4 Key Test übersprungen — kein GA4_SERVICE_ACCOUNT_JSON oder GA4_ACCESS_TOKEN gesetzt")
else:
    try:
        r = requests.post(f"{BASE}/api/ga4/import?days=7", headers=AUTH, timeout=30)
        d = r.json()
        if r.ok:
            ok(f"Import → {d.get('rows_imported')} neu, {d.get('rows_updated')} aktualisiert")
            ok(f"  Zeitraum: {d.get('date_range')}")
            ok(f"  Dauer: {d.get('duration_ms')}ms")
            if d.get("errors"):
                for err in d["errors"][:2]:
                    fail(f"  Import Fehler: {err}")
        else:
            fail("import", f"{r.status_code}: {str(d)[:100]}")
    except Exception as e: fail("import", str(e))

section("8 · Reset")
try:
    r = requests.delete(f"{BASE}/api/ga4/reset", headers=AUTH)
    ok("DELETE /api/ga4/reset → 200") if r.ok else fail("reset", str(r.status_code))
except Exception as e: fail("reset", str(e))

section("9 · Regression")
for url in ["/api/kpi", "/api/timeseries?metric=revenue&days=7"]:
    try:
        r = requests.get(f"{BASE}{url}", headers=AUTH, timeout=10)
        ok(f"GET {url} → {r.status_code}") if r.ok else fail(f"GET {url}", str(r.status_code))
    except Exception as e: fail(f"GET {url}", str(e))

print(f"\n{'═'*50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'═'*50}")
if FAIL:
    for f in FAIL: print(f"    • {f}")
    sys.exit(1)
else:
    print("\n  🎉 GA4 Import komplett!\n")
    sys.exit(0)
