from fastapi import APIRouter, Query
from services.google_maps_service import google_maps_geocode

router = APIRouter(prefix="/api/maps", tags=["maps"])

@router.get("/geocode")
async def geocode(address: str = Query(..., description="Adresse zum Geocodieren")):
    result = await google_maps_geocode(address)
    return result
