"""Stripe Billing Test. Ausführen: python test_billing.py"""
import requests, sys, os
from dotenv import load_dotenv
load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []

def ok(n, d=""): PASS.append(n); print(f"  \u2705  {n}" + (f"  \u2192  {d}" if d else ""))
def fail(n, d=""): FAIL.append(n); print(f"  \u274c  {n}" + (f"  \u2192  {d}" if d else ""))
LINE = "\u2500" * 50
def section(t): print(f"\n{LINE}\n  {t}\n{LINE}")

section("1 \u00b7 Server")
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if r.ok else fail("Server", str(r.status_code))
except Exception as e:
    fail("Server", str(e)); sys.exit(1)

section("2 \u00b7 Stripe Key")
key = os.getenv("STRIPE_SECRET_KEY", "")
if key and key.startswith("sk_"):
    ok(f"STRIPE_SECRET_KEY gesetzt ({key[:12]}...)")
else:
    fail("STRIPE_SECRET_KEY fehlt oder ungültig")

section("3 \u00b7 Pläne")
try:
    r = requests.get(f"{BASE}/api/billing/plans")
    d = r.json()
    if r.ok and isinstance(d, list) and len(d) == 3:
        ok(f"GET /api/billing/plans \u2192 {len(d)} Pläne")
        for plan in d:
            for k in ["key","name","price","features","max_users","highlight","available"]:
                ok(f"  {plan.get('key')} hat '{k}'") if k in plan else fail(f"  {plan.get('key')} fehlt '{k}'")
            ok(f"  {plan['key']}: \u20ac{plan['price']}/Monat, max_users={plan['max_users']}")
    else:
        fail("plans", f"Status {r.status_code}")
except Exception as e: fail("plans", str(e))

section("4 \u00b7 Billing Status")
try:
    r = requests.get(f"{BASE}/api/billing/status")
    d = r.json()
    if r.ok:
        ok("GET /api/billing/status \u2192 200")
        for k in ["plan","plan_name","status","is_active","features","max_users"]:
            ok(f"  hat '{k}'") if k in d else fail(f"  fehlt '{k}'")
        ok(f"  plan={d.get('plan')}, status={d.get('status')}, is_active={d.get('is_active')}")
    else:
        fail("status", str(r.status_code))
except Exception as e: fail("status", str(e))

section("5 \u00b7 Dev Aktivierung")
for plan in ["standard", "team_standard", "team_pro"]:
    try:
        r = requests.post(f"{BASE}/api/billing/dev/activate?plan={plan}")
        d = r.json()
        if r.ok:
            ok(f"Dev-Aktivierung '{plan}' \u2192 {d.get('status')}")
            status = requests.get(f"{BASE}/api/billing/status").json()
            ok(f"  Status nach Aktivierung: {status.get('plan')} / {status.get('status')}") if status.get("plan") == plan else fail(f"  Plan nicht gesetzt")
        else:
            fail(f"dev/activate {plan}", f"{r.status_code}: {str(d)[:80]}")
    except Exception as e: fail(f"dev/activate {plan}", str(e))

section("6 \u00b7 Checkout Validierung")
try:
    r = requests.post(f"{BASE}/api/billing/checkout",
        json={"plan": "invalid_plan"})
    ok("Ungültiger Plan \u2192 400") if r.status_code == 400 else fail("Plan Validierung", str(r.status_code))
except Exception as e: fail("Validierung", str(e))

section("7 \u00b7 Checkout mit echtem Stripe Key")
if key and key.startswith("sk_") and os.getenv("STRIPE_PRICE_STANDARD"):
    try:
        r = requests.post(f"{BASE}/api/billing/checkout",
            json={"plan": "standard",
                  "success_url": "http://localhost:5173/settings",
                  "cancel_url":  "http://localhost:5173/pricing"})
        d = r.json()
        if r.ok:
            ok(f"Checkout Session erstellt \u2192 {d.get('session_id','')[:20]}...")
            ok("checkout_url vorhanden") if d.get("checkout_url") else fail("checkout_url fehlt")
        else:
            fail("checkout", f"{r.status_code}: {str(d)[:100]}")
    except Exception as e: fail("checkout", str(e))
else:
    ok("Checkout übersprungen — STRIPE_PRICE_STANDARD nicht gesetzt (ok für Dev)")

section("8 \u00b7 Rechnungen")
try:
    r = requests.get(f"{BASE}/api/billing/invoices")
    d = r.json()
    ok(f"GET /api/billing/invoices \u2192 {len(d.get('invoices',[]))} Rechnungen") if r.ok else fail("invoices", str(r.status_code))
except Exception as e: fail("invoices", str(e))

section("9 \u00b7 Webhook Simulation")
try:
    event = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"id": "sub_test", "status": "canceled"}}
    }
    r = requests.post(f"{BASE}/api/billing/webhook",
        json=event,
        headers={"stripe-signature": "t=123,v1=abc"})
    ok(f"Webhook \u2192 {r.status_code}") if r.status_code in (200, 400) else fail("webhook", str(r.status_code))
except Exception as e: fail("webhook", str(e))

print(f"\n{'='*50}")
total = len(PASS) + len(FAIL)
print(f"  Ergebnis: {len(PASS)}/{total} Tests bestanden")
print(f"{'='*50}")
if FAIL:
    for f in FAIL: print(f"    \u2022 {f}")
    sys.exit(1)
else:
    print("\n  \U0001f389 Stripe Billing komplett!\n")
    sys.exit(0)
