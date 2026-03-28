import os
import httpx

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

async def google_maps_geocode(address: str) -> dict:
    if not GOOGLE_MAPS_API_KEY:
        return {"error": "API Key fehlt"}
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={address}&key={GOOGLE_MAPS_API_KEY}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        return resp.json()
