"""
Custom KPI Engine: Nutzer definiert eigene Metriken via Formel,
gespeichert in DB, live gegen DailyMetrics berechnet.

Unterstützte Formel-Typen
─────────────────────────
simple      avg oder sum einer einzelnen Metric
ratio       numerator / denominator × multiplier  (z. B. ARPU = revenue/traffic)
difference  metric_a − metric_b × multiplier
growth      (Ø letzte N Tage − Ø vorherige N Tage) / Ø vorherige × 100
compound    gewichtete Summe mehrerer Metriken

Erlaubte Metrics: revenue, traffic, conversions, conversion_rate, new_customers
"""
import json
import logging
from datetime import date, timedelta, datetime
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import engine, get_db
from models.custom_kpi import CustomKPI
from models.base import Base
from models.daily_metrics import DailyMetrics
from api.auth_routes import User, get_current_user

Base.metadata.create_all(bind=engine)

router = APIRouter(prefix="/api/kpis/custom", tags=["custom_kpis"])
logger = logging.getLogger(__name__)

VALID_METRICS = {"revenue", "traffic", "conversions", "conversion_rate", "new_customers"}
VALID_FORMULA_TYPES = {"simple", "ratio", "difference", "growth", "compound"}

# ── Schema-Validatoren für formula_config ────────────────────────────────────

def _validate_config(formula_type: str, config: dict) -> None:
    required: dict[str, list[str]] = {
        "simple":     ["metric"],
        "ratio":      ["numerator", "denominator"],
        "difference": ["metric_a", "metric_b"],
        "growth":     ["metric"],
        "compound":   ["components"],
    }
    for key in required.get(formula_type, []):
        if key not in config:
            raise ValueError(f"formula_config muss '{key}' enthalten für Typ '{formula_type}'.")

    # Metriken validieren
    for field in ("metric", "numerator", "denominator", "metric_a", "metric_b"):
        if field in config and config[field] not in VALID_METRICS:
            raise ValueError(f"'{config[field]}' ist keine gültige Metric. Erlaubt: {VALID_METRICS}")

    if formula_type == "compound":
        for comp in config.get("components", []):
            if "metric" not in comp or comp["metric"] not in VALID_METRICS:
                raise ValueError(f"Ungültige Metric in components: {comp.get('metric')}")


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class KPICreate(BaseModel):
    name:           str
    description:    Optional[str]  = None
    formula_type:   str
    formula_config: dict
    unit:           str            = ""
    target:         Optional[float] = None
    alert_below:    Optional[float] = None
    alert_above:    Optional[float] = None
    window_days:    int            = 30
    sort_order:     int            = 0

    @field_validator("formula_type")
    @classmethod
    def check_type(cls, v: str) -> str:
        if v not in VALID_FORMULA_TYPES:
            raise ValueError(f"Ungültiger formula_type. Erlaubt: {VALID_FORMULA_TYPES}")
        return v

    @field_validator("formula_config")
    @classmethod
    def check_config(cls, v: dict, info: Any) -> dict:
        ft = info.data.get("formula_type")
        if ft:
            _validate_config(ft, v)
        return v

    @field_validator("window_days")
    @classmethod
    def check_window(cls, v: int) -> int:
        if not (1 <= v <= 365):
            raise ValueError("window_days muss zwischen 1 und 365 liegen.")
        return v


class KPIUpdate(BaseModel):
    name:           Optional[str]   = None
    description:    Optional[str]   = None
    formula_type:   Optional[str]   = None
    formula_config: Optional[dict]  = None
    unit:           Optional[str]   = None
    target:         Optional[float] = None
    alert_below:    Optional[float] = None
    alert_above:    Optional[float] = None
    window_days:    Optional[int]   = None
    sort_order:     Optional[int]   = None
    is_active:      Optional[bool]  = None


class KPIValueResult(BaseModel):
    id:           int
    name:         str
    description:  Optional[str]
    formula_type: str
    unit:         str
    value:        Optional[float]
    value_fmt:    str
    target:       Optional[float]
    target_pct:   Optional[float]   # Fortschritt zum Zielwert in %
    status:       str               # ok / warning / alert / no_data
    alert_below:  Optional[float]
    alert_above:  Optional[float]
    window_days:  int
    period_start: str
    period_end:   str


# ── Berechnungs-Engine ────────────────────────────────────────────────────────

def _metric_vals(rows: list, metric: str) -> list[float]:
    return [float(getattr(r, metric) or 0) for r in rows]

def _avg(vals: list[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0

def _sum(vals: list[float]) -> float:
    return sum(vals)

def _fetch_rows(db: Session, start: date, end: date) -> list:
    return (
        db.query(DailyMetrics)
        .filter(DailyMetrics.period == "daily",
                DailyMetrics.date >= start,
                DailyMetrics.date <= end)
        .order_by(DailyMetrics.date)
        .all()
    )

def _compute(kpi: CustomKPI, db: Session) -> Optional[float]:
    window  = int(getattr(kpi, "window_days") or 30)
    cfg     = json.loads(str(getattr(kpi, "formula_config")))
    ftype   = str(getattr(kpi, "formula_type"))
    today   = date.today()
    end     = today
    start   = today - timedelta(days=window - 1)
    rows    = _fetch_rows(db, start, end)

    if not rows and ftype != "growth":
        return None

    if ftype == "simple":
        agg  = cfg.get("aggregation", "avg")
        vals = _metric_vals(rows, cfg["metric"])
        return round(_sum(vals) if agg == "sum" else _avg(vals), 4)

    if ftype == "ratio":
        mult = float(cfg.get("multiplier", 1.0))
        num  = _avg(_metric_vals(rows, cfg["numerator"]))
        den  = _avg(_metric_vals(rows, cfg["denominator"]))
        if den == 0:
            return None
        return round(num / den * mult, 4)

    if ftype == "difference":
        mult = float(cfg.get("multiplier", 1.0))
        a    = _avg(_metric_vals(rows, cfg["metric_a"]))
        b    = _avg(_metric_vals(rows, cfg["metric_b"]))
        return round((a - b) * mult, 4)

    if ftype == "growth":
        metric  = cfg["metric"]
        prev_s  = start - timedelta(days=window)
        prev_e  = start - timedelta(days=1)
        cur_rows  = rows
        prev_rows = _fetch_rows(db, prev_s, prev_e)
        cur_avg   = _avg(_metric_vals(cur_rows,  metric))
        prev_avg  = _avg(_metric_vals(prev_rows, metric))
        if prev_avg == 0:
            return None
        return round((cur_avg - prev_avg) / prev_avg * 100, 2)

    if ftype == "compound":
        total = 0.0
        for comp in cfg.get("components", []):
            w   = float(comp.get("weight", 1.0))
            agg = comp.get("aggregation", "avg")
            vals = _metric_vals(rows, comp["metric"])
            total += ((_sum(vals) if agg == "sum" else _avg(vals)) * w)
        return round(total, 4)

    return None


def _fmt(value: Optional[float], unit: str) -> str:
    if value is None:
        return "–"
    if unit == "€":
        return f"{value:,.2f} €"
    if unit == "%":
        return f"{value:.2f}%"
    if unit == "#":
        return f"{int(round(value)):,}"
    return f"{value:,.4f}".rstrip("0").rstrip(".")


def _status(value: Optional[float], kpi: CustomKPI) -> str:
    if value is None:
        return "no_data"
    ab = getattr(kpi, "alert_below", None)
    aa = getattr(kpi, "alert_above", None)
    if ab is not None and value < float(ab):
        return "alert"
    if aa is not None and value > float(aa):
        return "alert"
    t = getattr(kpi, "target", None)
    if t is not None and float(t) > 0:
        pct = value / float(t) * 100
        if pct < 70:
            return "warning"
    return "ok"


def _to_result(kpi: CustomKPI, db: Session) -> KPIValueResult:
    window  = int(getattr(kpi, "window_days") or 30)
    today   = date.today()
    value   = _compute(kpi, db)
    unit    = str(getattr(kpi, "unit") or "")
    t       = getattr(kpi, "target", None)
    t_pct   = None
    if t is not None and float(t) > 0 and value is not None:
        t_pct = round(value / float(t) * 100, 1)

    return KPIValueResult(
        id=int(getattr(kpi, "id")),
        name=str(getattr(kpi, "name")),
        description=str(getattr(kpi, "description")) if getattr(kpi, "description") else None,
        formula_type=str(getattr(kpi, "formula_type")),
        unit=unit,
        value=value,
        value_fmt=_fmt(value, unit),
        target=float(t) if t is not None else None,
        target_pct=t_pct,
        status=_status(value, kpi),
        alert_below=float(getattr(kpi, "alert_below")) if getattr(kpi, "alert_below") is not None else None,
        alert_above=float(getattr(kpi, "alert_above")) if getattr(kpi, "alert_above") is not None else None,
        window_days=window,
        period_start=str(today - timedelta(days=window - 1)),
        period_end=str(today),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=KPIValueResult)
def create_kpi(
    body: KPICreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Neuen Custom KPI definieren und sofort berechnen."""
    kpi = CustomKPI(
        name=body.name,
        description=body.description,
        formula_type=body.formula_type,
        formula_config=json.dumps(body.formula_config),
        unit=body.unit,
        target=body.target,
        alert_below=body.alert_below,
        alert_above=body.alert_above,
        window_days=body.window_days,
        sort_order=body.sort_order,
    )
    db.add(kpi)
    db.commit()
    db.refresh(kpi)
    return _to_result(kpi, db)


@router.get("", response_model=list[KPIValueResult])
def list_kpis(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alle Custom KPIs auflisten, live berechnet."""
    q = db.query(CustomKPI)
    if active_only:
        q = q.filter(CustomKPI.is_active == True)   # noqa: E712
    kpis = q.order_by(CustomKPI.sort_order, CustomKPI.created_at).all()
    return [_to_result(k, db) for k in kpis]


@router.get("/templates")
def get_templates(current_user: User = Depends(get_current_user)):
    """Vordefinierte Formel-Vorlagen für gängige KPIs."""
    return [
        {
            "key":          "arpu",
            "name":         "ARPU – Ø Umsatz pro Besucher",
            "formula_type": "ratio",
            "formula_config": {"numerator": "revenue", "denominator": "traffic", "multiplier": 1.0},
            "unit": "€",
            "description": "Average Revenue Per User: Umsatz / Traffic",
        },
        {
            "key":          "conversion_rate",
            "name":         "Eigene Conversion Rate",
            "formula_type": "ratio",
            "formula_config": {"numerator": "conversions", "denominator": "traffic", "multiplier": 100.0},
            "unit": "%",
            "description": "Conversions / Traffic × 100",
        },
        {
            "key":          "revenue_growth",
            "name":         "Umsatz-Wachstum MoM",
            "formula_type": "growth",
            "formula_config": {"metric": "revenue", "window_days": 30},
            "unit": "%",
            "description": "Prozentualer Umsatzanstieg ggü. Vorperiode",
        },
        {
            "key":          "new_customer_rate",
            "name":         "Neukundenrate",
            "formula_type": "ratio",
            "formula_config": {"numerator": "new_customers", "denominator": "traffic", "multiplier": 100.0},
            "unit": "%",
            "description": "Neue Kunden / Traffic × 100",
        },
        {
            "key":          "revenue_per_conversion",
            "name":         "Ø Umsatz pro Conversion",
            "formula_type": "ratio",
            "formula_config": {"numerator": "revenue", "denominator": "conversions", "multiplier": 1.0},
            "unit": "€",
            "description": "Durchschnittlicher Bestellwert",
        },
        {
            "key":          "traffic_growth",
            "name":         "Traffic-Wachstum MoM",
            "formula_type": "growth",
            "formula_config": {"metric": "traffic", "window_days": 30},
            "unit": "%",
            "description": "Traffic-Wachstum ggü. Vorperiode",
        },
        {
            "key":          "total_revenue",
            "name":         "Gesamtumsatz (Zeitraum)",
            "formula_type": "simple",
            "formula_config": {"metric": "revenue", "aggregation": "sum"},
            "unit": "€",
            "description": "Summe des Umsatzes im gewählten Zeitfenster",
        },
    ]


@router.get("/{kpi_id}", response_model=KPIValueResult)
def get_kpi(
    kpi_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kpi = db.query(CustomKPI).filter(CustomKPI.id == kpi_id).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI nicht gefunden.")
    return _to_result(kpi, db)


@router.get("/{kpi_id}/history")
def get_kpi_history(
    kpi_id: int,
    points: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Historische KPI-Werte: rollierende Berechnung für die letzten `points` Tage.
    Jeder Punkt = KPI-Wert wenn das Fenster an diesem Tag endet.
    """
    kpi = db.query(CustomKPI).filter(CustomKPI.id == kpi_id).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI nicht gefunden.")

    window = int(getattr(kpi, "window_days") or 30)
    today  = date.today()
    series = []

    for i in range(points - 1, -1, -1):
        end_date   = today - timedelta(days=i)
        start_date = end_date - timedelta(days=window - 1)
        rows       = _fetch_rows(db, start_date, end_date)

        # Temporäre KPI-Kopie mit verschobenem Fenster
        class _TmpKPI:
            pass
        tmp = _TmpKPI()
        for attr in ("formula_type", "formula_config", "window_days",
                     "alert_below", "alert_above", "target"):
            setattr(tmp, attr, getattr(kpi, attr))

        # Direkt berechnen statt _compute aufrufen (um end_date zu überschreiben)
        cfg   = json.loads(str(getattr(kpi, "formula_config")))
        ftype = str(getattr(kpi, "formula_type"))
        value: Optional[float] = None

        if rows:
            if ftype == "simple":
                agg  = cfg.get("aggregation", "avg")
                vals = _metric_vals(rows, cfg["metric"])
                value = round(_sum(vals) if agg == "sum" else _avg(vals), 4)
            elif ftype == "ratio":
                mult = float(cfg.get("multiplier", 1.0))
                num  = _avg(_metric_vals(rows, cfg["numerator"]))
                den  = _avg(_metric_vals(rows, cfg["denominator"]))
                value = round(num / den * mult, 4) if den else None
            elif ftype == "difference":
                mult  = float(cfg.get("multiplier", 1.0))
                value = round((_avg(_metric_vals(rows, cfg["metric_a"])) -
                               _avg(_metric_vals(rows, cfg["metric_b"]))) * mult, 4)
            elif ftype == "growth":
                prev_rows = _fetch_rows(db,
                    start_date - timedelta(days=window),
                    start_date - timedelta(days=1))
                ca = _avg(_metric_vals(rows,      cfg["metric"]))
                pa = _avg(_metric_vals(prev_rows, cfg["metric"]))
                value = round((ca - pa) / pa * 100, 2) if pa else None
            elif ftype == "compound":
                total = 0.0
                for comp in cfg.get("components", []):
                    w    = float(comp.get("weight", 1.0))
                    agg  = comp.get("aggregation", "avg")
                    vals = _metric_vals(rows, comp["metric"])
                    total += ((_sum(vals) if agg == "sum" else _avg(vals)) * w)
                value = round(total, 4)

        series.append({"date": str(end_date), "value": value})

    return {"kpi_id": kpi_id, "window_days": window, "series": series}


@router.patch("/{kpi_id}", response_model=KPIValueResult)
def update_kpi(
    kpi_id: int,
    body: KPIUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kpi = db.query(CustomKPI).filter(CustomKPI.id == kpi_id).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI nicht gefunden.")

    updates = body.model_dump(exclude_unset=True)

    # formula_type + formula_config zusammen validieren
    new_type   = updates.get("formula_type", str(getattr(kpi, "formula_type")))
    new_config = updates.get("formula_config")
    if new_config is not None:
        _validate_config(new_type, new_config)
        updates["formula_config"] = json.dumps(new_config)

    for field, val in updates.items():
        setattr(kpi, field, val)
    setattr(kpi, "updated_at", datetime.utcnow())
    db.commit()
    db.refresh(kpi)
    return _to_result(kpi, db)


@router.delete("/{kpi_id}")
def delete_kpi(
    kpi_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kpi = db.query(CustomKPI).filter(CustomKPI.id == kpi_id).first()
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI nicht gefunden.")
    db.delete(kpi)
    db.commit()
    return {"message": "KPI gelöscht.", "id": kpi_id}
