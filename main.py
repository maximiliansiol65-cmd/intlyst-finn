import asyncio
import importlib
import logging
import os
import time
import traceback
import uuid
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import SessionLocal, init_db, reset_current_workspace_id, set_current_workspace_id
from models import Base
from models.error_trace import ErrorTrace
from security_config import get_runtime_secret_issues, is_configured_secret, is_production_environment
from services.error_trace_service import record_error_trace

RequestSizeMiddleware = None
SecurityMiddleware = None
backup_system = None
security_logger = logging.getLogger("security")

try:
    security_middleware_module = importlib.import_module("security.middleware")
    RequestSizeMiddleware = getattr(security_middleware_module, "RequestSizeMiddleware", None)
    SecurityMiddleware = getattr(security_middleware_module, "SecurityMiddleware", None)
except Exception:
    pass

try:
    backup_module = importlib.import_module("security.backup")
    backup_system = getattr(backup_module, "backup_system", None)
except Exception:
    pass

try:
    security_core_module = importlib.import_module("security.core")
    security_logger = getattr(security_core_module, "security_logger", security_logger)
except Exception:
    pass

# Rate Limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("main")
audit_logger = logging.getLogger("audit")

load_dotenv()

from routers import (
    timeseries, trends, actions, goals, anomalies,
    notifications, tasks, recommendations,
    dev_seed, kpi, alerts, ai, forecast, planning,
    digest, integrations, market, market_watch, location,
    customers, benchmark, billing,
    analytics_integrations, auth, team, intlyst, growth,
    reports, abtests, cohorts, funnels, custom_kpis, workspaces, ga4,
    events, briefing, instagram, proactive, shopify, stripe, scheduler,
    decision, action_requests, changes, learning, approval_policy,
    deep_analytics, personalization, companies, plans, suggestions,
    audit_logs, time_blocks, work_schedules, teams,
)

from api.auth_routes import get_current_user
from api.email_preferences_routes import router as email_prefs_router
from api.superapp_routes import router as superapp_router
from api.error_traces_routes import router as error_traces_router
from api.user_integrations_routes import router as user_integrations_router
from api.referral_routes import router as referral_router
from api.maps_routes import router as maps_router
from api.action_logs_routes import router as action_logs_router
from api.audit_routes import router as audit_router
from api.schedules_routes import router as schedules_router
from api.insights_routes import router as insights_router
from api.forecast_records_routes import router as forecast_records_router
from api.scenarios_routes import router as scenarios_router
from api.ai_team_routes import router as ai_team_router
from api.activity_logs_di_routes import router as activity_logs_di_router
from api.mfa_routes import router as mfa_router
from api.metrics_routes import router as metrics_router
from api.drilldown_routes import router as drilldown_router
from api.backup_routes import router as backup_router
from api.export_routes import router as export_router

# Automatisierungs-API einbinden
from fastapi import Request, Depends
from api.automation_routes import router as automation_router
from models.user_settings import UserSettings
from services.kpi_provider import KPIProvider
from services.project_status_provider import ProjectStatusProvider
from services.external_data_provider import ExternalDataProvider
from database import SessionLocal

# ── APScheduler ───────────────────────────────────────────────────────────────
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.schedulers.base import STATE_RUNNING
from services.report_service import scheduled_daily_report, scheduled_weekly_report
from api.ga4_routes import scheduled_ga4_import
from services.notification_service import (
    send_weekly_report_emails,
    check_and_send_critical_alerts,
    check_and_send_goal_achievements,
    check_and_send_sync_failures,
)
from services.strategy_cycle_service import run_background_strategy_cycle_job
from services.self_learning_service import run_learning_cycle
from services.kpi_monitor_service import run_kpi_monitor_all_workspaces

_scheduler = AsyncIOScheduler(timezone="Europe/Berlin")

# ── CORS ──────────────────────────────────────────────────────────────────────
_allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "")
if _allowed_origins_raw:
    _allowed_origins = [o.strip() for o in _allowed_origins_raw.split(",") if o.strip()]
else:
    # Fallback nur fuer lokale Entwicklung – in Produktion ALLOWED_ORIGINS setzen!
    _allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app = FastAPI(
    title="Intlyst Business API",
    version="0.28.0",
    docs_url="/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url=None,
    openapi_url=None if is_production_environment() else "/openapi.json",
)

# Rate Limiting State
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

if RequestSizeMiddleware:
    app.add_middleware(RequestSizeMiddleware)
if SecurityMiddleware:
    app.add_middleware(SecurityMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Workspace-ID", "X-Workspace-Slug"],
    expose_headers=["X-Request-ID", "X-Response-Time"],
)


def _host_to_workspace_slug(host: str) -> Optional[str]:
    host_no_port = host.split(":")[0].strip().lower()
    if not host_no_port or host_no_port in ("localhost", "127.0.0.1"):
        return None
    parts = host_no_port.split(".")
    if len(parts) < 3:
        return None
    candidate = parts[0]
    if candidate in ("www", "api"):
        return None
    return candidate


@app.middleware("http")
async def workspace_context_middleware(request: Request, call_next):
    header_workspace_id = request.headers.get("x-workspace-id", "").strip()
    header_workspace_slug = request.headers.get("x-workspace-slug", "").strip().lower()
    host_slug = _host_to_workspace_slug(request.headers.get("host", ""))

    try:
        request.state.workspace_id = int(header_workspace_id) if header_workspace_id else None
    except ValueError:
        request.state.workspace_id = None
    request.state.workspace_slug = header_workspace_slug or host_slug

    token = set_current_workspace_id(request.state.workspace_id)
    try:
        response = await call_next(request)
    finally:
        reset_current_workspace_id(token)

    return response


# ── Security Headers Middleware ───────────────────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if is_production_environment():
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response


# ── Request ID + Timing + Audit Logging ──────────────────────────────────────
@app.middleware("http")
async def request_id_and_timing(request: Request, call_next):
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{duration_ms}ms"

    # Sicherheits-relevante Ereignisse extra loggen
    status = response.status_code
    if status in (401, 403, 429):
        audit_logger.warning(
            "SECURITY %s %s → %s [%sms] ip=%s id=%s",
            request.method, request.url.path, status, duration_ms,
            request.client.host if request.client else "unknown", request_id,
        )
    else:
        logger.info(
            "%s %s → %s [%sms] id=%s",
            request.method, request.url.path, status, duration_ms, request_id,
        )
    return response


def _persist_trace(
    request: Request,
    exc: Exception,
    status_code: int,
    extra_context: Optional[dict] = None,
) -> Optional[int]:
    db = SessionLocal()
    try:
        context = {
            "client": request.client.host if request.client else None,
            "query_params": dict(request.query_params),
            "workspace_slug": getattr(request.state, "workspace_slug", None),
        }
        if extra_context:
            context.update(extra_context)
        row = record_error_trace(
            db,
            error=exc,
            traceback_text=traceback.format_exc(),
            request_id=getattr(request.state, "request_id", None),
            method=request.method,
            path=request.url.path,
            workspace_id=getattr(request.state, "workspace_id", None),
            status_code=status_code,
            context=context,
        )
        row_id = getattr(row, "id", None)
        return int(row_id) if isinstance(row_id, int) else None
    except Exception as trace_exc:
        logger.error("ERROR_TRACE_PERSIST_FAILED %s", trace_exc, exc_info=True)
        return None
    finally:
        db.close()


def _run_scheduled_learning_cycle():
    """Wrapper, der eine eigene DB-Session für den Lernjob öffnet."""
    db = SessionLocal()
    try:
        from models.user import Workspace

        workspace_ids = [row[0] for row in db.query(Workspace.id).all()] or [1]
        for wid in workspace_ids:
            token = set_current_workspace_id(wid)
            try:
                run_learning_cycle(db, workspace_id=wid)
            finally:
                reset_current_workspace_id(token)
    finally:
        db.close()


def _run_scheduled_kpi_monitor():
    """Wrapper mit eigener DB-Session fuer den KPI-Monitor."""
    db = SessionLocal()
    try:
        run_kpi_monitor_all_workspaces(db)
    finally:
        db.close()


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Pydantic may attach Exception objects into `ctx`, which breaks JSON serialization.
    # If we don't sanitize here, a normal 422 can turn into a 500.
    def _sanitize_validation_errors(errors):
        sanitized = []
        for err in errors:
            if not isinstance(err, dict):
                sanitized.append(str(err))
                continue
            item = dict(err)
            ctx = item.get("ctx")
            if isinstance(ctx, dict):
                safe_ctx = {}
                for k, v in ctx.items():
                    if isinstance(v, (str, int, float, bool)) or v is None:
                        safe_ctx[k] = v
                    else:
                        safe_ctx[k] = str(v)
                item["ctx"] = safe_ctx
            sanitized.append(item)
        return sanitized

    sanitized_errors = _sanitize_validation_errors(exc.errors())
    error_id = _persist_trace(
        request,
        exc,
        422,
        extra_context={"validation_errors": sanitized_errors},
    )
    logger.warning(
        "VALIDATION_ERROR %s %s id=%s error_trace_id=%s",
        request.method,
        request.url.path,
        getattr(request.state, "request_id", None),
        error_id,
    )
    return JSONResponse(
        status_code=422,
        content={
            "detail": sanitized_errors,
            "request_id": getattr(request.state, "request_id", None),
            "error_trace_id": error_id,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error(
        "UNHANDLED_EXCEPTION %s %s id=%s\n%s",
        request.method,
        request.url.path,
        getattr(request.state, "request_id", None),
        tb,
    )
    error_id = _persist_trace(request, exc, 500, extra_context={"traceback_captured": True})
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Interner Backend-Fehler. Bitte Request-ID und Error-Trace prüfen.",
            "request_id": getattr(request.state, "request_id", None),
            "error_trace_id": error_id,
        },
    )


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    issues = get_runtime_secret_issues()
    if issues and is_production_environment():
        raise RuntimeError("Unsichere Produktionskonfiguration: " + " | ".join(issues))
    for issue in issues:
        logger.warning("Sicherheitswarnung: %s", issue)
    init_db()

    # Automatische Berichte planen: täglich 07:00, wöchentlich Mo 07:05
    _scheduler.add_job(
        scheduled_daily_report,
        "cron",
        hour=7,
        minute=0,
        id="auto_daily",
        replace_existing=True,
    )
    _scheduler.add_job(
        scheduled_weekly_report,
        "cron",
        day_of_week="mon",
        hour=7,
        minute=5,
        id="auto_weekly",
        replace_existing=True,
    )
    # GA4 Auto-Import: täglich 06:30 für alle konfigurierten Workspaces
    _scheduler.add_job(
        scheduled_ga4_import,
        "cron",
        hour=6,
        minute=30,
        id="auto_ga4_import",
        replace_existing=True,
    )
    # E-Mail Benachrichtigungen
    _scheduler.add_job(
        check_and_send_critical_alerts,
        "cron", hour=7, minute=0,
        id="notif_alerts", replace_existing=True,
    )
    _scheduler.add_job(
        check_and_send_sync_failures,
        "cron", hour=7, minute=30,
        id="notif_sync", replace_existing=True,
    )
    _scheduler.add_job(
        check_and_send_goal_achievements,
        "cron", hour=8, minute=0,
        id="notif_goals", replace_existing=True,
    )
    _scheduler.add_job(
        send_weekly_report_emails,
        "cron", day_of_week="mon", hour=8, minute=0,
        id="notif_weekly", replace_existing=True,
    )
    _scheduler.add_job(
        _run_scheduled_learning_cycle,
        "interval",
        hours=1,
        id="auto_learning_cycle",
        replace_existing=True,
    )
    _scheduler.add_job(
        run_background_strategy_cycle_job,
        "interval",
        minutes=30,
        id="auto_strategy_cycle",
        replace_existing=True,
    )
    _scheduler.add_job(
        _run_scheduled_kpi_monitor,
        "cron",
        hour=7,
        minute=10,
        id="kpi_monitor_revenue_drop",
        replace_existing=True,
    )
    if _scheduler.state != STATE_RUNNING:
        _scheduler.start()
    security_logger.info("Intlyst v0.28 gestartet")
    logger.info("Business Analyse API gestartet | CORS: %s | Scheduler: aktiv", _allowed_origins)

    if backup_system and backup_system.should_auto_backup():
        backup_system.create("daily", "startup", "Startup-Backup")


@app.on_event("shutdown")
async def shutdown():
    if _scheduler.state == STATE_RUNNING:
        _scheduler.shutdown(wait=False)
    logger.info("Scheduler gestoppt.")
    if backup_system:
        backup_system.create("manual", "shutdown", "Shutdown-Backup")


# ── Router einbinden ──────────────────────────────────────────────────────────
app.include_router(timeseries.router)
app.include_router(trends.router)
app.include_router(actions.router)
app.include_router(planning.router)
app.include_router(proactive.router)
app.include_router(action_requests.router)
app.include_router(approval_policy.router)
app.include_router(goals.router)
app.include_router(anomalies.router)
app.include_router(notifications.router)
app.include_router(tasks.router)
app.include_router(recommendations.router)
app.include_router(personalization.router)
app.include_router(action_logs_router)
app.include_router(dev_seed.router)
app.include_router(kpi.router)
app.include_router(alerts.router)
app.include_router(ai.router)
app.include_router(forecast.router)
app.include_router(digest.router)
app.include_router(integrations.router)
app.include_router(market.router)
app.include_router(market_watch.router)
app.include_router(location.router)
app.include_router(customers.router)
app.include_router(benchmark.router)
app.include_router(billing.router)
app.include_router(analytics_integrations.router)
app.include_router(auth.router)
app.include_router(team.router)
app.include_router(teams.router)
app.include_router(intlyst.router)
app.include_router(growth.router)
app.include_router(reports.router)
app.include_router(workspaces.router)
app.include_router(companies.router)
app.include_router(plans.router)
app.include_router(suggestions.router)
app.include_router(audit_logs.router)
app.include_router(time_blocks.router)
app.include_router(work_schedules.router)
app.include_router(abtests.router)
app.include_router(cohorts.router)
app.include_router(funnels.router)
app.include_router(custom_kpis.router)
app.include_router(ga4.router)
app.include_router(events.router)
app.include_router(decision.router)
app.include_router(changes.router)
app.include_router(deep_analytics.router)
app.include_router(learning.router)
app.include_router(briefing.router)
app.include_router(instagram.router)
app.include_router(shopify.router)
app.include_router(stripe.router)
app.include_router(scheduler.router)

app.include_router(email_prefs_router)
app.include_router(superapp_router)
app.include_router(error_traces_router)
app.include_router(user_integrations_router)
app.include_router(referral_router)
app.include_router(audit_router)
app.include_router(schedules_router)
app.include_router(insights_router)
app.include_router(forecast_records_router)
app.include_router(scenarios_router)
app.include_router(ai_team_router)
app.include_router(activity_logs_di_router)
app.include_router(mfa_router)
app.include_router(metrics_router)
app.include_router(drilldown_router)
app.include_router(backup_router)
app.include_router(export_router)

# Dependency Injection für Automatisierungs-API
def get_automation_dependencies(request: Request):
    # Beispiel: User-ID und Workspace-ID aus Request extrahieren
    user_id = getattr(request.state, "user_id", 1)
    workspace_id = getattr(request.state, "workspace_id", 1)
    db = SessionLocal()
    user_settings = UserSettings(user_id=user_id)
    kpi_provider = KPIProvider(db, workspace_id)
    project_status_provider = ProjectStatusProvider(db, workspace_id)
    external_data_provider = ExternalDataProvider()
    return dict(
        user_settings=user_settings,
        kpi_provider=kpi_provider,
        project_status_provider=project_status_provider,
        external_data_provider=external_data_provider,
    )

app.include_router(
    automation_router,
    prefix="",
    tags=["automation"],
    dependencies=[Depends(get_automation_dependencies)]
)

# Optionaler Security-Router (wird eingebunden wenn security-Modul vorhanden)
try:
    security_router_module = importlib.import_module("api.security_routes")
    app.include_router(security_router_module.router)
except Exception:
    pass


# ── Meta-Endpunkte ────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "status": "ok",
        "app": "Intlyst",
        "version": "0.28.0",
    }


@app.get("/health", tags=["meta"])
def health():
    """Healthcheck – gibt nur Status zurueck, keine Service-Details in Produktion."""
    result: dict = {
        "status": "healthy",
        "database": "connected",
        "ga4": bool(os.getenv("GA4_SERVICE_ACCOUNT_JSON") or os.getenv("GA4_ACCESS_TOKEN")),
    }

    if backup_system:
        stats = backup_system.get_stats()
        result["backup_ok"] = not stats.get("backup_overdue")

    if not is_production_environment():
        result["services"] = {
            "database": "ok",
            "google_maps": "configured" if is_configured_secret(
                os.getenv("GOOGLE_MAPS_API_KEY", ""), prefixes=("AIza",), min_length=20
            ) else "not_configured",
            "anthropic_ai": "configured" if is_configured_secret(
                os.getenv("ANTHROPIC_API_KEY", ""), prefixes=("sk-ant-",), min_length=20
            ) else "not_configured",
            "stripe": "configured" if is_configured_secret(
                os.getenv("STRIPE_SECRET_KEY", ""), prefixes=("sk_",), min_length=12
            ) else "not_configured",
        }
    return result


@app.get("/health/errors", tags=["meta"])
def health_errors(current_user=Depends(get_current_user)):
    if getattr(current_user, "role", "member") not in {"admin", "owner"}:
        return {"count": 0, "latest": []}
    db = SessionLocal()
    try:
        latest = db.query(ErrorTrace).order_by(ErrorTrace.created_at.desc()).limit(10).all()
        return {
            "count": len(latest),
            "latest": [
                {
                    "id": row.id,
                    "path": row.path,
                    "error_type": row.error_type,
                    "status_code": row.status_code,
                    "created_at": row.created_at.isoformat() if getattr(row, "created_at", None) is not None else None,
                    "request_id": row.request_id,
                }
                for row in latest
            ],
        }
    finally:
        db.close()
