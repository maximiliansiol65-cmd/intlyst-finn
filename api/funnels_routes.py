"""
Funnel-Builder: Conversion-Funnels mit beliebig vielen Schritten definieren,
Besucherzahlen tracken und Drop-offs analysieren.
"""
import json
import logging
import os
from datetime import datetime
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from database import engine, get_db
from models.funnel import Funnel, FunnelStep
from models.base import Base
from api.auth_routes import User, get_current_user
from security_config import is_configured_secret

Base.metadata.create_all(bind=engine)

router = APIRouter(prefix="/api/funnels", tags=["funnels"])
logger = logging.getLogger(__name__)

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL   = "claude-sonnet-4-20250514"


# ── Schemas ──────────────────────────────────────────────────────────────────

class StepIn(BaseModel):
    name:          str
    description:   Optional[str]  = None
    order:         Optional[int]  = None
    visitors:      int            = 0
    conversions:   int            = 0
    expected_rate: Optional[float] = None


class StepUpdate(BaseModel):
    name:          Optional[str]   = None
    description:   Optional[str]   = None
    order:         Optional[int]   = None
    visitors:      Optional[int]   = None
    conversions:   Optional[int]   = None
    expected_rate: Optional[float] = None


class FunnelIn(BaseModel):
    name:        str
    description: Optional[str]        = None
    steps:       list[StepIn]         = Field(default_factory=list)


class FunnelUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    status:      Optional[Literal["active", "archived"]] = None


class StepOut(BaseModel):
    id:              int
    funnel_id:       int
    order:           int
    name:            str
    description:     Optional[str]
    visitors:        int
    conversions:     int
    conversion_rate: float    # %
    drop_off_count:  int
    drop_off_rate:   float    # %
    expected_rate:   Optional[float]
    vs_expected:     Optional[float]  # Differenz zur Ziel-Rate in %-Punkten


class FunnelAnalysis(BaseModel):
    id:                    int
    name:                  str
    description:           Optional[str]
    status:                str
    created_at:            str
    steps:                 list[StepOut]
    overall_conversion:    float       # Gesamtkonversionsrate (Step1 → letzter Step)
    total_visitors:        int
    total_drop_offs:       int
    bottleneck_step:       Optional[str]    # Schritt mit dem größten Drop-off
    bottleneck_rate:       Optional[float]
    ai_insight:            Optional[str]


class FunnelMeta(BaseModel):
    id:                 int
    name:               str
    description:        Optional[str]
    status:             str
    steps_count:        int
    overall_conversion: float
    created_at:         str


# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

def _calc_step(step: FunnelStep, next_visitors: Optional[int] = None) -> StepOut:
    vis  = max(int(getattr(step, "visitors", 0)), 0)
    conv = max(int(getattr(step, "conversions", 0)), 0)
    conv = min(conv, vis)   # kann nie höher als visitors sein

    cr     = round(conv / vis * 100, 1) if vis > 0 else 0.0
    drop   = vis - conv
    drop_r = round(drop / vis * 100, 1) if vis > 0 else 0.0

    exp    = getattr(step, "expected_rate", None)
    vs_exp = round(cr - float(exp), 1) if exp is not None else None

    return StepOut(
        id=int(getattr(step, "id")),
        funnel_id=int(getattr(step, "funnel_id")),
        order=int(getattr(step, "order")),
        name=str(getattr(step, "name")),
        description=str(getattr(step, "description")) if getattr(step, "description") else None,
        visitors=vis,
        conversions=conv,
        conversion_rate=cr,
        drop_off_count=drop,
        drop_off_rate=drop_r,
        expected_rate=float(exp) if exp is not None else None,
        vs_expected=vs_exp,
    )


def _analyze(funnel: Funnel, steps: list[FunnelStep]) -> FunnelAnalysis:
    sorted_steps = sorted(steps, key=lambda s: getattr(s, "order", 0))
    step_outs = [_calc_step(s) for s in sorted_steps]

    first_vis  = step_outs[0].visitors if step_outs else 0
    last_conv  = step_outs[-1].conversions if step_outs else 0
    overall_cr = round(last_conv / first_vis * 100, 1) if first_vis > 0 else 0.0

    total_vis   = first_vis
    total_drops = sum(s.drop_off_count for s in step_outs)

    # Bottleneck = Schritt mit der niedrigsten Conversion-Rate (ohne letzte Stufe)
    bottleneck = None
    bottleneck_rate = None
    if len(step_outs) > 1:
        candidates = step_outs[:-1]  # letzte Stufe ausschließen
        worst = min(candidates, key=lambda s: s.conversion_rate)
        if worst.visitors > 0:
            bottleneck      = worst.name
            bottleneck_rate = worst.conversion_rate

    return FunnelAnalysis(
        id=int(getattr(funnel, "id")),
        name=str(getattr(funnel, "name")),
        description=str(getattr(funnel, "description")) if getattr(funnel, "description") else None,
        status=str(getattr(funnel, "status", "active")),
        created_at=str(getattr(funnel, "created_at")),
        steps=step_outs,
        overall_conversion=overall_cr,
        total_visitors=total_vis,
        total_drop_offs=total_drops,
        bottleneck_step=bottleneck,
        bottleneck_rate=bottleneck_rate,
        ai_insight=None,
    )


async def _ai_insight(analysis: FunnelAnalysis) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not is_configured_secret(api_key, prefixes=("sk-ant-",), min_length=20):
        return None  # type: ignore[return-value]

    steps_text = "\n".join(
        f"  Schritt {i+1} '{s.name}': {s.visitors} Besucher → {s.conversions} Conversions "
        f"({s.conversion_rate:.1f}%{', Bottleneck' if s.name == analysis.bottleneck_step else ''})"
        for i, s in enumerate(analysis.steps)
    )

    prompt = (
        f"Analysiere diesen Conversion-Funnel auf Deutsch in 3-4 prägnanten Sätzen. "
        f"Nenne den größten Optimierungshebel und eine konkrete Maßnahme.\n\n"
        f"Funnel: {analysis.name}\n"
        f"Gesamt-Conversion: {analysis.overall_conversion:.1f}%\n"
        f"Schritte:\n{steps_text}"
    )

    try:
        async with httpx.AsyncClient(timeout=20) as c:
            res = await c.post(
                CLAUDE_API_URL,
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": CLAUDE_MODEL, "max_tokens": 250,
                      "messages": [{"role": "user", "content": prompt}]},
            )
        if res.status_code == 200:
            return res.json()["content"][0]["text"].strip()
    except Exception as exc:
        logger.warning("Claude API Funnel: %s", exc)
    return None  # type: ignore[return-value]


# ── Endpunkte ─────────────────────────────────────────────────────────────────

@router.post("", response_model=FunnelAnalysis)
async def create_funnel(
    body: FunnelIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Neuen Funnel mit optionalen Schritten anlegen."""
    funnel = Funnel(name=body.name, description=body.description)
    db.add(funnel)
    db.flush()  # ID erzeugen

    for i, step in enumerate(body.steps):
        db.add(FunnelStep(
            funnel_id=funnel.id,
            order=step.order if step.order is not None else i + 1,
            name=step.name,
            description=step.description,
            visitors=step.visitors,
            conversions=step.conversions,
            expected_rate=step.expected_rate,
        ))

    db.commit()
    db.refresh(funnel)
    steps = db.query(FunnelStep).filter(FunnelStep.funnel_id == funnel.id).all()
    analysis = _analyze(funnel, steps)
    return analysis


@router.get("", response_model=list[FunnelMeta])
def list_funnels(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Funnel)
    if status:
        q = q.filter(Funnel.status == status)
    funnels = q.order_by(desc(Funnel.created_at)).all()

    result = []
    for f in funnels:
        steps = db.query(FunnelStep).filter(FunnelStep.funnel_id == f.id).order_by(asc(FunnelStep.order)).all()
        a = _analyze(f, steps)
        result.append(FunnelMeta(
            id=a.id, name=a.name, description=a.description, status=a.status,
            steps_count=len(steps),
            overall_conversion=a.overall_conversion,
            created_at=a.created_at,
        ))
    return result


@router.get("/{funnel_id}", response_model=FunnelAnalysis)
async def get_funnel(
    funnel_id: int,
    with_ai: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detailansicht mit Schritt-Analyse. ?with_ai=true für KI-Empfehlung."""
    funnel = db.query(Funnel).filter(Funnel.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel nicht gefunden.")

    steps    = db.query(FunnelStep).filter(FunnelStep.funnel_id == funnel_id).order_by(asc(FunnelStep.order)).all()
    analysis = _analyze(funnel, steps)

    if with_ai:
        analysis.ai_insight = await _ai_insight(analysis)

    return analysis


@router.patch("/{funnel_id}", response_model=FunnelMeta)
def update_funnel(
    funnel_id: int,
    body: FunnelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    funnel = db.query(Funnel).filter(Funnel.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel nicht gefunden.")

    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(funnel, field, val)
    setattr(funnel, "updated_at", datetime.utcnow())
    db.commit()
    db.refresh(funnel)

    steps = db.query(FunnelStep).filter(FunnelStep.funnel_id == funnel_id).order_by(asc(FunnelStep.order)).all()
    a = _analyze(funnel, steps)
    return FunnelMeta(id=a.id, name=a.name, description=a.description, status=a.status,
                      steps_count=len(steps), overall_conversion=a.overall_conversion, created_at=a.created_at)


@router.delete("/{funnel_id}")
def delete_funnel(
    funnel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    funnel = db.query(Funnel).filter(Funnel.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel nicht gefunden.")
    db.query(FunnelStep).filter(FunnelStep.funnel_id == funnel_id).delete()
    db.delete(funnel)
    db.commit()
    return {"message": "Funnel gelöscht.", "id": funnel_id}


# ── Schritt-Endpunkte ─────────────────────────────────────────────────────────

@router.post("/{funnel_id}/steps", response_model=StepOut)
def add_step(
    funnel_id: int,
    body: StepIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    funnel = db.query(Funnel).filter(Funnel.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel nicht gefunden.")

    # Automatische Reihenfolge wenn nicht angegeben
    if body.order is None:
        max_order = db.query(FunnelStep).filter(FunnelStep.funnel_id == funnel_id).count()
        body_order = max_order + 1
    else:
        body_order = body.order

    step = FunnelStep(
        funnel_id=funnel_id,
        order=body_order,
        name=body.name,
        description=body.description,
        visitors=body.visitors,
        conversions=body.conversions,
        expected_rate=body.expected_rate,
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return _calc_step(step)


@router.patch("/{funnel_id}/steps/{step_id}", response_model=StepOut)
def update_step(
    funnel_id: int,
    step_id: int,
    body: StepUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    step = db.query(FunnelStep).filter(
        FunnelStep.id == step_id, FunnelStep.funnel_id == funnel_id
    ).first()
    if not step:
        raise HTTPException(status_code=404, detail="Schritt nicht gefunden.")

    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(step, field, val)
    db.commit()
    db.refresh(step)
    return _calc_step(step)


@router.delete("/{funnel_id}/steps/{step_id}")
def delete_step(
    funnel_id: int,
    step_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    step = db.query(FunnelStep).filter(
        FunnelStep.id == step_id, FunnelStep.funnel_id == funnel_id
    ).first()
    if not step:
        raise HTTPException(status_code=404, detail="Schritt nicht gefunden.")
    db.delete(step)
    db.commit()
    return {"message": "Schritt gelöscht.", "id": step_id}


# ── Massen-Update (alle Schritte auf einmal) ──────────────────────────────────

@router.put("/{funnel_id}/steps")
def replace_steps(
    funnel_id: int,
    steps: list[StepIn],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ersetzt alle Schritte eines Funnels (praktisch für Bulk-Update)."""
    funnel = db.query(Funnel).filter(Funnel.id == funnel_id).first()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel nicht gefunden.")

    db.query(FunnelStep).filter(FunnelStep.funnel_id == funnel_id).delete()
    for i, step in enumerate(steps):
        db.add(FunnelStep(
            funnel_id=funnel_id,
            order=step.order if step.order is not None else i + 1,
            name=step.name,
            description=step.description,
            visitors=step.visitors,
            conversions=step.conversions,
            expected_rate=step.expected_rate,
        ))
    db.commit()

    new_steps = db.query(FunnelStep).filter(FunnelStep.funnel_id == funnel_id).order_by(asc(FunnelStep.order)).all()
    analysis  = _analyze(funnel, new_steps)
    return analysis
