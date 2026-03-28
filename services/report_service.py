"""
Report-Service: Daten sammeln, SVG-Charts erzeugen, KI-Narrative anfragen,
vollständigen HTML-Bericht zusammenbauen und in der Datenbank speichern.
"""
import logging
import os
from datetime import date, datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from database import SessionLocal
from models.daily_metrics import DailyMetrics
from models.goals import Goal
from models.report import Report
from security_config import is_configured_secret
from services.chart_service import (
    C_CYAN, C_DANGER, C_MUTED, C_PRIMARY, C_SECONDARY, C_SUCCESS, C_TEXT, C_WARNING,
    bar_chart, fmt_value, line_chart, progress_ring, sparkline, trend_arrow,
    trend_color, weekday_heatmap,
)

logger = logging.getLogger(__name__)

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL   = "claude-sonnet-4-20250514"


# ── Datenaggregation ─────────────────────────────────────────────────────────

def _f(v, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _avg(lst: list[float]) -> float:
    return sum(lst) / len(lst) if lst else 0.0


def _trend_pct(lst: list[float]) -> float:
    if len(lst) < 2:
        return 0.0
    mid = len(lst) // 2
    a = _avg(lst[:mid]) or 0.001
    b = _avg(lst[mid:])
    return round((b - a) / a * 100, 1)


def collect_period_data(start: date, end: date, db: Session, workspace_id: int) -> dict:
    """Metriken für einen Zeitraum aus der Datenbank lesen."""
    rows = (
        db.query(DailyMetrics)
        .filter(
            DailyMetrics.workspace_id == workspace_id,
            DailyMetrics.period == "daily",
            DailyMetrics.date >= start,
            DailyMetrics.date <= end,
        )
        .order_by(DailyMetrics.date)
        .all()
    )

    if not rows:
        return {}

    dates       = [str(getattr(r, "date")) for r in rows]
    short_dates = [d[5:].replace("-", ".") for d in dates]   # "MM.DD"
    revenues      = [_f(getattr(r, "revenue",         0)) for r in rows]
    traffics      = [_f(getattr(r, "traffic",         0)) for r in rows]
    conversions   = [_f(getattr(r, "conversions",     0)) for r in rows]
    conv_rates    = [_f(getattr(r, "conversion_rate", 0)) for r in rows]
    new_customers = [_f(getattr(r, "new_customers",   0)) for r in rows]

    # Umsatz nach Wochentag aggregieren
    weekday_map: dict[str, float] = {"Mo": 0, "Di": 0, "Mi": 0, "Do": 0, "Fr": 0, "Sa": 0, "So": 0}
    wd_names = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
    for r, rev in zip(rows, revenues):
        wd = wd_names[getattr(r, "date").weekday()]
        weekday_map[wd] += rev

    peak_idx = revenues.index(max(revenues)) if revenues else 0

    return {
        "dates":            dates,
        "short_dates":      short_dates,
        "revenues":         revenues,
        "traffics":         traffics,
        "conversions":      conversions,
        "conv_rates":       conv_rates,
        "new_customers":    new_customers,
        "weekday_revenue":  weekday_map,
        # Aggregierte KPIs
        "total_revenue":    round(sum(revenues), 2),
        "avg_revenue":      round(_avg(revenues), 2),
        "avg_traffic":      round(_avg(traffics), 0),
        "avg_conv_rate":    round(_avg(conv_rates), 2),
        "total_new_customers": int(sum(new_customers)),
        # Trends
        "revenue_trend":    _trend_pct(revenues),
        "traffic_trend":    _trend_pct(traffics),
        "cr_trend":         _trend_pct(conv_rates),
        "nc_trend":         _trend_pct(new_customers),
        # Höhepunkte
        "peak_revenue":     round(max(revenues), 2) if revenues else 0,
        "peak_revenue_day": dates[peak_idx] if dates else None,
    }


def collect_prev_period_data(start: date, end: date, db: Session, workspace_id: int) -> dict:
    """Daten der Vorperiode zum Vergleich."""
    delta = (end - start).days + 1
    prev_end   = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=delta - 1)
    return collect_period_data(prev_start, prev_end, db, workspace_id=workspace_id)


def collect_goals(db: Session, workspace_id: int) -> list[dict]:
    """Aktuellen Zielfortschritt berechnen."""
    goals = db.query(Goal).filter(Goal.workspace_id == workspace_id).all()
    result = []
    for g in goals:
        target = _f(getattr(g, "target_value", 0))
        if target <= 0:
            continue

        g_start = getattr(g, "start_date")
        g_end   = getattr(g, "end_date")
        metric  = str(getattr(g, "metric", "revenue"))

        rows = (
            db.query(DailyMetrics)
            .filter(
                DailyMetrics.workspace_id == workspace_id,
                DailyMetrics.period == "daily",
                DailyMetrics.date >= g_start,
                DailyMetrics.date <= g_end,
            )
            .all()
        )

        if metric == "revenue":
            current = sum(_f(getattr(r, "revenue", 0)) for r in rows)
        elif metric == "traffic":
            current = sum(_f(getattr(r, "traffic", 0)) for r in rows)
        elif metric == "conversions":
            current = sum(_f(getattr(r, "conversions", 0)) for r in rows)
        elif metric == "new_customers":
            current = sum(_f(getattr(r, "new_customers", 0)) for r in rows)
        elif metric == "conversion_rate":
            vals = [_f(getattr(r, "conversion_rate", 0)) for r in rows if getattr(r, "conversion_rate", None)]
            current = _avg(vals)
        else:
            current = 0.0

        pct = min(round(current / target * 100, 1), 999.0)
        result.append({
            "metric":   metric,
            "target":   target,
            "current":  round(current, 2),
            "pct":      pct,
            "end_date": str(g_end),
        })

    return result


# ── KI-Narrativ ──────────────────────────────────────────────────────────────

async def build_ai_narrative(data: dict, period_type: str) -> str:
    """Claude API für Executive Summary aufrufen."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(api_key, prefixes=("sk-ant-",), min_length=20):
        return _fallback_narrative(data)

    period_de = {"daily": "täglich", "weekly": "wöchentlich", "custom": "benutzerdefiniert"}.get(
        period_type, period_type
    )

    start_date = data.get("dates", ["?"])[0] if data.get("dates") else "?"
    end_date   = data.get("dates", ["?"])[-1] if data.get("dates") else "?"

    context = (
        f"Geschäftsdaten ({start_date} bis {end_date}):\n"
        f"• Gesamtumsatz: {data.get('total_revenue', 0):.2f} € "
        f"(Ø {data.get('avg_revenue', 0):.2f} €/Tag, Trend {data.get('revenue_trend', 0):+.1f} %)\n"
        f"• Ø Traffic: {data.get('avg_traffic', 0):.0f}/Tag, Trend {data.get('traffic_trend', 0):+.1f} %\n"
        f"• Ø Conversion Rate: {data.get('avg_conv_rate', 0):.2f} %, Trend {data.get('cr_trend', 0):+.1f} %\n"
        f"• Neue Kunden gesamt: {data.get('total_new_customers', 0)}\n"
        f"• Stärkster Tag: {data.get('peak_revenue_day', 'n/a')} mit {data.get('peak_revenue', 0):.2f} €\n"
    )

    goals = data.get("goals", [])
    if goals:
        context += "Ziele:\n"
        for g in goals[:3]:
            context += f"  – {g['metric']}: {g['pct']:.0f} % erreicht ({g['current']:.1f} / {g['target']:.1f})\n"

    prompt = (
        f"Du bist Business-Analyst. Schreibe eine prägnante {period_de}e Executive Summary "
        f"auf Deutsch (3–4 Sätze Fließtext, keine Listen). "
        f"Fokus: Was lief gut, was braucht Aufmerksamkeit, eine konkrete Empfehlung.\n\n"
        f"{context}"
    )

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            res = await client.post(
                CLAUDE_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 350,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        if res.status_code == 200:
            return res.json()["content"][0]["text"].strip()
    except Exception as exc:
        logger.warning("Claude API nicht erreichbar (Report): %s", exc)

    return _fallback_narrative(data)


def _fallback_narrative(data: dict) -> str:
    rev  = data.get("total_revenue", 0)
    tr   = data.get("revenue_trend", 0)
    nc   = data.get("total_new_customers", 0)
    cr   = data.get("avg_conv_rate", 0)
    arrow = trend_arrow(tr)
    direction = "gestiegen" if tr > 0 else "gefallen" if tr < 0 else "stabil"
    return (
        f"Im Berichtszeitraum wurde ein Gesamtumsatz von {fmt_value(rev, '€')} erzielt, "
        f"der Trend ist {direction} ({arrow} {tr:+.1f} %). "
        f"Die Conversion Rate lag bei {cr:.2f} %, es kamen {nc} neue Kunden hinzu. "
        f"Bitte Anthropic-API-Key konfigurieren für detaillierte KI-Analyse."
    )


# ── HTML-Bericht zusammenbauen ───────────────────────────────────────────────

def _period_comparison_chart(curr: dict, prev: dict) -> str:
    """Balkendiagramm: aktuelle vs. vorherige Periode."""
    if not curr or not prev:
        return ""

    cats = ["Umsatz", "Traffic", "CR %"]
    cur_vals  = [curr.get("total_revenue", 0), curr.get("avg_traffic", 0), curr.get("avg_conv_rate", 0)]
    prev_vals = [prev.get("total_revenue", 0), prev.get("avg_traffic", 0), prev.get("avg_conv_rate", 0)]

    return bar_chart(
        categories=cats,
        series=[
            {"label": "Aktuelle Periode", "values": cur_vals, "color": C_PRIMARY},
            {"label": "Vorherige Periode", "values": prev_vals, "color": C_SECONDARY},
        ],
        title="Periodenvergleich",
        unit="",
        width=560,
        height=200,
    )


def _goals_section(goals: list[dict]) -> str:
    if not goals:
        return f'<p style="color:{C_MUTED};font-size:13px">Keine aktiven Ziele.</p>'

    html = ""
    for g in goals:
        pct = g["pct"]
        c = C_SUCCESS if pct >= 80 else C_WARNING if pct >= 50 else C_DANGER
        label = g["metric"].replace("_", " ").title()
        html += f"""
        <div style="margin-bottom:18px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
            <span style="font-size:13px;font-weight:600;color:{C_TEXT}">{label}</span>
            <span style="font-size:12px;font-weight:700;color:{c}">{pct:.0f} %</span>
          </div>
          <div style="background:#e2e8f0;border-radius:99px;height:7px;overflow:hidden">
            <div style="background:{c};width:{min(pct, 100):.1f}%;height:100%;border-radius:99px"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px">
            <span style="font-size:10px;color:{C_MUTED}">Aktuell: {fmt_value(g['current'])}</span>
            <span style="font-size:10px;color:{C_MUTED}">Ziel: {fmt_value(g['target'])} (bis {g['end_date']})</span>
          </div>
        </div>"""
    return html


def build_html_report(
    data: dict,
    prev: dict,
    period_type: str,
    period_start: date,
    period_end: date,
    narrative: str,
) -> str:
    """Vollständigen HTML-Bericht assemblieren."""

    # Charts
    short = data.get("short_dates", [])
    chart_rev    = line_chart(short, data.get("revenues",   []), "Umsatz-Verlauf",     C_PRIMARY,   "€")
    chart_tr     = line_chart(short, data.get("traffics",   []), "Traffic",            C_SECONDARY, "")
    chart_cr     = line_chart(short, data.get("conv_rates", []), "Conversion Rate",    C_CYAN,      "%",  width=560, height=180)
    chart_nc     = line_chart(short, data.get("new_customers", []), "Neue Kunden",     C_SUCCESS,   "",   width=560, height=180)
    chart_comp   = _period_comparison_chart(data, prev)
    chart_heatmap = weekday_heatmap(
        data.get("weekday_revenue", {}),
        "Umsatz nach Wochentag",
        C_PRIMARY, "€",
    )

    # Sparklines (KPI Cards)
    sp_rev  = sparkline(data.get("revenues",      []), C_PRIMARY,   120, 32)
    sp_tr   = sparkline(data.get("traffics",      []), C_SECONDARY, 120, 32)
    sp_cr   = sparkline(data.get("conv_rates",    []), C_CYAN,      120, 32)
    sp_nc   = sparkline(data.get("new_customers", []), C_SUCCESS,   120, 32)

    # Ziele
    goals        = data.get("goals", [])
    goals_html   = _goals_section(goals)

    # Progress Rings für die ersten 2 Ziele
    rings_html = ""
    for g in goals[:4]:
        c = C_SUCCESS if g["pct"] >= 80 else C_WARNING if g["pct"] >= 50 else C_DANGER
        label = g["metric"].replace("_", " ").title()
        rings_html += f'<div style="width:110px">{progress_ring(g["pct"], label, c)}</div>\n'

    # KPI-Werte
    total_rev = data.get("total_revenue", 0)
    avg_tr    = data.get("avg_traffic",   0)
    avg_cr    = data.get("avg_conv_rate", 0)
    total_nc  = data.get("total_new_customers", 0)
    rev_t     = data.get("revenue_trend", 0)
    tr_t      = data.get("traffic_trend", 0)
    cr_t      = data.get("cr_trend",      0)
    nc_t      = data.get("nc_trend",      0)

    rev_arrow  = trend_arrow(rev_t);  rev_c  = trend_color(rev_t)
    tr_arrow   = trend_arrow(tr_t);   tr_c   = trend_color(tr_t)
    cr_arrow   = trend_arrow(cr_t);   cr_c   = trend_color(cr_t)
    nc_arrow   = trend_arrow(nc_t);   nc_c   = trend_color(nc_t)

    type_de  = {"daily": "Tagesbericht", "weekly": "Wochenbericht", "custom": "Bericht"}.get(period_type, "Bericht")
    period_s = f"{period_start.strftime('%d.%m.%Y')} – {period_end.strftime('%d.%m.%Y')}"
    gen_str  = datetime.utcnow().strftime("%d.%m.%Y, %H:%M UTC")

    comp_section = f"""
  <div class="section">
    <div class="section-title">Periodenvergleich</div>
    <div class="chart-wrap">{chart_comp}</div>
  </div>""" if chart_comp else ""

    rings_section = f"""
  <div class="section">
    <div class="section-title">Ziel-Fortschritt</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">{rings_html}</div>
    {goals_html}
  </div>""" if goals else f"""
  <div class="section">
    <div class="section-title">Ziel-Fortschritt</div>
    {goals_html}
  </div>"""

    return f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Intlyst – {type_de} {period_s}</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#f1f5f9;color:{C_TEXT};-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    .page{{max-width:820px;margin:0 auto;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}}
    @media print{{body{{background:#fff}}.page{{max-width:100%;box-shadow:none}}}}

    .header{{background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;padding:32px 40px 28px}}
    .logo{{font-size:26px;font-weight:800;letter-spacing:-.5px}}
    .logo span{{opacity:.65;font-weight:400;font-size:20px}}
    .report-type{{font-size:20px;font-weight:700;margin:8px 0 4px}}
    .header-meta{{font-size:12px;opacity:.8}}

    .section{{padding:26px 40px;border-bottom:1px solid #f1f5f9}}
    .section:last-child{{border-bottom:none}}
    .section-title{{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:{C_MUTED};margin-bottom:16px}}

    .narrative{{background:#f8fafc;border-left:3px solid #6366f1;padding:14px 18px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.75;color:#374151}}

    .kpi-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}}
    @media(max-width:600px){{.kpi-grid{{grid-template-columns:repeat(2,1fr)}}}}
    .kpi{{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px}}
    .kpi-label{{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:{C_MUTED};margin-bottom:5px}}
    .kpi-value{{font-size:22px;font-weight:800;color:{C_TEXT};line-height:1;margin-bottom:6px}}
    .kpi-spark{{margin:6px 0 5px}}
    .kpi-trend{{font-size:11px;font-weight:600}}

    .chart-wrap{{margin:0 -4px}}
    .chart-2col{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}
    @media(max-width:600px){{.chart-2col{{grid-template-columns:1fr}}}}

    .footer{{background:#1e293b;color:#64748b;padding:18px 40px;font-size:11px;display:flex;justify-content:space-between;align-items:center}}
    .footer-brand{{color:#e2e8f0;font-weight:700;font-size:13px}}

    svg{{display:block;width:100%;height:auto}}
  </style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="logo">Intlyst <span>Analytics</span></div>
    <div class="report-type">{type_de}</div>
    <div class="header-meta">Zeitraum: {period_s} &nbsp;·&nbsp; Erstellt: {gen_str}</div>
  </div>

  <div class="section">
    <div class="section-title">Executive Summary</div>
    <div class="narrative">{narrative}</div>
  </div>

  <div class="section">
    <div class="section-title">Kennzahlen-Übersicht</div>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Gesamtumsatz</div>
        <div class="kpi-value">{fmt_value(total_rev, "€")}</div>
        <div class="kpi-spark">{sp_rev}</div>
        <div class="kpi-trend" style="color:{rev_c}">{rev_arrow} {rev_t:+.1f} %</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Ø Traffic / Tag</div>
        <div class="kpi-value">{fmt_value(avg_tr)}</div>
        <div class="kpi-spark">{sp_tr}</div>
        <div class="kpi-trend" style="color:{tr_c}">{tr_arrow} {tr_t:+.1f} %</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Conversion Rate</div>
        <div class="kpi-value">{avg_cr:.2f} %</div>
        <div class="kpi-spark">{sp_cr}</div>
        <div class="kpi-trend" style="color:{cr_c}">{cr_arrow} {cr_t:+.1f} %</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Neue Kunden</div>
        <div class="kpi-value">{total_nc}</div>
        <div class="kpi-spark">{sp_nc}</div>
        <div class="kpi-trend" style="color:{nc_c}">{nc_arrow} {nc_t:+.1f} %</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Umsatz-Verlauf</div>
    <div class="chart-wrap">{chart_rev}</div>
  </div>

  <div class="section">
    <div class="section-title">Traffic &amp; Conversion Rate</div>
    <div class="chart-2col">
      <div>{chart_tr}</div>
      <div>{chart_cr}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Neue Kunden &amp; Wochentag-Analyse</div>
    <div class="chart-2col">
      <div>{chart_nc}</div>
      <div style="display:flex;align-items:center">{chart_heatmap}</div>
    </div>
  </div>

  {comp_section}

  {rings_section}

  <div class="footer">
    <div><span class="footer-brand">Intlyst</span> – Automatisch generierter Bericht</div>
    <div>intlyst.de</div>
  </div>

</div>
</body>
</html>"""


# ── Haupt-Einstiegspunkt ─────────────────────────────────────────────────────

async def create_report(
    period_type: str,
    period_start: date,
    period_end: date,
    db: Session,
    user_id: int = 1,
    workspace_id: int = 1,
) -> Report:
    """Vollständigen Report generieren und in der DB speichern."""
    from database import engine
    from models.report import Report as ReportModel
    from models.base import Base
    Base.metadata.create_all(bind=engine)

    kw = period_end.isocalendar()[1]
    titles = {
        "daily":  f"Tagesbericht {period_end.strftime('%d.%m.%Y')}",
        "weekly": f"Wochenbericht KW {kw:02d}/{period_end.year}",
        "custom": f"Bericht {period_start.strftime('%d.%m')}–{period_end.strftime('%d.%m.%Y')}",
    }
    title = titles.get(period_type, f"Bericht {period_start}–{period_end}")

    report = ReportModel(
        user_id=user_id,
        workspace_id=workspace_id,
        type=period_type,
        period_start=period_start,
        period_end=period_end,
        title=title,
        status="generating",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    try:
        data = collect_period_data(period_start, period_end, db, workspace_id=workspace_id)
        if not data:
            data = {k: [] for k in ["dates", "short_dates", "revenues", "traffics",
                                    "conversions", "conv_rates", "new_customers"]}
            data.update({k: 0 for k in ["total_revenue", "avg_revenue", "avg_traffic",
                                         "avg_conv_rate", "total_new_customers",
                                         "revenue_trend", "traffic_trend", "cr_trend", "nc_trend",
                                         "peak_revenue"]})
            data["weekday_revenue"] = {}
            data["peak_revenue_day"] = None

        data["goals"] = collect_goals(db, workspace_id=workspace_id)
        prev           = collect_prev_period_data(period_start, period_end, db, workspace_id=workspace_id)
        narrative      = await build_ai_narrative(data, period_type)
        html           = build_html_report(data, prev, period_type, period_start, period_end, narrative)

        report.status       = "done"
        report.summary      = narrative
        report.html_content = html
        db.commit()
        db.refresh(report)

        logger.info("REPORT_DONE id=%s type=%s period=%s–%s", report.id, period_type, period_start, period_end)
        return report

    except Exception as exc:
        logger.error("REPORT_ERROR id=%s: %s", report.id, exc)
        report.status    = "error"
        report.error_msg = str(exc)[:500]
        db.commit()
        raise


# ── Scheduler-Helfer (wird von main.py aufgerufen) ────────────────────────────

async def scheduled_daily_report() -> None:
    """Wird täglich um 07:00 Uhr ausgeführt."""
    yesterday = date.today() - timedelta(days=1)
    db = SessionLocal()
    try:
        from api.auth_routes import Workspace, WorkspaceMembership

        memberships = (
            db.query(WorkspaceMembership)
            .filter(WorkspaceMembership.is_active == True, WorkspaceMembership.role == "owner")
            .all()
        )
        for membership in memberships:
            workspace = db.query(Workspace).filter(Workspace.id == membership.workspace_id).first()
            if not workspace:
                continue
            await create_report(
                "daily",
                yesterday,
                yesterday,
                db,
                user_id=membership.user_id,
                workspace_id=workspace.id,
            )
    except Exception as exc:
        logger.error("SCHEDULED_DAILY_ERROR: %s", exc)
    finally:
        db.close()


async def scheduled_weekly_report() -> None:
    """Wird jeden Montag um 07:05 Uhr ausgeführt (für die Vorwoche)."""
    today = date.today()
    # Montag dieser Woche → Vorwoche So
    end   = today - timedelta(days=today.weekday() + 1)   # letzter Sonntag
    start = end - timedelta(days=6)                        # letzter Montag
    db    = SessionLocal()
    try:
        from api.auth_routes import Workspace, WorkspaceMembership

        memberships = (
            db.query(WorkspaceMembership)
            .filter(WorkspaceMembership.is_active == True, WorkspaceMembership.role == "owner")
            .all()
        )
        for membership in memberships:
            workspace = db.query(Workspace).filter(Workspace.id == membership.workspace_id).first()
            if not workspace:
                continue
            await create_report(
                "weekly",
                start,
                end,
                db,
                user_id=membership.user_id,
                workspace_id=workspace.id,
            )
    except Exception as exc:
        logger.error("SCHEDULED_WEEKLY_ERROR: %s", exc)
    finally:
        db.close()
