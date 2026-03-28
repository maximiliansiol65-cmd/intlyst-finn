"""
Shopify Admin API Integration
OAuth Flow, automatischer Datenimport, Webhooks
Abandoned Checkouts, Produkt-Performance, Echtzeit-Sync
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Query, BackgroundTasks
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Date, Text, JSON
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date, timedelta
import httpx, os, json, hmac, hashlib, asyncio, logging
from database import get_db, engine, Base

router = APIRouter(prefix="/api/shopify", tags=["shopify"])
logger = logging.getLogger("intlyst.shopify")

SHOPIFY_API_VERSION = "2024-01"
SHOPIFY_API_KEY     = os.getenv("SHOPIFY_API_KEY", "")
SHOPIFY_API_SECRET  = os.getenv("SHOPIFY_API_SECRET", "")
APP_URL             = os.getenv("APP_URL", "http://localhost:8000")
FRONTEND_URL        = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ... ganzer Code wie bereitgestellt ...
