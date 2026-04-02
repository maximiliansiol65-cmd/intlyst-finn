from fastapi import APIRouter

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("")
def list_schedules_stub():
    return {
        "items": [],
        "note": "Schedule-API Skeleton. Verwende /api/work-schedules und /api/time-blocks.",
    }
