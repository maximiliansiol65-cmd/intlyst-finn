#!/usr/bin/env python3
"""Test all AI endpoints."""
import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv()

BASE = "http://127.0.0.1:8000"
key = os.getenv("ANTHROPIC_API_KEY", "").strip()

print("=" * 60)
print("API ENDPOINT TEST SUITE")
print("=" * 60)
print(f"\nAPI Key configured: {bool(key)}")
print(f"Key format: {key[:20]}...{key[-5:]}" if key else "NO KEY")

# Test 1: Status
print("\n[1/4] Testing /api/ai/status...")
try:
    r = httpx.get(f"{BASE}/api/ai/status", timeout=10)
    if r.status_code == 200:
        data = r.json()
        print(f"  ✓ Status: {data['live_ready']}")
        print(f"    Message: {data['message']}")
    else:
        print(f"  ✗ Error {r.status_code}: {r.text[:100]}")
except Exception as e:
    print(f"  ✗ Exception: {e}")

# Test 2: Chat
print("\n[2/4] Testing /api/ai/chat...")
try:
    payload = {"message": "Hallo, wer bist du?"}
    r = httpx.post(
        f"{BASE}/api/ai/chat",
        json=payload,
        timeout=35,
        follow_redirects=True
    )
    if r.status_code == 200:
        data = r.json()
        print(f"  ✓ Chat works")
        print(f"    Reply: {data['reply'][:100]}...")
    else:
        print(f"  ✗ Error {r.status_code}: {r.text[:200]}")
except Exception as e:
    print(f"  ✗ Exception: {str(e)[:100]}")

# Test 3: Insights
print("\n[3/4] Testing /api/ai/insights...")
try:
    r = httpx.get(f"{BASE}/api/ai/insights", timeout=35)
    if r.status_code == 200:
        data = r.json()
        print(f"  ✓ Insights work, count: {len(data['insights'])}")
    else:
        print(f"  ✗ Error {r.status_code}: {r.text[:200]}")
except Exception as e:
    print(f"  ✗ Exception: {str(e)[:100]}")

# Test 4: Recommendations
print("\n[4/4] Testing /api/ai/recommendations...")
try:
    r = httpx.get(f"{BASE}/api/ai/recommendations", timeout=35)
    if r.status_code == 200:
        data = r.json()
        print(f"  ✓ Recommendations work, count: {len(data['recommendations'])}")
    else:
        print(f"  ✗ Error {r.status_code}: {r.text[:200]}")
except Exception as e:
    print(f"  ✗ Exception: {str(e)[:100]}")

print("\n" + "=" * 60)
