"""
Portable API smoke test.
Usage:
  python smoke_api_external.py --base-url http://localhost:8000
"""

import argparse
import sys
import requests


def run(base_url: str) -> int:
    passed = []
    failed = []

    def ok(name: str):
        passed.append(name)
        print(f"[OK] {name}")

    def fail(name: str, detail: str = ""):
        failed.append(name)
        suffix = f" -> {detail}" if detail else ""
        print(f"[FAIL] {name}{suffix}")

    def req(method: str, path: str, **kwargs):
        return requests.request(method, f"{base_url}{path}", timeout=8, **kwargs)

    # 1) server
    try:
        r = req("GET", "/")
        ok("GET /") if r.ok else fail("GET /", str(r.status_code))
    except Exception as exc:
        fail("GET /", str(exc))
        print("Server not reachable. Aborting.")
        return 1

    # 2) notifications
    nid = None
    try:
        r = req("POST", "/api/notifications", json={"title": "Smoke", "message": "Smoke", "type": "alert"})
        if r.ok:
            nid = r.json().get("id")
            ok("POST /api/notifications")
        else:
            fail("POST /api/notifications", str(r.status_code))
    except Exception as exc:
        fail("POST /api/notifications", str(exc))

    for path in ["/api/notifications", "/api/notifications/unread-count"]:
        try:
            r = req("GET", path)
            ok(f"GET {path}") if r.ok else fail(f"GET {path}", str(r.status_code))
        except Exception as exc:
            fail(f"GET {path}", str(exc))

    if nid is not None:
        for method, path in [
            ("PATCH", f"/api/notifications/{nid}/read"),
            ("PATCH", "/api/notifications/read-all"),
            ("DELETE", f"/api/notifications/{nid}"),
        ]:
            try:
                r = req(method, path)
                ok(f"{method} {path}") if r.ok else fail(f"{method} {path}", str(r.status_code))
            except Exception as exc:
                fail(f"{method} {path}", str(exc))

    # 3) tasks
    tid = None
    try:
        r = req("POST", "/api/tasks", json={"title": "Smoke task", "priority": "high"})
        if r.ok:
            tid = r.json().get("id")
            ok("POST /api/tasks")
        else:
            fail("POST /api/tasks", str(r.status_code))
    except Exception as exc:
        fail("POST /api/tasks", str(exc))

    for path in ["/api/tasks", "/api/tasks?status=open"]:
        try:
            r = req("GET", path)
            ok(f"GET {path}") if r.ok else fail(f"GET {path}", str(r.status_code))
        except Exception as exc:
            fail(f"GET {path}", str(exc))

    if tid is not None:
        for method, path, payload in [
            ("PATCH", f"/api/tasks/{tid}/next-status", None),
            ("PATCH", f"/api/tasks/{tid}", {"status": "done"}),
            ("DELETE", f"/api/tasks/{tid}", None),
        ]:
            try:
                r = req(method, path, json=payload) if payload else req(method, path)
                ok(f"{method} {path}") if r.ok else fail(f"{method} {path}", str(r.status_code))
            except Exception as exc:
                fail(f"{method} {path}", str(exc))

    try:
        r = req("POST", "/api/tasks", json={"title": "invalid", "priority": "invalid"})
        ok("POST /api/tasks invalid priority -> 400") if r.status_code == 400 else fail("invalid priority check", str(r.status_code))
    except Exception as exc:
        fail("invalid priority check", str(exc))

    # 4) recommendations
    try:
        r = req("GET", "/api/recommendations")
        data = r.json() if r.ok else None
        if r.ok and isinstance(data, list) and len(data) > 0:
            required = ["id", "title", "description", "impact_pct", "priority", "category", "action_label"]
            first = data[0]
            missing = [k for k in required if k not in first]
            if missing:
                fail("GET /api/recommendations schema", ", ".join(missing))
            else:
                ok("GET /api/recommendations")
        else:
            fail("GET /api/recommendations", str(r.status_code))
    except Exception as exc:
        fail("GET /api/recommendations", str(exc))

    # 5) regressions
    for path in [
        "/api/timeseries?metric=revenue&days=7",
        "/api/actions",
        "/api/goals",
        "/api/anomalies",
    ]:
        try:
            r = req("GET", path)
            ok(f"GET {path}") if r.ok else fail(f"GET {path}", str(r.status_code))
        except Exception as exc:
            fail(f"GET {path}", str(exc))

    # 6) optional demo seeding endpoint
    try:
        r = req("POST", "/api/dev/seed-demo")
        ok("POST /api/dev/seed-demo") if r.ok else fail("POST /api/dev/seed-demo", str(r.status_code))
    except Exception as exc:
        fail("POST /api/dev/seed-demo", str(exc))

    total = len(passed) + len(failed)
    print(f"\nResult: {len(passed)}/{total} passed")
    if failed:
        print("Failed checks:")
        for item in failed:
            print(f"- {item}")
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="Portable backend smoke test")
    parser.add_argument("--base-url", default="http://localhost:8000", help="API base URL")
    args = parser.parse_args()

    sys.exit(run(args.base_url.rstrip("/")))


if __name__ == "__main__":
    main()
