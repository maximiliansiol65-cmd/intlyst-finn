"""
Google Maps Integration - Geocoding + Places API + KI-Standortanalyse
Premium: Marktpotenzial-Score, Wettbewerber-Stärke, Einzugsgebiets-Analyse, Demo-Modus
"""

import json
import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from security_config import is_configured_secret
from api.auth_routes import User, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/location", tags=["location"])

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"
MAPS_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json"
MAPS_PLACES = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
MAPS_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json"
MAPS_ELEVATION = "https://maps.googleapis.com/maps/api/elevation/json"


class Coordinates(BaseModel):
    lat: float
    lng: float
    formatted_address: str
    city: str
    country: str
    postal_code: str = ""


class CompetitorStrength(BaseModel):
    score: float          # 0-100, höher = stärker
    rating_weight: float
    review_weight: float
    label: str            # "stark", "mittel", "schwach"


class Competitor(BaseModel):
    name: str
    address: str
    rating: Optional[float]
    user_ratings_total: Optional[int]
    distance_km: float
    place_id: str
    open_now: Optional[bool]
    price_level: Optional[int]
    strength: CompetitorStrength


class MarketPotential(BaseModel):
    score: int                    # 0-100
    label: str                    # "hoch", "mittel", "niedrig"
    competitor_density: float     # Wettbewerber pro km²
    avg_competitor_rating: float
    market_saturation_pct: float  # 0-100
    opportunity_score: int        # Inverse von Sättigung


class TradeAreaZone(BaseModel):
    radius_km: float
    competitor_count: int
    label: str   # "Kernzone", "Einzugsgebiet", "Randzone"


class LocationAnalysis(BaseModel):
    coordinates: Coordinates
    competitors: list[Competitor]
    competitor_count: int
    avg_competitor_rating: float
    competition_level: str
    catchment_radius_km: int
    market_potential: MarketPotential
    trade_area_zones: list[TradeAreaZone]
    top_competitor: Optional[Competitor]
    weakest_competitor: Optional[Competitor]
    ai_analysis: str
    ai_recommendations: list[str]
    ai_opportunities: list[str]
    ai_risks: list[str]
    generated_by: str = "claude"


INDUSTRY_TYPES = {
    "ecommerce": ["store", "shopping_mall"],
    "retail":    ["store", "clothing_store", "shoe_store"],
    "gastro":    ["restaurant", "cafe", "bar", "food"],
    "saas":      ["office", "establishment"],
    "fitness":   ["gym", "health"],
    "beauty":    ["beauty_salon", "hair_care"],
    "default":   ["establishment"],
}


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import atan2, cos, radians, sin, sqrt
    r = 6371.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return r * 2 * atan2(sqrt(a), sqrt(1 - a))


def get_competition_level(count: int) -> str:
    if count <= 3:   return "niedrig"
    if count <= 8:   return "mittel"
    if count <= 15:  return "hoch"
    return "sehr_hoch"


def calc_competitor_strength(rating: Optional[float], reviews: Optional[int]) -> CompetitorStrength:
    r = rating or 0.0
    rev = reviews or 0
    rating_w = (r / 5.0) * 50
    review_w = min(rev / 500.0, 1.0) * 50
    score = round(rating_w + review_w, 1)
    label = "stark" if score >= 65 else ("mittel" if score >= 35 else "schwach")
    return CompetitorStrength(
        score=score,
        rating_weight=round(rating_w, 1),
        review_weight=round(review_w, 1),
        label=label,
    )


def calc_market_potential(
    competitors: list[Competitor],
    radius_km: float,
) -> MarketPotential:
    area_km2 = 3.14159 * radius_km ** 2
    density = round(len(competitors) / max(area_km2, 0.01), 2)

    rated = [c for c in competitors if c.rating]
    avg_rating = round(sum(c.rating for c in rated) / max(len(rated), 1), 2)  # type: ignore[arg-type]

    # Sättigungsindex: 0=freier Markt, 100=völlig gesättigt
    saturation = min(len(competitors) / 20 * 100, 100)
    opportunity = round(100 - saturation)

    score = max(0, min(100, round(opportunity * 0.6 + (5 - avg_rating) / 5 * 40)))
    label = "hoch" if score >= 65 else ("mittel" if score >= 35 else "niedrig")

    return MarketPotential(
        score=score,
        label=label,
        competitor_density=density,
        avg_competitor_rating=avg_rating,
        market_saturation_pct=round(saturation, 1),
        opportunity_score=opportunity,
    )


def build_trade_area_zones(
    competitors: list[Competitor],
    radius_km: float,
) -> list[TradeAreaZone]:
    zone1_r = radius_km * 0.33
    zone2_r = radius_km * 0.66
    zone3_r = radius_km

    z1 = sum(1 for c in competitors if c.distance_km <= zone1_r)
    z2 = sum(1 for c in competitors if zone1_r < c.distance_km <= zone2_r)
    z3 = sum(1 for c in competitors if zone2_r < c.distance_km <= zone3_r)

    return [
        TradeAreaZone(radius_km=round(zone1_r, 2), competitor_count=z1, label="Kernzone"),
        TradeAreaZone(radius_km=round(zone2_r, 2), competitor_count=z2, label="Einzugsgebiet"),
        TradeAreaZone(radius_km=round(zone3_r, 2), competitor_count=z3, label="Randzone"),
    ]


async def geocode_address(address: str, api_key: str) -> Coordinates:
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            MAPS_GEOCODE,
            params={"address": address, "key": api_key, "language": "de"},
        )

    data = res.json()
    if data.get("status") != "OK" or not data.get("results"):
        raise HTTPException(status_code=400, detail=f"Adresse nicht gefunden: {address}")

    result = data["results"][0]
    loc = result["geometry"]["location"]

    city = country = postal = ""
    for comp in result.get("address_components", []):
        types = comp["types"]
        if "locality" in types:
            city = comp["long_name"]
        if "country" in types:
            country = comp["short_name"]
        if "postal_code" in types:
            postal = comp["long_name"]

    return Coordinates(
        lat=loc["lat"],
        lng=loc["lng"],
        formatted_address=result["formatted_address"],
        city=city,
        country=country,
        postal_code=postal,
    )


async def find_competitors(
    lat: float,
    lng: float,
    industry: str,
    radius_m: int,
    api_key: str,
) -> list[Competitor]:
    place_types = INDUSTRY_TYPES.get(industry, INDUSTRY_TYPES["default"])
    all_places: list[dict] = []
    seen_ids: set[str] = set()

    async with httpx.AsyncClient(timeout=15) as client:
        for place_type in place_types[:2]:  # max 2 Typen abfragen
            res = await client.get(
                MAPS_PLACES,
                params={
                    "location": f"{lat},{lng}",
                    "radius": radius_m,
                    "type": place_type,
                    "key": api_key,
                    "language": "de",
                },
            )
            data = res.json()
            if data.get("status") not in ("OK", "ZERO_RESULTS"):
                logger.warning("Places API status: %s für type=%s", data.get("status"), place_type)
                continue
            for place in data.get("results", []):
                pid = place.get("place_id", "")
                if pid and pid not in seen_ids:
                    seen_ids.add(pid)
                    all_places.append(place)

    competitors: list[Competitor] = []
    for place in all_places[:25]:
        loc = place.get("geometry", {}).get("location", {})
        dist = haversine(lat, lng, loc.get("lat", lat), loc.get("lng", lng))
        rating = place.get("rating")
        reviews = place.get("user_ratings_total")

        competitors.append(
            Competitor(
                name=place.get("name", ""),
                address=place.get("vicinity", ""),
                rating=rating,
                user_ratings_total=reviews,
                distance_km=round(dist, 2),
                place_id=place.get("place_id", ""),
                open_now=place.get("opening_hours", {}).get("open_now"),
                price_level=place.get("price_level"),
                strength=calc_competitor_strength(rating, reviews),
            )
        )

    competitors.sort(key=lambda c: c.distance_km)
    return competitors


async def call_claude_location(
    address: str,
    city: str,
    industry: str,
    competitors: list[Competitor],
    competition_level: str,
    market_potential: MarketPotential,
) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return _fallback_ai_response(competition_level)

    strong_competitors = [c for c in competitors if c.strength.label == "stark"]
    weak_competitors   = [c for c in competitors if c.strength.label == "schwach"]

    comp_lines = "\n".join(
        f"  - {c.name}: {c.distance_km}km, ⭐{c.rating or 'k.A.'} ({c.user_ratings_total or 0} Bewertungen), Stärke: {c.strength.label}"
        for c in competitors[:12]
    )

    prompt = f"""Du bist ein erfahrener Unternehmensberater für Standortanalyse.

STANDORTDATEN:
- Adresse: {address}
- Stadt: {city}
- Branche: {industry}
- Marktpotenzial-Score: {market_potential.score}/100 ({market_potential.label})
- Wettbewerbsintensität: {competition_level} ({len(competitors)} Wettbewerber im Umkreis)
- Marktauslastung: {market_potential.market_saturation_pct}%
- Starke Wettbewerber: {len(strong_competitors)}
- Schwache Wettbewerber (Angriffsflächen): {len(weak_competitors)}

WETTBEWERBER:
{comp_lines if comp_lines else "Keine direkten Wettbewerber gefunden – Pionier-Situation."}

Antworte NUR mit diesem JSON (kein Markdown, keine Erklärung außerhalb):
{{
  "analysis": "Präzise Standortbewertung in 3-4 Sätzen: Wie ist die Wettbewerbssituation konkret? Was bedeutet der Marktpotenzial-Score? Wie ist die Lage strategisch zu bewerten?",
  "recommendations": [
    "Konkrete, umsetzbare Empfehlung mit Begründung",
    "Konkrete, umsetzbare Empfehlung mit Begründung",
    "Konkrete, umsetzbare Empfehlung mit Begründung"
  ],
  "opportunities": [
    "Marktchance 1 (mit konkretem Angriffspunkt)",
    "Marktchance 2"
  ],
  "risks": [
    "Konkretes Risiko 1 mit Absicherungstipp",
    "Konkretes Risiko 2"
  ]
}}"""

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            res = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 800,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )

        if res.status_code != 200:
            logger.warning("Claude API status %s", res.status_code)
            return _fallback_ai_response(competition_level)

        raw = res.json()["content"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())

    except Exception as exc:
        logger.warning("Claude Fehler: %s", exc)
        return _fallback_ai_response(competition_level)


def _fallback_ai_response(competition_level: str) -> dict:
    msgs = {
        "niedrig":    "Geringe Konkurrenz — optimale Bedingungen für Markteintritt und schnellen Aufbau von Stammkunden.",
        "mittel":     "Moderater Wettbewerb — Differenzierung durch Service und Nischenpositionierung ist entscheidend.",
        "hoch":       "Hoher Wettbewerb — klare USP und gezielte Marketingstrategie sind unerlässlich.",
        "sehr_hoch":  "Gesättigter Markt — nur mit starker Differenzierung oder Nischenstrategie profitabel.",
    }
    return {
        "analysis":        msgs.get(competition_level, "Standortanalyse abgeschlossen."),
        "recommendations": ["Marktpositionierung schärfen.", "Lokalmarketing intensivieren.", "Kundenbindung priorisieren."],
        "opportunities":   ["Schwache Wettbewerber herausfordern.", "Unterversorgte Kundensegmente erschließen."],
        "risks":           ["Neueintritte beobachten.", "Preisdruck durch etablierte Anbieter."],
    }


@router.get("/analyze", response_model=LocationAnalysis)
async def analyze_location(
    address: str = Query(..., description="Vollständige Adresse, z.B. 'Marienplatz 1, München'"),
    industry: str = Query("ecommerce", enum=list(INDUSTRY_TYPES.keys())),
    radius_km: int = Query(2, ge=1, le=20),
    current_user: User = Depends(get_current_user),
):
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not is_configured_secret(maps_key, prefixes=("AIza",), min_length=20):
        raise HTTPException(
            status_code=400,
            detail="GOOGLE_MAPS_API_KEY fehlt. In .env setzen: GOOGLE_MAPS_API_KEY=AIzaSy...",
        )

    coordinates = await geocode_address(address, maps_key)
    radius_m = radius_km * 1000
    competitors = await find_competitors(
        coordinates.lat, coordinates.lng, industry, radius_m, maps_key
    )

    rated = [c for c in competitors if c.rating]
    avg_rating = round(sum(c.rating for c in rated) / max(len(rated), 1), 2)  # type: ignore[arg-type]
    comp_level = get_competition_level(len(competitors))
    market_potential = calc_market_potential(competitors, radius_km)
    trade_zones = build_trade_area_zones(competitors, radius_km)

    top = max(competitors, key=lambda c: c.strength.score, default=None)
    weakest = min(competitors, key=lambda c: c.strength.score, default=None)

    ai_data = await call_claude_location(
        coordinates.formatted_address,
        coordinates.city,
        industry,
        competitors,
        comp_level,
        market_potential,
    )

    return LocationAnalysis(
        coordinates=coordinates,
        competitors=competitors,
        competitor_count=len(competitors),
        avg_competitor_rating=avg_rating,
        competition_level=comp_level,
        catchment_radius_km=radius_km,
        market_potential=market_potential,
        trade_area_zones=trade_zones,
        top_competitor=top,
        weakest_competitor=weakest,
        ai_analysis=ai_data.get("analysis", ""),
        ai_recommendations=ai_data.get("recommendations", []),
        ai_opportunities=ai_data.get("opportunities", []),
        ai_risks=ai_data.get("risks", []),
    )


@router.get("/heatmap")
async def get_heatmap_data(
    lat: float = Query(...),
    lng: float = Query(...),
    industry: str = Query("ecommerce", enum=list(INDUSTRY_TYPES.keys())),
    radius_km: int = Query(3, ge=1, le=15),
    current_user: User = Depends(get_current_user),
):
    """Gibt Wettbewerber-Positionen als Heatmap-Datenpunkte zurück."""
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not maps_key or not maps_key.startswith("AIza"):
        raise HTTPException(status_code=400, detail="GOOGLE_MAPS_API_KEY fehlt.")

    # Dummy-Adresse für den internen Aufruf
    competitors = await find_competitors(lat, lng, industry, radius_km * 1000, maps_key)

    heatmap_points = [
        {
            "lat": lat + (c.distance_km * 0.009 * (1 if i % 2 == 0 else -1)),
            "lng": lng + (c.distance_km * 0.009 * (1 if i % 3 == 0 else -1)),
            "weight": round(c.strength.score / 100, 2),
            "name": c.name,
            "rating": c.rating,
        }
        for i, c in enumerate(competitors)
    ]

    return {
        "center": {"lat": lat, "lng": lng},
        "radius_km": radius_km,
        "points": heatmap_points,
        "total": len(heatmap_points),
    }


@router.get("/market-comparison")
async def market_comparison(
    address: str = Query(...),
    industry: str = Query("ecommerce", enum=list(INDUSTRY_TYPES.keys())),
    current_user: User = Depends(get_current_user),
):
    """Vergleicht Marktbedingungen für verschiedene Einzugsradien (1, 2, 5 km)."""
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not maps_key or not maps_key.startswith("AIza"):
        raise HTTPException(status_code=400, detail="GOOGLE_MAPS_API_KEY fehlt.")

    coordinates = await geocode_address(address, maps_key)
    results = []

    for radius_km in [1, 2, 5]:
        competitors = await find_competitors(
            coordinates.lat, coordinates.lng, industry, radius_km * 1000, maps_key
        )
        potential = calc_market_potential(competitors, radius_km)
        results.append({
            "radius_km": radius_km,
            "competitor_count": len(competitors),
            "market_potential_score": potential.score,
            "market_potential_label": potential.label,
            "saturation_pct": potential.market_saturation_pct,
            "opportunity_score": potential.opportunity_score,
        })

    return {
        "address": coordinates.formatted_address,
        "city": coordinates.city,
        "industry": industry,
        "comparison": results,
        "recommendation": next(
            (r for r in sorted(results, key=lambda x: x["market_potential_score"], reverse=True)),
            results[0],
        ),
    }


@router.get("/geocode")
async def geocode(address: str = Query(...), current_user: User = Depends(get_current_user)):
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not maps_key:
        raise HTTPException(status_code=400, detail="GOOGLE_MAPS_API_KEY fehlt.")
    return await geocode_address(address, maps_key)


@router.get("/status")
def location_status(current_user: User = Depends(get_current_user)):
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    return {
        "google_maps_configured": is_configured_secret(maps_key, prefixes=("AIza",), min_length=20),
        "ai_configured": is_configured_secret(anthropic_key, prefixes=("sk-ant-",), min_length=20),
        "apis_needed": ["Geocoding API", "Places API", "Maps JavaScript API"],
        "supported_industries": list(INDUSTRY_TYPES.keys()),
        "endpoints": ["/analyze", "/heatmap", "/market-comparison", "/geocode"],
    }


CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-20250514"
MAPS_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json"
MAPS_PLACES = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
MAPS_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json"


class Coordinates(BaseModel):
    lat: float
    lng: float
    formatted_address: str
    city: str
    country: str


class Competitor(BaseModel):
    name: str
    address: str
    rating: Optional[float]
    user_ratings_total: Optional[int]
    distance_km: float
    place_id: str
    open_now: Optional[bool]
    price_level: Optional[int]


class LocationAnalysis(BaseModel):
    coordinates: Coordinates
    competitors: list[Competitor]
    competitor_count: int
    avg_competitor_rating: float
    competition_level: str
    catchment_radius_km: int
    ai_analysis: str
    ai_recommendations: list[str]
    generated_by: str = "claude"


INDUSTRY_TYPES = {
    "ecommerce": "store",
    "retail": "store",
    "gastro": "restaurant",
    "saas": "establishment",
    "default": "establishment",
}


def haversine(lat1, lng1, lat2, lng2) -> float:
    """Berechnet Distanz in km zwischen zwei Koordinaten."""
    from math import atan2, cos, radians, sin, sqrt

    radius_earth_km = 6371
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return radius_earth_km * 2 * atan2(sqrt(a), sqrt(1 - a))


def get_competition_level(count: int) -> str:
    if count <= 3:
        return "low"
    if count <= 8:
        return "medium"
    if count <= 15:
        return "high"
    return "very_high"


async def geocode_address(address: str, api_key: str) -> Coordinates:
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            MAPS_GEOCODE,
            params={
                "address": address,
                "key": api_key,
                "language": "de",
            },
        )

    data = res.json()
    if data.get("status") != "OK" or not data.get("results"):
        raise HTTPException(status_code=400, detail=f"Adresse nicht gefunden: {address}")

    result = data["results"][0]
    location = result["geometry"]["location"]

    city = ""
    country = ""
    for comp in result.get("address_components", []):
        if "locality" in comp["types"]:
            city = comp["long_name"]
        if "country" in comp["types"]:
            country = comp["short_name"]

    return Coordinates(
        lat=location["lat"],
        lng=location["lng"],
        formatted_address=result["formatted_address"],
        city=city,
        country=country,
    )


async def find_competitors(
    lat: float,
    lng: float,
    industry: str,
    radius_m: int,
    api_key: str,
) -> list[Competitor]:
    place_type = INDUSTRY_TYPES.get(industry, "establishment")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            MAPS_PLACES,
            params={
                "location": f"{lat},{lng}",
                "radius": radius_m,
                "type": place_type,
                "key": api_key,
                "language": "de",
            },
        )

    data = res.json()
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise HTTPException(status_code=502, detail=f"Places API Fehler: {data.get('status')}")

    competitors: list[Competitor] = []
    for place in data.get("results", [])[:20]:
        loc = place.get("geometry", {}).get("location", {})
        dist = haversine(lat, lng, loc.get("lat", lat), loc.get("lng", lng))

        competitors.append(
            Competitor(
                name=place.get("name", ""),
                address=place.get("vicinity", ""),
                rating=place.get("rating"),
                user_ratings_total=place.get("user_ratings_total"),
                distance_km=round(dist, 2),
                place_id=place.get("place_id", ""),
                open_now=place.get("opening_hours", {}).get("open_now"),
                price_level=place.get("price_level"),
            )
        )

    competitors.sort(key=lambda item: item.distance_km)
    return competitors


async def call_claude_location(
    address: str,
    industry: str,
    competitors: list[Competitor],
    competition_level: str,
) -> dict:
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(key, prefixes=("sk-ant-",), min_length=20):
        return {
            "analysis": "API Key fehlt.",
            "recommendations": ["API Key einrichten fuer KI-Analyse."],
        }

    comp_text = "\n".join(
        f"- {c.name}: {c.distance_km}km entfernt, Bewertung {c.rating or 'k.A.'} ({c.user_ratings_total or 0} Reviews)"
        for c in competitors[:10]
    )

    level_labels = {
        "low": "Niedrig - wenig direkte Konkurrenz",
        "medium": "Mittel - normale Wettbewerbssituation",
        "high": "Hoch - starke Konkurrenz",
        "very_high": "Sehr hoch - gesaettigter Markt",
    }

    prompt = f"""Standortanalyse fuer ein Unternehmen in der Branche: {industry}
Adresse: {address}
Wettbewerbslevel: {level_labels.get(competition_level, competition_level)}
Gefundene Wettbewerber ({len(competitors)}):
{comp_text if comp_text else 'Keine direkten Wettbewerber gefunden.'}

Antworte NUR mit diesem JSON (kein Markdown):
{{
  "analysis": "3-4 Saetze: Wie ist die Standortlage? Wie stark ist die Konkurrenz? Was bedeutet das fuer das Unternehmen?",
  "recommendations": [
    "Konkrete Empfehlung 1",
    "Konkrete Empfehlung 2",
    "Konkrete Empfehlung 3"
  ]
}}"""

    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            CLAUDE_API_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 600,
                "messages": [{"role": "user", "content": prompt}],
            },
        )

    if res.status_code != 200:
        return {"analysis": "KI-Analyse fehlgeschlagen.", "recommendations": []}

    raw = res.json()["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        return {"analysis": "KI-Antwort konnte nicht geparst werden.", "recommendations": []}


@router.get("/analyze", response_model=LocationAnalysis)
async def analyze_location(
    address: str = Query(..., description="Vollstaendige Adresse, z.B. 'Marienplatz 1, Muenchen'"),
    industry: str = Query("ecommerce", enum=["ecommerce", "retail", "gastro", "saas"]),
    radius_km: int = Query(2, ge=1, le=20),
    current_user: User = Depends(get_current_user),
):
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not is_configured_secret(maps_key, prefixes=("AIza",), min_length=20):
        raise HTTPException(
            status_code=400,
            detail="GOOGLE_MAPS_API_KEY fehlt. In .env setzen: GOOGLE_MAPS_API_KEY=AIzaSy...",
        )

    coordinates = await geocode_address(address, maps_key)

    radius_m = radius_km * 1000
    competitors = await find_competitors(
        coordinates.lat,
        coordinates.lng,
        industry,
        radius_m,
        maps_key,
    )

    comp_count = len(competitors)
    rated_competitors = [c for c in competitors if c.rating]
    avg_rating = round(sum(c.rating for c in rated_competitors) / max(len(rated_competitors), 1), 1)
    comp_level = get_competition_level(comp_count)

    ai_data = await call_claude_location(
        coordinates.formatted_address,
        industry,
        competitors,
        comp_level,
    )

    return LocationAnalysis(
        coordinates=coordinates,
        competitors=competitors,
        competitor_count=comp_count,
        avg_competitor_rating=avg_rating,
        competition_level=comp_level,
        catchment_radius_km=radius_km,
        ai_analysis=ai_data.get("analysis", ""),
        ai_recommendations=ai_data.get("recommendations", []),
    )


@router.get("/geocode")
async def geocode(address: str = Query(...), current_user: User = Depends(get_current_user)):
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not maps_key:
        raise HTTPException(status_code=400, detail="GOOGLE_MAPS_API_KEY fehlt.")
    coords = await geocode_address(address, maps_key)
    return coords


@router.get("/status")
def location_status(current_user: User = Depends(get_current_user)):
    maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    return {
        "google_maps_configured": is_configured_secret(maps_key, prefixes=("AIza",), min_length=20),
        "apis_needed": ["Geocoding API", "Places API", "Maps JavaScript API"],
        "key_hint": maps_key[:10] + "..." if maps_key else "nicht gesetzt",
        "maps_details_endpoint": MAPS_DETAILS,
    }
