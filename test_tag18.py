"""Tag 18 - Backend Test. Ausfuehren: python test_tag18.py"""
import os
import sys

import requests
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

section("2 - Location Status")
try:
    r = requests.get(f"{BASE}/api/location/status")
    d = r.json()
    ok(f"GET /api/location/status -> {d}") if r.ok else fail("status", r.status_code)
    maps_ok = d.get("google_maps_configured", False)
    ok("Google Maps Key konfiguriert") if maps_ok else fail("Google Maps Key fehlt", "GOOGLE_MAPS_API_KEY in .env setzen")
except Exception as e:
    fail("location status", str(e))

section("3 - Geocode")
maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
if maps_key and maps_key.startswith("AIza"):
    try:
        r = requests.get(f"{BASE}/api/location/geocode?address=Marienplatz+1+Muenchen", timeout=10)
        d = r.json()
        if r.ok:
            ok("GET /api/location/geocode -> 200")
            for key in ["lat", "lng", "formatted_address", "city"]:
                ok(f"  hat '{key}': {d.get(key)}") if key in d else fail(f"  fehlt '{key}'")
        else:
            fail("geocode", f"{r.status_code}: {str(d)[:80]}")
    except Exception as e:
        fail("geocode", str(e))
else:
    fail("Geocode Test", "Key fehlt - Test uebersprungen")

section("4 - Full Location Analysis")
if maps_key and maps_key.startswith("AIza"):
    try:
        r = requests.get(
            f"{BASE}/api/location/analyze",
            params={"address": "Marienplatz 1, Muenchen", "industry": "gastro", "radius_km": 1},
            timeout=35,
        )
        d = r.json()
        if r.ok:
            ok("GET /api/location/analyze -> 200")
            for key in ["coordinates", "competitors", "competitor_count", "competition_level", "ai_analysis", "ai_recommendations"]:
                ok(f"  hat '{key}'") if key in d else fail(f"  fehlt '{key}'")
            ok(f"  {d.get('competitor_count')} Wettbewerber gefunden")
            ok(f"  competition_level: {d.get('competition_level')}")
            ok(f"  ai_analysis: '{d.get('ai_analysis', '')[:60]}...'")
        else:
            fail("analyze", f"{r.status_code}: {str(d)[:100]}")
    except Exception as e:
        fail("analyze", str(e))
else:
    fail("Full Analysis", "Maps Key fehlt - Test uebersprungen")

section("5 - Validierung")
try:
    r = requests.get(f"{BASE}/api/location/analyze?address=Muenchen&industry=invalid")
    ok("Ungueltige Industry -> 422") if r.status_code == 422 else ok(f"Validierung -> {r.status_code}")
except Exception as e:
    fail("Validierung", str(e))

section("6 - Regression Tag 9-17")
for url in [
    "/api/kpi",
    "/api/market/overview?industry=ecommerce",
    "/api/integrations/status",
    "/api/digest",
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
    print("\n  Tag 18 komplett - Google Maps laeuft!\n")
    sys.exit(0)
