"""Referral System Test. python test_referral.py"""
import requests, sys
BASE  = "http://localhost:8000"
PASS, FAIL = [], []

def ok(n, d=""): PASS.append(n); print(f"  ✅  {n}" + (f"  →  {d}" if d else ""))
def fail(n, d=""): FAIL.append(n); print(f"  ❌  {n}" + (f"  →  {d}" if d else ""))
def section(t): print(f"\n{'─'*50}\n  {t}\n{'─'*50}")

section("1 · Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if r.ok else fail("Server")
except Exception as e: fail("Server", str(e)); sys.exit(1)

section("2 · Referral Code erstellen")
r = requests.get(f"{BASE}/api/referral/my-code?user_id=1")
d = r.json()
ok(f"Code: {d.get('code')}") if r.ok else fail("my-code", r.status_code)
for key in ["code","referral_url","total_clicks","total_active","tiers","share","current_tier","next_tier"]:
    ok(f"  hat '{key}'") if key in d else fail(f"  fehlt '{key}'")
code = d.get("code", "TEST123")

section("3 · Click tracken")
r = requests.post(f"{BASE}/api/referral/track-click/{code}")
ok(f"Click tracked → {r.status_code}") if r.ok else fail("track-click", r.status_code)

r2 = requests.get(f"{BASE}/api/referral/my-code?user_id=1")
d2 = r2.json()
ok(f"Clicks: {d2.get('total_clicks')}") if d2.get("total_clicks", 0) >= 1 else fail("clicks nicht erhöht")

section("4 · Neuer Nutzer registriert sich")
r = requests.post(
    f"{BASE}/api/referral/register",
    params={"code": code, "new_user_id": 999, "new_name": "Lars Testmann"}
)
d = r.json()
ok(f"Registrierung → {d}") if r.ok else fail("register", f"{r.status_code}: {r.text[:60]}")

section("5 · Stats nach Registrierung")
r = requests.get(f"{BASE}/api/referral/my-code?user_id=1")
d = r.json()
ok(f"total_active: {d.get('total_active')}") if d.get("total_active", 0) >= 1 else fail("active nicht erhöht")
ok(f"days_earned: {d.get('total_days_earned')}") if d.get("total_days_earned", 0) > 0 else fail("days nicht gutgeschrieben")
ok(f"progress_pct: {d.get('progress_pct')}%")

section("6 · Kein Selbst-Referral")
r = requests.post(
    f"{BASE}/api/referral/register",
    params={"code": code, "new_user_id": 1, "new_name": "Selbst"}
)
ok("Selbst-Referral abgelehnt") if r.status_code == 400 else fail("Selbst-Referral nicht blockiert", r.status_code)

section("7 · History")
r = requests.get(f"{BASE}/api/referral/history?user_id=1")
d = r.json()
ok(f"History → {len(d.get('events',[]))} Events") if r.ok else fail("history", r.status_code)
ok(f"Rewards → {len(d.get('rewards',[]))} Einträge")

section("8 · Leaderboard")
r = requests.get(f"{BASE}/api/referral/leaderboard")
d = r.json()
ok(f"Leaderboard → {len(d.get('top',[]))} Einträge") if r.ok else fail("leaderboard", r.status_code)

section("9 · Code validieren")
r = requests.get(f"{BASE}/api/referral/validate/{code}")
d = r.json()
ok(f"Code valid → reward_days={d.get('reward_days')}") if r.ok else fail("validate", r.status_code)

r2 = requests.get(f"{BASE}/api/referral/validate/XXXXINVALID")
ok("Ungültiger Code → 404") if r2.status_code == 404 else fail("Ungültiger Code nicht abgelehnt")

section("10 · Skalierendes Incentive prüfen")
tiers = [
    (1,  14),
    (3,  30),
    (5,  60),
    (10, 180),
]
for n_referrals, expected_days in tiers:
    from routers.referral import reward_for_count
    actual = reward_for_count(n_referrals)
    ok(f"Tier {n_referrals} Referrals → {actual} Tage") if actual == expected_days else fail(
        f"Tier {n_referrals}", f"erwartet {expected_days}, bekommen {actual}"
    )

section("11 · Regression")
for url in ["/api/tasks", "/api/kpi", "/api/notifications", "/ws/stats"]:
    try:
        r = requests.get(f"{BASE}{url}", timeout=5)
        ok(f"GET {url} → {r.status_code}") if r.ok else fail(url, r.status_code)
    except Exception as e: fail(url, str(e))

print(f"\n{'═'*50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests")
print(f"{'═'*50}")
if FAIL:
    for f in FAIL: print(f"    • {f}")
    sys.exit(1)
else:
    print("\n  🎉 Referral System komplett!\n")
    sys.exit(0)
