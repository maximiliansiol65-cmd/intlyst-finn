"""
Schicht 12 — Aktions-Generierung
analytics/action_engine.py

Erzeugt einen priorisierten Aktionsplan aus allen Analytics-Schichten.
Jede Aktion wird nach dem ICE-Framework bewertet:
    ICE = Impact (1–10) × Confidence (1–10) × Ease (1–10)

    Impact     — Wie groß ist der erwartete Effekt auf Umsatz / Wachstum?
    Confidence — Wie sicher sind wir statistisch?
    Ease       — Wie schnell/einfach ist die Umsetzung?

Aktionsquellen:
  • ProactiveAlerts (Schicht 10) → dringende Aktionen
  • Social Analytics (Schicht 8) → Content, Posting, Hashtags
  • Forecast (Schicht 6)         → Ziel-Sprints, Promotionen
  • Causality (Schicht 4)        → Kausalitäts-basierte Hebel
  • Statistics (Schicht 2)       → Momentum nutzen
  • Timeseries (Schicht 3)       → Wochentag-Optimierung
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Datenstrukturen
# ---------------------------------------------------------------------------

@dataclass
class ActionItem:
    """Eine konkrete Maßnahme mit ICE-Score."""

    title:            str
    description:      str
    category:         str    # "content" | "marketing" | "product" | "pricing" | "operations" | "technical"
    impact_score:     int    # 1–10
    confidence_score: int    # 1–10
    ease_score:       int    # 1–10
    ice_score:        int    # impact × confidence × ease
    source_layer:     str    # Welche Analytics-Schicht hat das ausgelöst
    expected_outcome: str    # Was wird es bringen?
    time_to_implement: str   # "immediate" | "1-3 Tage" | "1 Woche" | "1 Monat"
    priority:         int    # Rang im Plan (1 = höchste Priorität)

    def to_dict(self) -> dict:
        return {
            "priority":          self.priority,
            "title":             self.title,
            "description":       self.description,
            "category":          self.category,
            "impact":            self.impact_score,
            "confidence":        self.confidence_score,
            "ease":              self.ease_score,
            "ice_score":         self.ice_score,
            "source_layer":      self.source_layer,
            "expected_outcome":  self.expected_outcome,
            "time_to_implement": self.time_to_implement,
        }


@dataclass
class ActionPlan:
    """Vollständiger priorisierter Aktionsplan."""
    actions:         list[ActionItem]
    top_action:      Optional[ActionItem]
    total_actions:   int
    generated_at:    str
    summary:         str


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _ice(impact: int, confidence: int, ease: int) -> int:
    return impact * confidence * ease


def _safe(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Aktionsgeneratoren
# ---------------------------------------------------------------------------

def _actions_from_alerts(alerts: list[Any]) -> list[ActionItem]:
    """Generiert dringende Aktionen direkt aus ProactiveAlerts."""
    items: list[ActionItem] = []

    for alert in alerts:
        sev = getattr(alert, "severity", "info")
        if sev not in ("critical", "warning"):
            continue

        # ICE-Scores nach Severity
        if sev == "critical":
            impact, confidence, ease = 9, 8, 7
        else:
            impact, confidence, ease = 7, 7, 6

        category_map = {
            "revenue":    "marketing",
            "traffic":    "marketing",
            "conversion": "product",
            "forecast":   "marketing",
            "goal":       "operations",
            "social":     "content",
            "timeseries": "operations",
            "tasks":      "operations",
        }

        items.append(ActionItem(
            title=getattr(alert, "recommended_action", "Sofortmaßnahme ergreifen"),
            description=getattr(alert, "description", ""),
            category=category_map.get(getattr(alert, "category", ""), "operations"),
            impact_score=impact,
            confidence_score=confidence,
            ease_score=ease,
            ice_score=_ice(impact, confidence, ease),
            source_layer="Schicht 10 (Proaktive Erkennung)",
            expected_outcome=f"Behebung von: {getattr(alert, 'title', '')}",
            time_to_implement="immediate" if sev == "critical" else "1-3 Tage",
            priority=0,   # wird später vergeben
        ))

    return items


def _actions_from_social(social_bundle: Any) -> list[ActionItem]:
    items: list[ActionItem] = []
    try:
        ig = social_bundle.instagram
        if ig and ig.has_sufficient_data:

            # 1. Bester Content-Typ
            if ig.best_content_type_multiplier >= 1.5:
                conf = min(9, int(ig.best_content_type_multiplier * 3))
                items.append(ActionItem(
                    title=f"Mehr {ig.best_content_type} produzieren",
                    description=(
                        f"{ig.best_content_type} liefern {ig.best_content_type_multiplier:.1f}× den "
                        f"durchschnittlichen Reach ({ig.avg_reach:,.0f}). "
                        f"Format-Mix in Richtung {ig.best_content_type} verschieben."
                    ),
                    category="content",
                    impact_score=min(9, int(ig.best_content_type_multiplier * 2)),
                    confidence_score=conf,
                    ease_score=7,
                    ice_score=_ice(min(9, int(ig.best_content_type_multiplier * 2)), conf, 7),
                    source_layer="Schicht 8 (Social Analytics)",
                    expected_outcome=f"+{(ig.best_content_type_multiplier - 1) * 100:.0f}% Reach pro Post",
                    time_to_implement="1 Woche",
                    priority=0,
                ))

            # 2. Posting-Zeitpunkt
            slot = ig.heatmap.best_slot_description
            if slot and slot != "N/A":
                items.append(ActionItem(
                    title=f"Posts auf {slot} verschieben",
                    description=(
                        f"Engagement-Heatmap zeigt höchste Interaktionsrate am {slot}. "
                        f"Aktuelle Frequenz: {ig.posting_frequency_per_week:.1f}×/Woche."
                    ),
                    category="content",
                    impact_score=4, confidence_score=6, ease_score=9,
                    ice_score=_ice(4, 6, 9),
                    source_layer="Schicht 8 (Social Analytics)",
                    expected_outcome="+10–20% Engagement durch optimales Timing",
                    time_to_implement="immediate",
                    priority=0,
                ))

            # 3. Top-Hashtags
            good_tags = [h for h in ig.top_hashtags if h.avg_reach_lift >= 1.3][:3]
            if good_tags:
                tags_str = " ".join(f"#{t.hashtag}" for t in good_tags)
                lift = max(t.avg_reach_lift for t in good_tags)
                items.append(ActionItem(
                    title=f"Top-Hashtags einsetzen: {tags_str}",
                    description=(
                        f"Diese Hashtags erhöhen den Reach um {(lift - 1) * 100:.0f}%+. "
                        f"In die nächsten 5 Posts aufnehmen."
                    ),
                    category="content",
                    impact_score=3, confidence_score=6, ease_score=10,
                    ice_score=_ice(3, 6, 10),
                    source_layer="Schicht 8 (Social Analytics)",
                    expected_outcome=f"+{(lift - 1) * 100:.0f}% organische Reichweite",
                    time_to_implement="immediate",
                    priority=0,
                ))

    except Exception:
        pass

    # TikTok-Aktionen
    try:
        tt = social_bundle.tiktok
        if tt and tt.has_sufficient_data:
            if tt.avg_completion_rate < 40:
                items.append(ActionItem(
                    title="TikTok-Video-Hooks verbessern",
                    description=(
                        f"Durchschnittliche Completion Rate: {tt.avg_completion_rate:.0f}% (Benchmark: 50–60%). "
                        "Erste 3 Sekunden überarbeiten — sofortiger Hook erforderlich."
                    ),
                    category="content",
                    impact_score=6, confidence_score=7, ease_score=6,
                    ice_score=_ice(6, 7, 6),
                    source_layer="Schicht 8 (Social Analytics)",
                    expected_outcome="+15% Completion Rate → mehr Algorithmus-Sichtbarkeit",
                    time_to_implement="1-3 Tage",
                    priority=0,
                ))
    except Exception:
        pass

    # Attribution
    try:
        att = social_bundle.attribution
        if att and att.is_significant:
            lift_info = f"+{att.revenue_lift_estimate:.2f}€/1.000 Reach" if att.revenue_lift_estimate > 0 else "messbarer Umsatz-Lift"
            conf = min(9, max(5, int((1 - att.p_value) * 10)))
            items.append(ActionItem(
                title=f"{att.platform.capitalize()} Reichweite um 30% skalieren",
                description=(
                    f"Granger-Test (p={att.p_value:.3f}) beweist: {att.platform} Reach "
                    f"beeinflusst Revenue nach {att.optimal_lag_days}d. Stärke: {att.strength}."
                ),
                category="marketing",
                impact_score=8, confidence_score=conf, ease_score=6,
                ice_score=_ice(8, conf, 6),
                source_layer="Schicht 8 (Social Analytics)",
                expected_outcome=f"Prognostiziert: {lift_info}",
                time_to_implement="1 Woche",
                priority=0,
            ))
    except Exception:
        pass

    return items


def _actions_from_forecast(forecast_bundle: Any) -> list[ActionItem]:
    items: list[ActionItem] = []
    try:
        mp = forecast_bundle.revenue.month_projection
        if mp is None:
            return items

        if mp.status in ("behind", "at_risk"):
            feasibility = max(1, min(9, int(mp.feasibility_pct / 10)))
            items.append(ActionItem(
                title=f"Flash-Sale starten — Lücke {abs(mp.gap):,.0f}€ schließen",
                description=(
                    f"Monatsziel: {mp.target:,.0f}€ | Aktuell: {mp.current_month_to_date:,.0f}€ | "
                    f"Noch {mp.days_remaining}d → {mp.daily_needed:,.0f}€/Tag nötig."
                ),
                category="marketing",
                impact_score=9, confidence_score=feasibility, ease_score=5,
                ice_score=_ice(9, feasibility, 5),
                source_layer="Schicht 6 (Forecast)",
                expected_outcome=f"Ziel {mp.target:,.0f}€ bis Monatsende erreichbar",
                time_to_implement="1-3 Tage",
                priority=0,
            ))
    except Exception:
        pass
    return items


def _actions_from_causality(causality_bundle: Any) -> list[ActionItem]:
    items: list[ActionItem] = []
    try:
        for gr in causality_bundle.granger_results:
            if not gr.is_significant:
                continue
            conf = min(9, max(4, int((1 - gr.p_value) * 10)))
            # Welche Metrik ist die Ursache?
            cause_actions = {
                "traffic":         ("Traffic erhöhen (+20%)", "marketing", 7, 8),
                "conversion_rate": ("Conversion Rate optimieren", "product", 8, 7),
                "new_customers":   ("Neukundengewinnung steigern", "marketing", 8, 6),
            }
            cause = gr.cause.lower()
            if cause in cause_actions:
                title, cat, impact, ease = cause_actions[cause]
                items.append(ActionItem(
                    title=f"{title} → {gr.effect} steigt in {gr.optimal_lag} Tagen",
                    description=(
                        f"Granger-Kausalität ({gr.strength}): {gr.description}"
                    ),
                    category=cat,
                    impact_score=impact, confidence_score=conf, ease_score=ease,
                    ice_score=_ice(impact, conf, ease),
                    source_layer="Schicht 4 (Kausalitätsanalyse)",
                    expected_outcome=f"{gr.implied_chain} ({gr.strength})",
                    time_to_implement="1 Woche",
                    priority=0,
                ))
    except Exception:
        pass
    return items


def _actions_from_statistics(stats_bundle: Any) -> list[ActionItem]:
    items: list[ActionItem] = []
    try:
        rev = stats_bundle.revenue
        m7 = _safe(rev.momentum_7d)

        if m7 >= 15:
            items.append(ActionItem(
                title="Wachstums-Momentum nutzen (+{:.0f}% in 7d)".format(m7),
                description=(
                    f"Umsatz-Momentum der letzten 7 Tage: +{m7:.1f}%. "
                    "Jetzt Marketingbudget erhöhen, um den Trend zu verlängern."
                ),
                category="marketing",
                impact_score=7, confidence_score=7, ease_score=7,
                ice_score=_ice(7, 7, 7),
                source_layer="Schicht 2 (Statistik)",
                expected_outcome="+5–15% Umsatz durch Momentum-Verlängerung",
                time_to_implement="immediate",
                priority=0,
            ))

        # Bester Wochentag
        best_wd = getattr(rev, "best_weekday", None)
        if best_wd:
            items.append(ActionItem(
                title=f"{best_wd} als Haupt-Push-Tag nutzen",
                description=(
                    f"{best_wd} ist statistisch der stärkste Umsatztag. "
                    "Aktionen, E-Mails und Social Posts auf diesen Tag konzentrieren."
                ),
                category="operations",
                impact_score=4, confidence_score=6, ease_score=8,
                ice_score=_ice(4, 6, 8),
                source_layer="Schicht 2 (Statistik)",
                expected_outcome="+5–10% Effektivität durch Timing-Optimierung",
                time_to_implement="immediate",
                priority=0,
            ))
    except Exception:
        pass
    return items


def _actions_from_timeseries(ts_bundle: Any) -> list[ActionItem]:
    items: list[ActionItem] = []
    try:
        rev_ts = ts_bundle.revenue
        if hasattr(rev_ts, "weekday_breakdown") and rev_ts.weekday_breakdown:
            # Top weekday by average value
            wd = rev_ts.weekday_breakdown
            best = max(wd, key=lambda x: getattr(x, "mean", 0) if hasattr(x, "mean") else 0)
            if hasattr(best, "weekday_name"):
                items.append(ActionItem(
                    title=f"Aktionen auf {best.weekday_name} konzentrieren",
                    description=(
                        f"Zeitreihenanalyse bestätigt {best.weekday_name} als stärksten Umsatztag "
                        f"(Ø {getattr(best, 'mean', 0):,.0f})."
                    ),
                    category="operations",
                    impact_score=3, confidence_score=7, ease_score=9,
                    ice_score=_ice(3, 7, 9),
                    source_layer="Schicht 3 (Zeitreihe)",
                    expected_outcome="Ressourcen optimal einsetzen",
                    time_to_implement="immediate",
                    priority=0,
                ))
    except Exception:
        pass
    return items


# ---------------------------------------------------------------------------
# Haupt-Funktion
# ---------------------------------------------------------------------------

def generate_action_plan(
    alerts:          Optional[list[Any]] = None,
    stats_bundle:    Any = None,
    ts_bundle:       Any = None,
    forecast_bundle: Any = None,
    causality_bundle: Any = None,
    social_bundle:   Any = None,
    max_actions:     int = 10,
) -> ActionPlan:
    """
    Generiert einen ICE-priorisierten Aktionsplan aus allen Analytics-Schichten.

    Alle Parameter sind optional. Der Plan wird aus verfügbaren Daten erstellt.
    """
    all_items: list[ActionItem] = []

    if alerts:
        all_items += _actions_from_alerts(alerts)
    if forecast_bundle is not None:
        all_items += _actions_from_forecast(forecast_bundle)
    if social_bundle is not None:
        all_items += _actions_from_social(social_bundle)
    if causality_bundle is not None:
        all_items += _actions_from_causality(causality_bundle)
    if stats_bundle is not None:
        all_items += _actions_from_statistics(stats_bundle)
    if ts_bundle is not None:
        all_items += _actions_from_timeseries(ts_bundle)

    # Deduplizierung: gleiche Kategorie + ähnlicher Titel → nur höchsten ICE behalten
    seen_categories: dict[str, ActionItem] = {}
    unique: list[ActionItem] = []
    for item in sorted(all_items, key=lambda x: x.ice_score, reverse=True):
        key = f"{item.category}_{item.title[:20]}"
        if key not in seen_categories:
            seen_categories[key] = item
            unique.append(item)
        if len(unique) >= max_actions:
            break

    # Prioritäten vergeben
    for i, item in enumerate(unique):
        item.priority = i + 1

    top = unique[0] if unique else None
    n = len(unique)

    if n == 0:
        summary = "Keine Aktionen identifiziert — alle Metriken im Normalbereich."
    elif top:
        summary = f"Top-Aktion: {top.title} (ICE: {top.ice_score})"
    else:
        summary = f"{n} priorisierte Aktionen"

    return ActionPlan(
        actions=unique,
        top_action=top,
        total_actions=n,
        generated_at=datetime.utcnow().isoformat(),
        summary=summary,
    )


def build_action_context(plan: ActionPlan) -> str:
    """Formatiert den ActionPlan als KI-lesbaren Kontext-Block."""
    if not plan.actions:
        return ""

    lines = [
        "=== SCHICHT 12: AKTIONSPLAN (ICE-PRIORISIERT) ===",
        f"Top-Aktion: {plan.summary}",
        "",
    ]

    for a in plan.actions[:7]:
        lines.append(
            f"#{a.priority} [{a.ice_score:4d} ICE | I{a.impact_score}·C{a.confidence_score}·E{a.ease_score}] "
            f"[{a.category.upper()}] {a.title}"
        )
        lines.append(f"   {a.description}")
        lines.append(f"   Erwartetes Ergebnis: {a.expected_outcome} | Umsetzung: {a.time_to_implement}")

    return "\n".join(lines)
