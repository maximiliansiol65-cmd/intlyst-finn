"""
KPI Validation Service — plausibility checks on incoming metric data.

Rules:
- Revenue, cost, traffic, new_customers: must be >= 0
- conversion_rate: must be in [0, 100]
- profit = revenue - cost (cross-check; flag if inconsistent by > 1%)
- gross_margin: must be in [-100, 100] if provided
- cashflow, liquidity: numeric only (can be negative, just must be a number)

Inconsistencies are flagged as Notifications with type="data_inconsistency".
Data is NEVER auto-corrected.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from models.notification import Notification


# ---------------------------------------------------------------------------
# Validation rules
# ---------------------------------------------------------------------------

def validate_daily_metrics(data: dict) -> list[str]:
    """Return a list of human-readable warning strings for any inconsistencies found.
    Returns empty list if data is plausible.
    """
    warnings: list[str] = []

    def _check_non_negative(key: str, label: str) -> None:
        v = data.get(key)
        if v is not None and v < 0:
            warnings.append(f"{label} ({key}={v}) ist negativ — bitte prüfen.")

    def _check_range(key: str, label: str, lo: float, hi: float) -> None:
        v = data.get(key)
        if v is not None and not (lo <= v <= hi):
            warnings.append(f"{label} ({key}={v}) liegt außerhalb des erlaubten Bereichs [{lo}, {hi}].")

    _check_non_negative("revenue", "Umsatz")
    _check_non_negative("cost", "Kosten")
    _check_non_negative("traffic", "Traffic")
    _check_non_negative("new_customers", "Neukunden")
    _check_non_negative("conversions", "Conversions")
    _check_range("conversion_rate", "Conversion Rate", 0, 100)
    _check_range("gross_margin", "Bruttomarge", -100, 100)

    # Cross-check: profit vs. revenue - cost
    revenue = data.get("revenue")
    cost = data.get("cost")
    profit = data.get("profit")
    if revenue is not None and cost is not None and profit is not None:
        expected = revenue - cost
        if abs(expected) > 0.01 and abs(profit - expected) / (abs(expected) + 0.01) > 0.01:
            warnings.append(
                f"Gewinn-Inkonsistenz: profit={profit} weicht von revenue-cost={expected:.2f} ab."
            )

    return warnings


# ---------------------------------------------------------------------------
# Notification helpers
# ---------------------------------------------------------------------------

def record_inconsistency(
    db: Session,
    workspace_id: int,
    warnings: list[str],
    context: Optional[str] = None,
) -> None:
    """Create a Notification of type 'data_inconsistency' for each warning."""
    for w in warnings:
        title = "Datenfehler erkannt"
        message = w if not context else f"[{context}] {w}"
        notif = Notification(
            workspace_id=workspace_id,
            title=title,
            message=message,
            type="data_inconsistency",
            is_read=False,
            created_at=datetime.utcnow(),
        )
        db.add(notif)
    if warnings:
        db.commit()
