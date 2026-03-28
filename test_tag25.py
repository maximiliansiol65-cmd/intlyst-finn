"""Tag 25 — Backend Test. Ausführen: python test_tag25.py"""
import requests, sys
from dotenv import load_dotenv
load_dotenv()

BASE = "http://localhost:8000"
PASS, FAIL = [], []

def ok(n, d=""): PASS.append(n); print(f"  ✅  {n}" + (f"  →  {d}" if d else ""))
def fail(n, d=""): FAIL.append(n); print(f"  ❌  {n}" + (f"  →  {d}" if d else ""))
def section(t): print(f"\n{'─'*50}\n  {t}\n{'─'*50}")

section("1 · Server + Demo User")
token = ""
try:
    r = requests.get(f"{BASE}/", timeout=4)
    ok("Server") if r.ok else fail("Server", str(r.status_code))
    r2 = requests.post(f"{BASE}/api/auth/seed-demo-user")
    d2 = r2.json()
    token = d2.get("token", "")
    ok(f"Demo-User Token: {token[:20]}...") if token else fail("Token")
except Exception as e:
    fail("Server", str(e)); sys.exit(1)

H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

section("2 · Team Members")
try:
    r = requests.get(f"{BASE}/api/team/members", headers=H)
    d = r.json()
    ok(f"GET /api/team/members → {len(d)} Mitglieder") if r.ok and isinstance(d, list) else fail("members", str(r.status_code))
    if d:
        m = d[0]
        for k in ["id","email","role","is_active"]:
            ok(f"  hat '{k}'") if k in m else fail(f"  fehlt '{k}'")
except Exception as e: fail("members", str(e))

section("3 · Team Invite")
import random
test_email = f"member_{random.randint(1000,9999)}@test.de"
try:
    r = requests.post(f"{BASE}/api/team/invite", headers=H,
        json={"email": test_email, "name": "Test Member", "role": "member"})
    d = r.json()
    if r.ok:
        ok(f"Einladung → {test_email}")
        ok(f"  temp_password: {d.get('temp_password','')[:8]}...")
        ok("  invite_token vorhanden") if d.get("invite_token") else fail("  invite_token fehlt")
        new_user_id = d.get("user_id")
    else:
        fail("invite", f"{r.status_code}: {str(d)[:80]}")
        new_user_id = None
except Exception as e: fail("invite", str(e)); new_user_id = None

section("4 · Permissions")
if new_user_id:
    try:
        r = requests.get(f"{BASE}/api/team/permissions/{new_user_id}", headers=H)
        d = r.json()
        if r.ok and isinstance(d, list):
            ok(f"GET permissions/{new_user_id} → {len(d)} Ressourcen")
            if d:
                p = d[0]
                for k in ["resource","can_view","can_edit","can_delete"]:
                    ok(f"  hat '{k}'") if k in p else fail(f"  fehlt '{k}'")
        else:
            fail("permissions get", str(r.status_code))
    except Exception as e: fail("permissions get", str(e))

    try:
        r = requests.put(f"{BASE}/api/team/permissions/{new_user_id}", headers=H,
            json={"resource": "dashboard", "can_view": True, "can_edit": False, "can_delete": False})
        ok("PUT permissions → 200") if r.ok else fail("permissions put", str(r.status_code))
    except Exception as e: fail("permissions put", str(e))

section("5 · Tasks mit Verlauf")
task_id = None
try:
    r = requests.post(f"{BASE}/api/tasks", json={
        "title": "Test-Task mit Verlauf", "priority": "high",
        "assigned_to": "Test User", "created_by": "pytest"
    })
    d = r.json()
    task_id = d.get("id")
    if r.ok:
        ok(f"POST /api/tasks → id={task_id}")
        for k in ["id","title","status","status_label","priority","assigned_to","created_by"]:
            ok(f"  hat '{k}'") if k in d else fail(f"  fehlt '{k}'")
        ok(f"  status_label: '{d.get('status_label')}'")
    else:
        fail("create task", f"{r.status_code}: {str(d)[:80]}")
except Exception as e: fail("create task", str(e))

if task_id:
    try:
        r = requests.patch(f"{BASE}/api/tasks/{task_id}/next-status?changed_by=pytest")
        d = r.json()
        ok(f"next-status → {d.get('status')} / {d.get('status_label')}") if r.ok else fail("next-status", str(r.status_code))
    except Exception as e: fail("next-status", str(e))

    try:
        r = requests.patch(f"{BASE}/api/tasks/{task_id}?changed_by=pytest",
            json={"assigned_to": "New Person", "priority": "medium"})
        ok("PATCH task update → 200") if r.ok else fail("patch task", str(r.status_code))
    except Exception as e: fail("patch task", str(e))

    try:
        r = requests.get(f"{BASE}/api/tasks/{task_id}/history")
        d = r.json()
        if r.ok and isinstance(d, list):
            ok(f"GET task history → {len(d)} Einträge")
            if d:
                h = d[0]
                for k in ["field","old_value","new_value","changed_at"]:
                    ok(f"  history hat '{k}'") if k in h else fail(f"  history fehlt '{k}'")
        else:
            fail("task history", str(r.status_code))
    except Exception as e: fail("task history", str(e))

    try:
        r = requests.get(f"{BASE}/api/tasks/stats")
        d = r.json()
        if r.ok:
            ok(f"GET /api/tasks/stats → total={d.get('total')}, done={d.get('done')}")
            for k in ["total","open","in_progress","done","completion_rate"]:
                ok(f"  hat '{k}'") if k in d else fail(f"  fehlt '{k}'")
        else:
            fail("task stats", str(r.status_code))
    except Exception as e: fail("task stats", str(e))

    try:
        requests.delete(f"{BASE}/api/tasks/{task_id}")
        ok("Task aufgeräumt")
    except: pass

section("6 · Regression")
for url in ["/api/kpi", "/api/billing/status", "/api/customers/list"]:
    try:
        r = requests.get(f"{BASE}{url}", timeout=10)
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
    print("\n  🎉 Tag 25 komplett — Team + Settings + Tasks laufen!\n")
    sys.exit(0)
