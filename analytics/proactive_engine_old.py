"""
Schicht 10 — Proaktive Erkennung
analytics/proactive_engine.py

Scannt ALLE Analytics-Schichten und erkennt kritische Muster, Chancen
und Risiken — ohne dass der Nutzer explizit danach fragt.

Erkennungsregeln:
 1. Umsatz-Anomalie (Z-Score ≤ −2.0 / −2.5)
 2. Positiver Umsatz-Spike (Z-Score ≥ 2.0)
 3. Traffic-Einbruch (WoW < −20 %)
 4. Conversion Rate unter eigenem Durchschnitt (< −20 %)
 5. Forecast-Risiko (MonthProjection: "behind" | "at_risk")
 6. Ziel-Risiko (on_track=False, < 7 Tage verbleibend)
 7. Social Engagement-Einbruch (Trend "fallend" & change < −20 %)
 8. Social Chance: bester Content-Typ Multiplier > 2×
 9. Social Attribution signifikant (Granger p < 0.05)
10. Struktureller Bruch (Changepoint in letzten 14 Tagen)
11. Überfällige Tasks (tasks_overdue > 0)
12. Positive Momentum-Chance (momentum_7d > +20 %)

Ausgabe: sortierte ProactiveAlert-Liste (critical → warning → opportunity → info)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Datenstrukturen
# ---------------------------------------------------------------------------

_SEVERITY_ORDER = {"critical": 0, "warning": 1, "opportunity": 2, "info": 3}


@dataclass
class ProactiveAlert:
    """Ein proaktiv erkannter Hinweis, eine Chance oder ein Risiko."""

    severity:    str    # "critical" | "warning" | "opportunity" | "info"
    category:    str    # "revenue" | "traffic" | "conversion" | "forecast" |
                        # "goal" | "social" | "timeseries" | "tasks"
    title:       str    # Kurztitel (max. 80 Zeichen)
    description: str    # Erklärung in 1–2 Sätzen
    metric:      str    # Betroffene Metrik
    current_value:   float
    threshold_value: float   # Grenzwert, der ausgelöst hat
    confidence:  int    # 0–100: Statistische Zuverlässigkeit
    recommended_action: str
    urgency:     str    # "immediate" | "today" | "this_week"

    def to_dict(self) -> dict:
        return {
            "severity":           self.severity,
            "category":           self.category,
            "title":              self.title,
            "description":        self.description,
            "metric":             self.metric,
            "current_value":      round(self.current_value, 3),
            "threshold_value":    round(self.threshold_value, 3),
            "confidence":         self.confidence,
            "recommended_action": self.recommended_action,
            "urgency":            self.urgency,
        }


@dataclass
class ProactiveReport:
    """Vollständiger proaktiver Bericht aller erkannten Hinweise."""
    alerts:         list[ProactiveAlert]
    total_critical: int
    total_warning:  int
    total_opportunity: int
    total_info:     int
    generated_at:   str
    summary:        str


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _safe(v: Any, default: float = 0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _pct(v: Any) -> float:
    """Wert als Prozentzahl (z. B. 0.032 → 3.2)."""
    return _safe(v) * 100


# ---------------------------------------------------------------------------
# Erkennungsregeln
# ---------------------------------------------------------------------------

def _check_revenue_anomaly(stats_bundle: Any) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    try:
        rev = stats_bundle.revenue
        z = _safe(rev.latest_z_score)
        wow = _safe(rev.wow_change)

        if z <= -2.5:
            alerts.append(ProactiveAlert(
                severity="critical", category="revenue",
                title="Kritischer Umsatzeinbruch erkannt",
                description=(
                    f"Der heutige Umsatz liegt {abs(z):.1f} Standardabweichungen unter dem Durchschnitt "
                    f"(WoW: {wow:+.1f}%). Das ist statistisch hochsignifikant."
                ),
                metric="revenue", current_value=z, threshold_value=-2.5,
                confidence=min(99, int(abs(z) * 20)), recommended_action="Sofort Ursache prüfen: Checkout-Fehler, Kampagnen, technische Störungen.",
                urgency="immediate",
            ))
        elif z <= -2.0:
            alerts.append(ProactiveAlert(
                severity="warning", category="revenue",
                title="Umsatz unter Normalbereich",
                description=(
                    f"Umsatz-Z-Score: {z:.2f} (WoW: {wow:+.1f}%). "
                    "Möglicherweise ein temporärer Effekt — heute beobachten."
                ),
                metric="revenue", current_value=z, threshold_value=-2.0,
                confidence=min(90, int(abs(z) * 15)), recommended_action="Tagesmetriken stündlich prüfen.",
                urgency="today",
            ))

        if z >= 2.0:
            alerts.append(ProactiveAlert(
                severity="opportunity", category="revenue",
                title="Überdurchschnittlicher Umsatz-Spike",
                description=(
                    f"Umsatz {z:.1f}σ über Durchschnitt (WoW: {wow:+.1f}%). "
                    "Ursache identifizieren und wiederholen."
                ),
                metric="revenue", current_value=z, threshold_value=2.0,
                confidence=min(90, int(z * 15)), recommended_action="Identifiziere, was heute anders war, und skaliere es.",
                urgency="today",
            ))

        if _safe(rev.momentum_7d) >= 20:
            alerts.append(ProactiveAlert(
                severity="opportunity", category="revenue",
                title=f"Starkes Umsatz-Momentum (+{rev.momentum_7d:.1f}% in 7 Tagen)",
                description="Der Umsatz wächst deutlich schneller als üblich. Ideal, um Investitionen zu erhöhen.",
                metric="revenue", current_value=_safe(rev.momentum_7d), threshold_value=20.0,
                confidence=75, recommended_action="Marketingbudget temporär erhöhen, Lagerbestände prüfen.",
                urgency="this_week",
            ))
    except Exception:
        pass
    return alerts


def _check_traffic(stats_bundle: Any) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    try:
        tr = stats_bundle.traffic
        wow = _safe(tr.wow_change)
        if wow <= -20:
            alerts.append(ProactiveAlert(
                severity="warning", category="traffic",
                title=f"Traffic-Einbruch: {wow:.1f}% WoW",
                description=(
                    f"Seitenbesuche sind um {abs(wow):.1f}% gegenüber Vorwoche gesunken. "
                    "Könnte auf Algorithmus-Änderungen, SEO-Probleme oder Kampagnenende hindeuten."
                ),
                metric="traffic", current_value=wow, threshold_value=-20.0,
                confidence=80, recommended_action="Traffic-Quellen prüfen: organisch, bezahlt, direkt, Referral.",
                urgency="today",
            ))
    except Exception:
        pass
    return alerts


def _check_conversion_rate(stats_bundle: Any) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    try:
        cr = stats_bundle.conversion_rate
        vs_avg = _safe(cr.vs_own_average)
        z = _safe(cr.latest_z_score)
        if vs_avg <= -20 or z <= -1.8:
            alerts.append(ProactiveAlert(
                severity="warning", category="conversion",
                title=f"Conversion Rate {abs(vs_avg):.0f}% unter eigenem Durchschnitt",
                description=(
                    f"Aktuelle CR liegt {vs_avg:.1f}% unter dem historischen Durchschnitt (Z={z:.2f}). "
                    "Mögliche Ursachen: neue Besucher-Quelle, geänderte Landing Page, Preis-Erhöhung."
                ),
                metric="conversion_rate", current_value=vs_avg, threshold_value=-20.0,
                confidence=min(90, 50 + int(abs(z) * 15)), recommended_action="Funnel-Drop-off-Analyse starten, Heatmaps prüfen.",
                urgency="today",
            ))
    except Exception:
        pass
    return alerts


def _check_forecast(forecast_bundle: Any) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    try:
        mp = forecast_bundle.revenue.month_projection
        if mp is None:
            return alerts

        if mp.status == "behind":
            sev = "critical" if mp.feasibility_pct < 30 else "warning"
            alerts.append(ProactiveAlert(
                severity=sev, category="forecast",
                title=f"Monatsumsatz-Ziel wird verfehlt (Chance: {mp.feasibility_pct:.0f}%)",
                description=(
                    f"Aktuell {mp.current_month_to_date:,.0f}€ / Ziel {mp.target:,.0f}€ — "
                    f"Lücke {abs(mp.gap):,.0f}€. Benötigt {mp.daily_needed:,.0f}€/Tag "
                    f"für {mp.days_remaining} verbleibende Tage."
                ),
                metric="revenue_month", current_value=mp.current_month_to_date, threshold_value=mp.target,
                confidence=int(mp.feasibility_pct), recommended_action="Flash-Sale oder Promotion starten, Outbound-Aktivierung erhöhen.",
                urgency="immediate" if mp.days_remaining <= 5 else "today",
            ))
        elif mp.status == "at_risk":
            alerts.append(ProactiveAlert(
                severity="warning", category="forecast",
                title=f"Monatsziel gefährdet (Chance: {mp.feasibility_pct:.0f}%)",
                description=(
                    f"Projektion: {mp.projected_month_end:,.0f}€ / Ziel: {mp.target:,.0f}€ — "
                    f"noch {mp.days_remaining} Tage."
                ),
                metric="revenue_month", current_value=mp.projected_month_end, threshold_value=mp.target,
                confidence=int(mp.feasibility_pct), recommended_action="Upsell-Kampagne oder Reaktivierung inaktiver Kunden.",
                urgency="today",
            ))
        elif mp.status == "achieved":
            alerts.append(ProactiveAlert(
                severity="opportunity", category="forecast",
                title="Monatsziel bereits erreicht!",
                description=f"Ziel {mp.target:,.0f}€ übertroffen mit {mp.current_month_to_date:,.0f}€.",
                metric="revenue_month", current_value=mp.current_month_to_date, threshold_value=mp.target,
                confidence=95, recommended_action="Stretch-Goal setzen oder Kapital für nächsten Monat vorarbeiten.",
                urgency="this_week",
            ))
    except Exception:
        pass
    return alerts


def _check_goals(goals: list[dict]) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    today = date.today()
    for goal in goals:
        try:
            if goal.get("on_track"):
                continue
            progress = _safe(goal.get("progress_pct"))
            target   = _safe(goal.get("target"))
            current  = _safe(goal.get("current"))
            metric   = str(goal.get("metric", ""))

            # days_remaining aus Goal (wenn vorhanden)
            days_rem = None
            deadline = goal.get("deadline") or goal.get("end_date")
            if deadline:
                try:
                    if isinstance(deadline, str):
                        dl = date.fromisoformat(deadline)
                    else:
                        dl = deadline
                    days_rem = (dl - today).days
                except Exception:
                    pass

            sev = "critical" if (days_rem is not None and days_rem <= 3) else "warning"
            urgency = "immediate" if sev == "critical" else "today"
            days_info = f" ({days_rem}d verbleibend)" if days_rem is not None else ""

            alerts.append(ProactiveAlert(
                severity=sev, category="goal",
                title=f"Ziel nicht auf Kurs: {metric}{days_info}",
                description=(
                    f"Fortschritt: {progress:.1f}% (aktuell {current:,.1f} / Ziel {target:,.1f}). "
                    "Maßnahmen zur Zielerreichung erforderlich."
                ),
                metric=metric, current_value=current, threshold_value=target,
                confidence=85, recommended_action=f"Sprint-Plan für Ziel '{metric}' erstellen.",
                urgency=urgency,
            ))
        except Exception:
            continue
    return alerts


def _check_social(social_bundle: Any) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    try:
        ig = social_bundle.instagram
        if ig and ig.has_sufficient_data:
            # Engagement-Einbruch
            if ig.engagement_trend == "fallend" and ig.trend_change_pct <= -20:
                alerts.append(ProactiveAlert(
                    severity="warning", category="social",
                    title=f"Instagram Engagement eingebrochen ({ig.trend_change_pct:+.1f}%)",
                    description=(
                        f"Engagement Rate ist von {ig.avg_engagement_rate + abs(ig.trend_change_pct) * ig.avg_engagement_rate / 100:.1f}% "
                        f"auf {ig.avg_engagement_rate:.1f}% gefallen. "
                        "Content-Mix oder Posting-Zeitpunkt überprüfen."
                    ),
                    metric="instagram_er", current_value=ig.avg_engagement_rate,
                    threshold_value=ig.avg_engagement_rate * 1.2,
                    confidence=75, recommended_action=f"Mehr {ig.best_content_type} erstellen und Posting auf {ig.heatmap.best_slot_description} verlagern.",
                    urgency="this_week",
                ))

            # Bester Content-Typ stark über Durchschnitt
            if ig.best_content_type_multiplier >= 2.0:
                alerts.append(ProactiveAlert(
                    severity="opportunity", category="social",
                    title=f"{ig.best_content_type} generieren {ig.best_content_type_multiplier:.1f}× mehr Reach",
                    description=(
                        f"{ig.best_content_type} liefern {ig.best_content_type_multiplier:.1f}× den durchschnittlichen Reach "
                        f"(Ø {ig.avg_reach:,.0f}). Fokus auf diesen Content-Typ erhöhen."
                    ),
                    metric="instagram_content_reach", current_value=ig.best_content_type_multiplier, threshold_value=2.0,
                    confidence=80, recommended_action=f"Nächste 3 Posts als {ig.best_content_type} planen.",
                    urgency="this_week",
                ))

            # Bester Posting-Zeitpunkt
            if ig.heatmap.best_slot_description != "N/A":
                alerts.append(ProactiveAlert(
                    severity="info", category="social",
                    title=f"Bester Posting-Zeitpunkt: {ig.heatmap.best_slot_description}",
                    description=(
                        f"Daten zeigen höchste Engagement Rate am {ig.heatmap.best_slot_description}. "
                        f"Posting-Frequenz aktuell: {ig.posting_frequency_per_week:.1f}×/Woche."
                    ),
                    metric="instagram_timing", current_value=ig.heatmap.best_hour, threshold_value=0,
                    confidence=65, recommended_action=f"Nächsten Post für {ig.heatmap.best_slot_description} planen.",
                    urgency="this_week",
                ))

            # Top-Hashtag mit hohem Lift
            good_tags = [h for h in ig.top_hashtags if h.avg_reach_lift >= 1.4]
            if good_tags:
                best = good_tags[0]
                alerts.append(ProactiveAlert(
                    severity="opportunity", category="social",
                    title=f"#{best.hashtag} steigert Reach um +{(best.avg_reach_lift - 1) * 100:.0f}%",
                    description=(
                        f"Posts mit #{best.hashtag} ({best.post_count} Posts) erreichen "
                        f"{best.avg_reach:.0f} Ø Reach (+{(best.avg_reach_lift - 1) * 100:.0f}% über Durchschnitt)."
                    ),
                    metric="instagram_hashtag", current_value=best.avg_reach_lift, threshold_value=1.4,
                    confidence=70, recommended_action=f"#{best.hashtag} in die nächsten 5 Posts aufnehmen.",
                    urgency="this_week",
                ))
    except Exception:
        pass

    try:
        att = social_bundle.attribution
        if att and att.is_significant:
            alerts.append(ProactiveAlert(
                severity="opportunity", category="social",
                title=f"Social Media beeinflusst Umsatz messbar (p={att.p_value:.3f})",
                description=(
                    f"{att.platform.capitalize()} Reach hat statistisch signifikanten Einfluss auf Revenue "
                    f"mit {att.optimal_lag_days} Tag(en) Verzögerung ({att.strength}). "
                    + (f"Geschätzter Lift: +{att.revenue_lift_estimate:.2f}€/1.000 Reach." if att.revenue_lift_estimate > 0 else "")
                ),
                metric="social_revenue_attribution", current_value=att.p_value, threshold_value=0.05,
                confidence=min(99, int((1 - att.p_value) * 100)),
                recommended_action=f"{att.platform.capitalize()} Reichweite um 20% steigern → direkter Umsatz-Lift erwartet.",
                urgency="this_week",
            ))
    except Exception:
        pass

    return alerts


def _check_timeseries(ts_bundle: Any) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    try:
        today = date.today()
        cutoff = today - timedelta(days=14)

        for metric_name, ts in [
            ("revenue", ts_bundle.revenue),
            ("traffic", ts_bundle.traffic),
            ("conversion_rate", ts_bundle.conversion_rate),
        ]:
            try:
                for cp in ts.changepoints:
                    cp_date = cp.date if isinstance(cp.date, date) else date.fromisoformat(str(cp.date))
                    if cp_date >= cutoff:
                        sev = "warning" if cp.direction == "down" else "info"
                        alerts.append(ProactiveAlert(
                            severity=sev, category="timeseries",
                            title=f"Struktureller Bruch in {metric_name} am {cp_date.isoformat()}",
                            description=cp.description,
                            metric=metric_name, current_value=_safe(cp.magnitude), threshold_value=0,
                            confidence=int(min(90, max(50, _safe(cp.magnitude, 60)))),
                            recommended_action="Ereignis-Log prüfen: Was hat sich an diesem Datum geändert?",
                            urgency="today" if cp.direction == "down" else "this_week",
                        ))
            except Exception:
                continue
    except Exception:
        pass
    return alerts


def _check_tasks(internal: Any) -> list[ProactiveAlert]:
    alerts: list[ProactiveAlert] = []
    try:
        overdue = int(_safe(internal.tasks_overdue))
        if overdue > 0:
            alerts.append(ProactiveAlert(
                severity="info", category="tasks",
                title=f"{overdue} überfällige {'Aufgabe' if overdue == 1 else 'Aufgaben'}",
                description=f"{overdue} {'Aufgabe ist' if overdue == 1 else 'Aufgaben sind'} überfällig. Priorisierung überprüfen.",
                metric="tasks_overdue", current_value=float(overdue), threshold_value=0,
                confidence=100, recommended_action="Überfällige Aufgaben heute abschließen oder neu priorisieren.",
                urgency="today",
            ))
    except Exception:
        pass
    return alerts


# ---------------------------------------------------------------------------
# Haupt-Funktion
# ---------------------------------------------------------------------------

def detect_proactive_alerts(
    stats_bundle:    Any = None,
    ts_bundle:       Any = None,
    forecast_bundle: Any = None,
    causality_bundle: Any = None,
    social_bundle:   Any = None,
    internal:        Any = None,
    goals:           Optional[list[dict]] = None,
) -> ProactiveReport:
    """
    Scannt alle verfügbaren Analytics-Bundles und gibt einen priorisierten
    ProactiveReport zurück.

    Alle Parameter sind optional — der Engine liefert immer ein Ergebnis.
    """
    from datetime import datetime

    all_alerts: list[ProactiveAlert] = []

    if stats_bundle is not None:
        all_alerts += _check_revenue_anomaly(stats_bundle)
        all_alerts += _check_traffic(stats_bundle)
        all_alerts += _check_conversion_rate(stats_bundle)

    if forecast_bundle is not None:
        all_alerts += _check_forecast(forecast_bundle)

    goal_list = goals or (internal.goals if internal is not None and hasattr(internal, "goals") else [])
    if goal_list:
        all_alerts += _check_goals(goal_list)

    if social_bundle is not None:
        all_alerts += _check_social(social_bundle)

    if ts_bundle is not None:
        all_alerts += _check_timeseries(ts_bundle)

    if internal is not None:
        all_alerts += _check_tasks(internal)

    # Sortierung: critical → warning → opportunity → info, dann nach Confidence absteigend
    all_alerts.sort(key=lambda a: (_SEVERITY_ORDER.get(a.severity, 9), -a.confidence))

    # Duplikate entfernen (gleiche Metrik + Severity)
    seen: set[tuple[str, str]] = set()
    unique: list[ProactiveAlert] = []
    for a in all_alerts:
        key = (a.severity, a.metric)
        if key not in seen:
            seen.add(key)
            unique.append(a)

    counts = {s: sum(1 for a in unique if a.severity == s) for s in _SEVERITY_ORDER}

    critical_count   = counts.get("critical", 0)
    warning_count    = counts.get("warning", 0)
    opportunity_count = counts.get("opportunity", 0)

    if critical_count > 0:
        summary = f"{critical_count} kritische Warnung(en) erfordern sofortige Maßnahmen."
    elif warning_count > 0:
        summary = f"{warning_count} Warnung(en) erfordern Aufmerksamkeit heute."
    elif opportunity_count > 0:
        summary = f"{opportunity_count} Chance(n) für Wachstum identifiziert."
    else:
        summary = "Alle Metriken im Normalbereich."

    return ProactiveReport(
        alerts=unique,
        total_critical=critical_count,
        total_warning=warning_count,
        total_opportunity=opportunity_count,
        total_info=counts.get("info", 0),
        generated_at=datetime.utcnow().isoformat(),
        summary=summary,
    )


def build_proactive_context(report: ProactiveReport) -> str:
    """Formatiert den ProactiveReport als KI-lesbaren Kontext-Block."""
    if not report.alerts:
        return ""

    lines = [
        "=== SCHICHT 10: PROAKTIVE ERKENNUNG ===",
        f"Status: {report.summary}",
        f"Alerts: {report.total_critical} kritisch | {report.total_warning} Warnung | "
        f"{report.total_opportunity} Chance | {report.total_info} Info",
        "",
    ]

    for a in report.alerts[:12]:   # Max 12 Alerts in Kontext
        prefix = {"critical": "🔴", "warning": "🟡", "opportunity": "🟢", "info": "ℹ"}.get(a.severity, "•")
        lines.append(f"{prefix} [{a.severity.upper()}] {a.title}")
        lines.append(f"   {a.description}")
        lines.append(f"   → {a.recommended_action} (Dringlichkeit: {a.urgency})")

    return "\n".join(lines)
