"""
Kohorten-Analyse: Kunden nach Eintrittsmonat gruppiert.

Liefert:
  GET /api/cohorts/retention  — Retention-Matrix (% noch aktiv je Monat nach Akquise)
  GET /api/cohorts/revenue    — Ø Umsatz pro Kunde je Kohorte und Monat
  GET /api/cohorts/summary    — Überblick: beste/schlechteste Kohorte, Ø Retention
  GET /api/cohorts/heatmap    — Farb-kodierte Retention-Werte für Frontend-Heatmap
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from api.auth_routes import User, get_current_user

router = APIRouter(prefix="/api/cohorts", tags=["cohorts"])


@router.get("")
def cohorts_overview(current_user: User = Depends(get_current_user)):
    """Baseline endpoint returning an empty cohort overview for smoke tests."""
    return {"cohorts": [], "summary": {"best": None, "worst": None}}

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _add_months(d: date, months: int) -> date:
    """Addiert N Monate zu einem Datum (monatsgenau, kein Overflow)."""
    month = d.month - 1 + months
    year  = d.year + month // 12
    month = month % 12 + 1
    day   = min(d.day, [31,28,31,30,31,30,31,31,30,31,30,31][month - 1])
    return date(year, month, day)

def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")

def _load_customers(db: Session):
    """Lädt alle Kunden aus der Customer-Tabelle (definiert in customers_routes)."""
    from api.customers_routes import Customer  # lokal importieren, kein Zirkel
    customers = db.query(Customer).all()
    if not customers:
        raise HTTPException(status_code=404, detail="Keine Kundendaten vorhanden.")
    return customers

def _build_cohort_map(customers) -> dict[str, list]:
    """Gruppiert Kunden nach Eintrittsmonat (first_purchase)."""
    cohorts: dict[str, list] = {}
    for c in customers:
        key = _month_key(getattr(c, "first_purchase"))
        cohorts.setdefault(key, []).append(c)
    return cohorts

def _retention_rate(cohort: list, month_start: date) -> float:
    """Anteil der Kunden, deren last_purchase >= month_start."""
    if not cohort:
        return 0.0
    retained = sum(
        1 for c in cohort
        if getattr(c, "last_purchase") >= month_start
    )
    return round(retained / len(cohort) * 100, 1)

def _color_band(pct: float) -> str:
    """Gibt Farb-Band für Heatmap zurück: green / yellow / red / gray."""
    if pct is None:
        return "gray"
    if pct >= 60:
        return "green"
    if pct >= 30:
        return "yellow"
    return "red"

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/retention")
def get_retention_matrix(
    max_months: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retention-Matrix: Für jede Akquise-Kohorte wird der Anteil der Kunden
    gezeigt, die noch in Monat 0, 1, 2 … N aktiv waren (last_purchase ≥ Monat N).

    Monat 0 = Akquise-Monat → immer 100 %.
    """
    customers = _load_customers(db)
    cohorts   = _build_cohort_map(customers)
    today     = date.today()

    rows = []
    for cohort_key in sorted(cohorts.keys()):
        group       = cohorts[cohort_key]
        cohort_date = date(int(cohort_key[:4]), int(cohort_key[5:7]), 1)
        retention   = []

        for n in range(max_months + 1):
            month_start = _add_months(cohort_date, n)
            # Zukunfts-Monate nicht berechnen
            if month_start > today:
                retention.append(None)
            else:
                retention.append(_retention_rate(group, month_start))

        rows.append({
            "cohort":        cohort_key,
            "size":          len(group),
            "retention":     retention,   # Index = Monate nach Akquise
            "avg_retention": round(
                sum(v for v in retention[1:] if v is not None) /
                max(len([v for v in retention[1:] if v is not None]), 1),
                1,
            ),
        })

    # Gesamt-Durchschnitt je Monat
    col_avgs = []
    for n in range(max_months + 1):
        vals = [r["retention"][n] for r in rows if r["retention"][n] is not None]
        col_avgs.append(round(sum(vals) / len(vals), 1) if vals else None)

    return {
        "cohorts":       rows,
        "column_avgs":   col_avgs,
        "max_months":    max_months,
        "total_customers": len(customers),
    }


@router.get("/revenue")
def get_revenue_cohorts(
    max_months: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Umsatz-Kohortenanalyse: Ø Umsatz pro Kunde in Kohorte (basiert auf
    Gesamtumsatz anteilig über die Kundenlebensdauer).
    """
    customers = _load_customers(db)
    cohorts   = _build_cohort_map(customers)

    rows = []
    for cohort_key in sorted(cohorts.keys()):
        group      = cohorts[cohort_key]
        total_rev  = sum(float(getattr(c, "total_revenue", 0) or 0) for c in group)
        total_ord  = sum(int(getattr(c, "total_orders",   1) or 1) for c in group)
        n          = len(group)

        avg_rev     = round(total_rev / n, 2)
        avg_orders  = round(total_ord / n, 2)
        avg_order_v = round(total_rev / max(total_ord, 1), 2)

        rows.append({
            "cohort":                 cohort_key,
            "size":                   n,
            "total_revenue":          round(total_rev, 2),
            "avg_revenue_per_customer": avg_rev,
            "avg_orders_per_customer":  avg_orders,
            "avg_order_value":          avg_order_v,
        })

    return {"cohorts": rows}


@router.get("/summary")
def get_cohort_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Überblick: beste und schlechteste Kohorte, Gesamt-Ø Retention."""
    customers = _load_customers(db)
    cohorts   = _build_cohort_map(customers)
    today     = date.today()

    summary_rows = []
    for cohort_key, group in cohorts.items():
        cohort_date   = date(int(cohort_key[:4]), int(cohort_key[5:7]), 1)
        month3_start  = _add_months(cohort_date, 3)
        retention_3m  = _retention_rate(group, month3_start) if month3_start <= today else None
        total_rev     = sum(float(getattr(c, "total_revenue", 0) or 0) for c in group)

        summary_rows.append({
            "cohort":       cohort_key,
            "size":         len(group),
            "retention_3m": retention_3m,
            "avg_revenue":  round(total_rev / len(group), 2),
        })

    valid = [r for r in summary_rows if r["retention_3m"] is not None]

    best  = max(valid, key=lambda r: r["retention_3m"]) if valid else None
    worst = min(valid, key=lambda r: r["retention_3m"]) if valid else None
    avg_r = round(sum(r["retention_3m"] for r in valid) / len(valid), 1) if valid else None

    return {
        "total_cohorts":       len(cohorts),
        "total_customers":     len(customers),
        "avg_retention_3m":    avg_r,
        "best_cohort":         best,
        "worst_cohort":        worst,
        "cohorts":             sorted(summary_rows, key=lambda r: r["cohort"], reverse=True),
    }


@router.get("/heatmap")
def get_retention_heatmap(
    max_months: int = 12,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Heatmap-Format für das Frontend: jede Zelle enthält Wert + Farb-Band.
    Farben: green ≥60 %, yellow ≥30 %, red <30 %, gray = Zukunft/keine Daten.
    """
    customers = _load_customers(db)
    cohorts   = _build_cohort_map(customers)
    today     = date.today()

    rows = []
    for cohort_key in sorted(cohorts.keys()):
        group       = cohorts[cohort_key]
        cohort_date = date(int(cohort_key[:4]), int(cohort_key[5:7]), 1)
        cells       = []

        for n in range(max_months + 1):
            month_start = _add_months(cohort_date, n)
            if month_start > today:
                cells.append({"month": n, "value": None, "color": "gray"})
            else:
                val = _retention_rate(group, month_start)
                cells.append({"month": n, "value": val, "color": _color_band(val)})

        rows.append({
            "cohort": cohort_key,
            "size":   len(group),
            "cells":  cells,
        })

    # Spalten-Labels: M+0, M+1, …
    headers = [f"M+{n}" for n in range(max_months + 1)]
    headers[0] = "Akquise"

    return {
        "headers":    headers,
        "rows":       rows,
        "max_months": max_months,
        "legend":     {"green": "≥60%", "yellow": "30–59%", "red": "<30%", "gray": "Noch kein Datum"},
    }
