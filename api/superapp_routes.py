from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, Dict
from api.auth_routes import get_current_user, User
from services.claude_superapp import run_claude_superapp

router = APIRouter(prefix="/api/superapp", tags=["superapp"])

class SuperAppRequest(BaseModel):
    input_data: Dict[str, Any]
    api_key: str = None  # Optional, falls User eigenen Schlüssel nutzen will

@router.post("/run", summary="Starte die intelligente Business-Steuerung mit Claude")
async def run_superapp(
    body: SuperAppRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        result = await run_claude_superapp(body.input_data, api_key=body.api_key)
        return {"results": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
