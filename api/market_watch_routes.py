from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user
from database import get_db
from services.market_watch_service import build_market_watch

router = APIRouter(prefix="/api/market-watch", tags=["market"])


@router.get("")
def get_market_watch(
    industry: str = Query(default="ecommerce", description="Branche, z.B. ecommerce/saas/retail"),
    competitors: Optional[str] = Query(default=None, description="Kommagetrennte Wettbewerber"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user
    competitor_list = [c.strip() for c in competitors.split(",")] if competitors else None
    return build_market_watch(db, industry=industry, competitors=competitor_list)
