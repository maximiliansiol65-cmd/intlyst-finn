from fastapi import APIRouter

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
def audit_stub():
    return {
        "items": [],
        "note": "Audit-API Skeleton. Verwende /api/audit-logs fuer Logdaten.",
    }
