"""
Google Analytics 4 — Automatischer täglicher Import
Echte Traffic-Daten direkt in die DB
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta
from typing import Any, Optional, cast

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Date, Integer, String
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import get_db
from models.base import Base
from models.daily_metrics import DailyMetrics

router = APIRouter(prefix="/api/ga4", tags=["ga4"])
logger = logging.getLogger("intlyst.ga4")

GA4_BASE = "https://analyticsdata.googleapis.com/v1beta"


# ── Models ───────────────────────────────────────────────────────────────────

class GA4ImportLog(Base):
    __tablename__ = "ga4_import_logs"

    id            = Column(Integer, primary_key=True)
    workspace_id  = Column(Integer, nullable=False, default=1, index=True)
    import_date   = Column(Date, nullable=False)
    status        = Column(String, nullable=False)   # success | failed | partial
    rows_imported = Column(Integer, default=0)
    rows_updated  = Column(Integer, default=0)
    error_message = Column(String, nullable=True)
    duration_ms   = Column(Integer, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)


class GA4Config(Base):
    __tablename__ = "ga4_config"

    id            = Column(Integer, primary_key=True)
    workspace_id  = Column(Integer, nullable=False, default=1, index=True)
    property_id   = Column(String, nullable=False)
    auto_import   = Column(Boolean, default=True)
    import_hour   = Column(Integer, default=6)       # 06:00 täglich
    lookback_days = Column(Integer, default=1)
    last_import   = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)


# ── Schemas ──────────────────────────────────────────────────────────────────

class GA4ImportResponse(BaseModel):
    success:       bool
    days_imported: int
    rows_imported: int
    rows_updated:  int
    date_range:    str
    duration_ms:   int
    errors:        list[str]


class GA4StatusResponse(BaseModel):
    configured:    bool
    property_id:   Optional[str]
    last_import:   Optional[str]
    auto_import:   bool
    import_hour:   int
    total_imports: int
    last_status:   Optional[str]


class ConfigureRequest(BaseModel):
    property_id:   str
    auto_import:   bool = True
    import_hour:   int  = 6
    lookback_days: int  = 1


# ── Google Auth Token ─────────────────────────────────────────────────────────

async def get_access_token() -> str:
    """Holt Access Token via Service Account JSON oder direktem Token (für Tests)."""
    service_account_json = os.getenv("GA4_SERVICE_ACCOUNT_JSON", "")
    if service_account_json:
        try:
            import google.auth.transport.requests
            from google.oauth2 import service_account

            creds = service_account.Credentials.from_service_account_info(
                json.loads(service_account_json),
                scopes=["https://www.googleapis.com/auth/analytics.readonly"],
            )
            creds.refresh(google.auth.transport.requests.Request())
            return creds.token
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="google-auth fehlt. Installiere: pip install google-auth google-auth-httplib2",
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Service Account Fehler: {exc}")

    token = os.getenv("GA4_ACCESS_TOKEN", "")
    if token:
        return token

    raise HTTPException(
        status_code=400,
        detail=(
            "GA4 nicht konfiguriert. Setze in .env:\n"
            "  GA4_SERVICE_ACCOUNT_JSON = {...Service Account JSON...}\n"
            "  GA4_ACCESS_TOKEN = ya29.xxx  (kurzlebig, nur für Tests)"
        ),
    )


# ── GA4 Data API ──────────────────────────────────────────────────────────────

async def fetch_ga4_report(
    property_id: str,
    start_date: str,
    end_date: str,
    token: str,
) -> list[dict]:
    """Ruft GA4 Data API ab und gibt tageweise Metriken zurück."""
    url = f"{GA4_BASE}/properties/{property_id}:runReport"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "dateRanges": [{"startDate": start_date, "endDate": end_date}],
        "dimensions": [{"name": "date"}],
        "metrics": [
            {"name": "sessions"},
            {"name": "totalUsers"},
            {"name": "newUsers"},
            {"name": "screenPageViews"},
            {"name": "bounceRate"},
            {"name": "averageSessionDuration"},
            {"name": "conversions"},
            {"name": "sessionConversionRate"},
            {"name": "purchaseRevenue"},
        ],
        "orderBys": [{"dimension": {"dimensionName": "date"}}],
        "limit": 365,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(url, headers=headers, json=payload)

    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="GA4 Token ungültig oder abgelaufen.")
    if res.status_code == 403:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf GA4 Property — Property ID prüfen.")
    if res.status_code == 404:
        raise HTTPException(status_code=404, detail=f"GA4 Property {property_id} nicht gefunden.")
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GA4 API Fehler: {res.text[:200]}")

    rows: list[dict] = []
    for row in res.json().get("rows", []):
        dims    = row.get("dimensionValues", [])
        metrics = row.get("metricValues", [])
        if not dims:
            continue
        date_str = dims[0].get("value", "")
        if len(date_str) != 8:
            continue
        parsed = date(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))

        def _f(i: int, default: float = 0.0) -> float:
            try:
                return float(metrics[i].get("value", default))
            except Exception:
                return default

        def _i(i: int, default: int = 0) -> int:
            try:
                return int(float(metrics[i].get("value", default)))
            except Exception:
                return default

        rows.append({
            "date":                 parsed,
            "sessions":             _i(0),
            "users":                _i(1),
            "new_users":            _i(2),
            "pageviews":            _i(3),
            "bounce_rate":          round(_f(4) * 100, 2),
            "avg_session_duration": round(_f(5), 1),
            "conversions":          _i(6),
            "conversion_rate":      round(_f(7) * 100, 4),
            "revenue":              round(_f(8), 2),
        })

    return rows


async def fetch_ga4_realtime(property_id: str, token: str) -> dict:
    """Echtzeit-Daten — aktive Nutzer gerade jetzt."""
    url = f"{GA4_BASE}/properties/{property_id}:runRealtimeReport"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {
        "metrics":    [{"name": "activeUsers"}, {"name": "screenPageViews"}],
        "dimensions": [{"name": "country"}],
        "limit": 10,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(url, headers=headers, json=payload)

    if res.status_code != 200:
        return {"active_users": 0, "pageviews_last_30min": 0, "top_countries": []}

    rows = res.json().get("rows", [])
    return {
        "active_users":         sum(int(r["metricValues"][0]["value"]) for r in rows if r.get("metricValues")),
        "pageviews_last_30min": sum(int(r["metricValues"][1]["value"]) for r in rows if len(r.get("metricValues", [])) > 1),
        "top_countries": [
            {"country": r["dimensionValues"][0]["value"], "users": int(r["metricValues"][0]["value"])}
            for r in rows[:5]
        ],
    }


# ── Import Logik ──────────────────────────────────────────────────────────────

async def import_ga4_data(
    property_id: str,
    start_date: date,
    end_date: date,
    workspace_id: int,
    db: Session,
) -> GA4ImportResponse:
    """
    Importiert GA4-Daten und merged sie workspace-scoped mit DailyMetrics.
    Traffic-Daten kommen aus GA4; Umsatz aus Stripe/CSV hat Vorrang.
    """
    start_time = datetime.utcnow()
    errors: list[str] = []
    imported = 0
    updated  = 0
    rows: list[dict] = []

    try:
        token = await get_access_token()
        rows  = await fetch_ga4_report(
            property_id=property_id,
            start_date=start_date.strftime("%Y-%m-%d"),
            end_date=end_date.strftime("%Y-%m-%d"),
            token=token,
        )

        for row in rows:
            try:
                existing = (
                    db.query(DailyMetrics)
                    .filter(
                        DailyMetrics.workspace_id == workspace_id,
                        DailyMetrics.date == row["date"],
                        DailyMetrics.period == "daily",
                    )
                    .execution_options(skip_workspace_scope=True)
                    .first()
                )

                ga4_conv_rate = row["conversion_rate"] / 100.0 if row["conversion_rate"] else 0.0

                if existing:
                    # Traffic-Daten aus GA4 übernehmen, Umsatz aus Stripe/CSV behalten
                    existing.traffic       = row["sessions"]
                    existing.new_customers = max(int(getattr(existing, "new_customers", 0) or 0), row["new_users"])
                    if not getattr(existing, "conversion_rate", 0) and ga4_conv_rate:
                        existing.conversion_rate = ga4_conv_rate
                    if row["conversions"] > 0:
                        existing.conversions = row["conversions"]
                    # GA4 Revenue nur als Fallback wenn keine eigenen Daten vorhanden
                    if not getattr(existing, "revenue", 0) and row["revenue"] > 0:
                        existing.revenue = row["revenue"]
                    updated += 1
                else:
                    db.add(DailyMetrics(
                        workspace_id=workspace_id,
                        date=row["date"],
                        period="daily",
                        revenue=row["revenue"],
                        traffic=row["sessions"],
                        conversions=row["conversions"],
                        conversion_rate=ga4_conv_rate,
                        new_customers=row["new_users"],
                    ))
                    imported += 1

            except Exception as exc:
                errors.append(f"{row['date']}: {exc}")

        db.commit()

    except HTTPException as exc:
        errors.append(exc.detail)
        db.rollback()
    except Exception as exc:
        errors.append(f"Import Fehler: {exc}")
        db.rollback()

    duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
    status = "success" if not errors else ("partial" if imported + updated > 0 else "failed")

    db.add(GA4ImportLog(
        workspace_id=workspace_id,
        import_date=date.today(),
        status=status,
        rows_imported=imported,
        rows_updated=updated,
        error_message="; ".join(errors[:3]) if errors else None,
        duration_ms=duration_ms,
    ))
    config = (
        db.query(GA4Config)
        .filter(GA4Config.workspace_id == workspace_id)
        .first()
    )
    if config:
        cast(Any, config).last_import = datetime.utcnow()
    db.commit()

    return GA4ImportResponse(
        success=not errors,
        days_imported=len(rows),
        rows_imported=imported,
        rows_updated=updated,
        date_range=f"{start_date} bis {end_date}",
        duration_ms=duration_ms,
        errors=errors,
    )


# ── APScheduler-kompatibler Daily Import ──────────────────────────────────────

async def scheduled_ga4_import() -> None:
    """Läuft täglich via APScheduler — importiert für alle Workspaces mit auto_import=True."""
    from database import SessionLocal  # lokaler Import vermeidet zirkuläre Abhängigkeit

    db = SessionLocal()
    try:
        configs = db.query(GA4Config).filter(GA4Config.auto_import == True).all()  # noqa: E712
        for config in configs:
            ws_id = int(getattr(config, "workspace_id", 1))

            # Überspringe wenn heute schon erfolgreich importiert
            already = (
                db.query(GA4ImportLog)
                .filter(
                    GA4ImportLog.workspace_id == ws_id,
                    GA4ImportLog.import_date == date.today(),
                    GA4ImportLog.status == "success",
                )
                .first()
            )
            if already:
                continue

            yesterday = date.today() - timedelta(days=1)
            lookback  = date.today() - timedelta(days=int(getattr(config, "lookback_days", 1)))

            try:
                result = await import_ga4_data(
                    property_id=str(getattr(config, "property_id", "")),
                    start_date=lookback,
                    end_date=yesterday,
                    workspace_id=ws_id,
                    db=db,
                )
                logger.info(
                    "GA4 Import Workspace %s: %d neu, %d aktualisiert",
                    ws_id, result.rows_imported, result.rows_updated,
                )
            except Exception as exc:
                logger.error("GA4 Import Workspace %s fehlgeschlagen: %s", ws_id, exc)

    except Exception as exc:
        logger.error("GA4 Scheduler Fehler: %s", exc)
    finally:
        db.close()


# ── Endpunkte ─────────────────────────────────────────────────────────────────

@router.post("/configure")
def configure_ga4(
    body: ConfigureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """GA4 Property konfigurieren — Property ID + Auto-Import Einstellungen."""
    config = db.query(GA4Config).filter(GA4Config.workspace_id == workspace_id).first()
    if config:
        c = cast(Any, config)
        c.property_id   = body.property_id
        c.auto_import   = body.auto_import
        c.import_hour   = body.import_hour
        c.lookback_days = body.lookback_days
    else:
        db.add(GA4Config(
            workspace_id=workspace_id,
            property_id=body.property_id,
            auto_import=body.auto_import,
            import_hour=body.import_hour,
            lookback_days=body.lookback_days,
        ))
    db.commit()
    return {
        "message":     f"GA4 konfiguriert: Property {body.property_id}",
        "auto_import": body.auto_import,
        "import_hour": f"Täglich um {body.import_hour:02d}:00 Uhr",
    }


@router.get("/status", response_model=GA4StatusResponse)
def get_ga4_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Aktueller GA4 Status und Import-Statistik."""
    config   = db.query(GA4Config).filter(GA4Config.workspace_id == workspace_id).first()
    total    = db.query(GA4ImportLog).filter(GA4ImportLog.workspace_id == workspace_id).count()
    last_log = (
        db.query(GA4ImportLog)
        .filter(GA4ImportLog.workspace_id == workspace_id)
        .order_by(GA4ImportLog.created_at.desc())
        .first()
    )
    env_ok = bool(os.getenv("GA4_SERVICE_ACCOUNT_JSON") or os.getenv("GA4_ACCESS_TOKEN"))
    return GA4StatusResponse(
        configured=bool(config) and env_ok,
        property_id=str(getattr(config, "property_id", "")) if config else None,
        last_import=str(getattr(config, "last_import", "")) if config and getattr(config, "last_import", None) else None,
        auto_import=bool(getattr(config, "auto_import", False)) if config else False,
        import_hour=int(getattr(config, "import_hour", 6)) if config else 6,
        total_imports=total,
        last_status=str(getattr(last_log, "status", "")) if last_log else None,
    )


@router.post("/import", response_model=GA4ImportResponse)
async def manual_import(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Manueller Import der letzten X Tage (max 365)."""
    config = db.query(GA4Config).filter(GA4Config.workspace_id == workspace_id).first()
    if not config:
        raise HTTPException(status_code=400, detail="GA4 nicht konfiguriert. POST /api/ga4/configure aufrufen.")

    end_date   = date.today() - timedelta(days=1)
    start_date = date.today() - timedelta(days=max(1, min(days, 365)))
    return await import_ga4_data(
        property_id=str(getattr(config, "property_id", "")),
        start_date=start_date,
        end_date=end_date,
        workspace_id=workspace_id,
        db=db,
    )


@router.post("/import/range", response_model=GA4ImportResponse)
async def import_range(
    start: str,
    end: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Import für einen spezifischen Zeitraum — für historische Daten."""
    config = db.query(GA4Config).filter(GA4Config.workspace_id == workspace_id).first()
    if not config:
        raise HTTPException(status_code=400, detail="GA4 nicht konfiguriert.")

    try:
        start_date = date.fromisoformat(start)
        end_date   = date.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Datum muss im Format YYYY-MM-DD sein.")

    if end_date > date.today():
        raise HTTPException(status_code=400, detail="Enddatum darf nicht in der Zukunft liegen.")
    if (end_date - start_date).days > 365:
        raise HTTPException(status_code=400, detail="Maximal 365 Tage pro Import.")
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="Startdatum muss vor Enddatum liegen.")

    return await import_ga4_data(
        property_id=str(getattr(config, "property_id", "")),
        start_date=start_date,
        end_date=end_date,
        workspace_id=workspace_id,
        db=db,
    )


@router.get("/realtime")
async def get_realtime(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Echtzeit-Daten — aktive Nutzer jetzt gerade."""
    config = db.query(GA4Config).filter(GA4Config.workspace_id == workspace_id).first()
    if not config:
        raise HTTPException(status_code=400, detail="GA4 nicht konfiguriert.")

    token = await get_access_token()
    return await fetch_ga4_realtime(str(getattr(config, "property_id", "")), token)


@router.get("/history")
def get_import_history(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Import-Protokoll der letzten X Imports dieses Workspaces."""
    logs = (
        db.query(GA4ImportLog)
        .filter(GA4ImportLog.workspace_id == workspace_id)
        .order_by(GA4ImportLog.created_at.desc())
        .limit(min(limit, 100))
        .all()
    )
    return {
        "imports": [
            {
                "date":          str(log.import_date),
                "status":        log.status,
                "rows_imported": log.rows_imported,
                "rows_updated":  log.rows_updated,
                "duration_ms":   log.duration_ms,
                "error":         log.error_message,
                "created_at":    str(log.created_at),
            }
            for log in logs
        ]
    }


@router.post("/test-connection")
async def test_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Testet ob GA4 Verbindung funktioniert — ruft 3 Testtage ab."""
    config = db.query(GA4Config).filter(GA4Config.workspace_id == workspace_id).first()
    if not config:
        return {"success": False, "error": "GA4 nicht konfiguriert.", "step": "configure"}

    try:
        token = await get_access_token()
        rows  = await fetch_ga4_report(
            property_id=str(getattr(config, "property_id", "")),
            start_date=(date.today() - timedelta(days=3)).strftime("%Y-%m-%d"),
            end_date=date.today().strftime("%Y-%m-%d"),
            token=token,
        )
        return {
            "success":     True,
            "property_id": getattr(config, "property_id", ""),
            "test_rows":   len(rows),
            "message":     f"Verbindung OK — {len(rows)} Tage gefunden",
        }
    except HTTPException as exc:
        return {"success": False, "error": exc.detail}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


@router.delete("/reset")
def reset_ga4(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Löscht GA4 Konfiguration und Import-Logs für diesen Workspace."""
    db.query(GA4Config).filter(GA4Config.workspace_id == workspace_id).delete()
    db.query(GA4ImportLog).filter(GA4ImportLog.workspace_id == workspace_id).delete()
    db.commit()
    return {"message": "GA4 Konfiguration zurückgesetzt."}
