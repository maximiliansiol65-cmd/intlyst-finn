"""
Report-API: Automatische Berichte auf Abruf, täglich & wöchentlich.
Liefert Metadaten (JSON) und vollständigen HTML-Bericht.
"""
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models.report import Report
from services.report_service import create_report
from api.auth_routes import User, get_current_user, get_current_workspace_id

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ReportMeta(BaseModel):
    id:          int
    type:        str
    period_start: str
    period_end:  str
    title:       str
    status:      str
    summary:     Optional[str]
    created_at:  str
    has_content: bool


class GenerateRequest(BaseModel):
    type:         Literal["daily", "weekly", "custom"] = "daily"
    period_start: Optional[date] = None
    period_end:   Optional[date] = None


# ── Endpunkte ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ReportMeta])
def list_reports(
    limit:  int           = Query(20, ge=1, le=100),
    offset: int           = Query(0, ge=0),
    type:   Optional[str] = Query(None, enum=["daily", "weekly", "custom"]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Liste aller Reports des eingeloggten Nutzers (ohne HTML-Inhalt)."""
    q = db.query(Report).filter(
        Report.user_id == current_user.id,
        Report.workspace_id == workspace_id,
    )
    if type:
        q = q.filter(Report.type == type)
    reports = q.order_by(desc(Report.created_at)).offset(offset).limit(limit).all()

    return [
        ReportMeta(
            id=r.id,
            type=r.type,
            period_start=str(r.period_start),
            period_end=str(r.period_end),
            title=r.title,
            status=r.status,
            summary=r.summary,
            created_at=str(r.created_at),
            has_content=bool(r.html_content),
        )
        for r in reports
    ]


@router.get("/{report_id}", response_model=ReportMeta)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Metadaten + KI-Summary eines einzelnen Reports."""
    r = (
        db.query(Report)
        .filter(
            Report.id == report_id,
            Report.user_id == current_user.id,
            Report.workspace_id == workspace_id,
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Report nicht gefunden.")

    return ReportMeta(
        id=r.id,
        type=r.type,
        period_start=str(r.period_start),
        period_end=str(r.period_end),
        title=r.title,
        status=r.status,
        summary=r.summary,
        created_at=str(r.created_at),
        has_content=bool(r.html_content),
    )


@router.get("/{report_id}/html")
def get_report_html(
    report_id: int,
    download:  bool = Query(False, description="Als Datei herunterladen"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Vollständiger HTML-Report (zum Anzeigen oder Herunterladen)."""
    r = (
        db.query(Report)
        .filter(
            Report.id == report_id,
            Report.user_id == current_user.id,
            Report.workspace_id == workspace_id,
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Report nicht gefunden.")
    if not r.html_content:
        raise HTTPException(status_code=404, detail="HTML noch nicht verfügbar (Status: {}).".format(r.status))

    headers: dict[str, str] = {}
    if download:
        safe_title = str(r.title).replace(" ", "_").replace("/", "-")
        headers["Content-Disposition"] = f'attachment; filename="{safe_title}.html"'

    return Response(content=r.html_content, media_type="text/html", headers=headers)


@router.post("/generate")
async def generate_report(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    """Report sofort generieren (synchron – dauert wenige Sekunden)."""
    today = date.today()

    if body.type == "daily":
        start = end = today - timedelta(days=1)
    elif body.type == "weekly":
        end   = today - timedelta(days=today.weekday() + 1)
        start = end - timedelta(days=6)
    else:
        if not body.period_start or not body.period_end:
            raise HTTPException(
                status_code=400,
                detail="period_start und period_end sind für type=custom erforderlich.",
            )
        if body.period_end < body.period_start:
            raise HTTPException(status_code=400, detail="period_end muss ≥ period_start sein.")
        if (body.period_end - body.period_start).days > 365:
            raise HTTPException(status_code=400, detail="Maximaler Zeitraum: 365 Tage.")
        start, end = body.period_start, body.period_end

    report = await create_report(
        body.type,
        start,
        end,
        db,
        user_id=current_user.id,
        workspace_id=workspace_id,
    )

    return {
        "message":   "Report erfolgreich erstellt.",
        "report_id": report.id,
        "title":     report.title,
        "status":    report.status,
        "html_url":  f"/api/reports/{report.id}/html",
    }


@router.delete("/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int = Depends(get_current_workspace_id),
):
    r = (
        db.query(Report)
        .filter(
            Report.id == report_id,
            Report.user_id == current_user.id,
            Report.workspace_id == workspace_id,
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Report nicht gefunden.")
    db.delete(r)
    db.commit()
    return {"message": "Report gelöscht.", "id": report_id}
