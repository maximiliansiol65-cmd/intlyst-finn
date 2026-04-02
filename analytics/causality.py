"""
Schicht 4 — Kausalitätsanalyse
analytics/causality.py

Beantwortet die wichtigste Frage: "Warum ist das passiert?"

1. Granger-Kausalitätstests: Was beeinflusst was, mit welchem Zeitverzug?
2. Event-Impact-Analyse: Was hat ein Business-Event bewirkt?
3. Kreuzkorrelation: Zeitverzögerte Zusammenhänge zwischen Metriken
4. Anomalie-Attribution: Warum war dieser Tag anomal?

Statistisch belastbare Aussagen (p<0.05) gehen als Fakten in die KI.
Unsichere Zusammenhänge werden als Hypothesen markiert.

Installationsempfehlung:
    pip install statsmodels numpy (bereits in requirements.txt)
"""

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

# Optionale Abhängigkeiten
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from statsmodels.tsa.stattools import grangercausalitytests, ccf
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False

from analytics.statistics import _mean, _linear_regression, _pct_change


# ---------------------------------------------------------------------------
# Datenstrukturen
# ---------------------------------------------------------------------------

@dataclass
class GrangerResult:
    """Ergebnis eines Granger-Kausalitätstests."""

    cause: str              # Name der ursächlichen Metrik
    effect: str             # Name der Wirkungsmetrik
    optimal_lag: int        # Lag mit niedrigstem p-Wert (in Tagen)
    p_value: float          # Statistischer Signifikanzwert (< 0.05 = signifikant)
    f_statistic: float      # F-Statistik
    is_significant: bool    # p < 0.05
    strength: str           # "sehr stark" / "stark" / "moderat" / "schwach"
    description: str        # Lesbarer Text für KI-Kontext
    implied_chain: str      # Z.B. "Instagram → Revenue in 3 Tagen"


@dataclass
class CrossCorrelation:
    """Kreuzkorrelation zwischen zwei Metriken mit verschiedenen Lags."""

    metric_a: str
    metric_b: str
    correlations: list[float]   # Korrelation bei Lag 0, 1, 2, ... max_lag
    max_lag_positive: int       # Lag mit stärkster positiver Korrelation
    max_lag_negative: int       # Lag mit stärkster negativer Korrelation
    peak_correlation: float     # Stärkste Korrelation (absolut)
    dominant_lag: int           # Lag mit der stärksten absoluten Korrelation
    interpretation: str


@dataclass
class EventImpact:
    """Gemessener Impact eines Business-Events auf eine Metrik."""

    event_title: str
    event_date: str             # ISO-Datum
    metric: str
    trend_before: float         # Durchschnittliche tägliche Änderung vorher (%/Tag)
    trend_after: float          # Durchschnittliche tägliche Änderung nachher (%/Tag)
    level_before: float         # Durchschnittswert vorher
    level_after: float          # Durchschnittswert nachher
    level_change_pct: float     # Niveau-Veränderung in %
    is_significant: bool        # Ist der Unterschied statistisch signifikant?
    p_value: float
    description: str


@dataclass
class AnomalyAttribution:
    """Erklärt warum ein bestimmter Tag anomal war."""

    anomaly_date: str
    metric: str
    observed_value: float
    expected_value: float
    deviation_pct: float
    probable_causes: list[dict]  # [{cause, probability_pct, description}]
    unexplained_pct: float       # Anteil der Anomalie der nicht erklärt ist


@dataclass
class CorrelationMatrix:
    """Pearson + Spearman Korrelationsmatrix aller Metriken."""

    pearson: dict[str, dict[str, float]]    # metric_a → metric_b → r
    spearman: dict[str, dict[str, float]]   # metric_a → metric_b → rho
    strongest_positive: tuple[str, str, float]  # (a, b, r)
    strongest_negative: tuple[str, str, float]  # (a, b, r)


@dataclass
class CausalityBundle:
    """Vollständige Kausalitätsanalyse aller Metrik-Paare."""

    granger_results: list[GrangerResult]
    significant_causalities: list[GrangerResult]    # Nur p < 0.05
    cross_correlations: list[CrossCorrelation]
    correlation_matrix: CorrelationMatrix
    event_impacts: list[EventImpact]
    anomaly_attributions: list[AnomalyAttribution]
    causal_chain_summary: str   # Kompakter Text für KI: "X bewirkt Y in Z Tagen"


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _spearman_rank_correlation(x: list[float], y: list[float]) -> float:
    """Spearman Rangkorrelation (robuster als Pearson bei Ausreißern)."""
    n = len(x)
    if n < 4:
        return 0.0

    def _ranks(values: list[float]) -> list[float]:
        sorted_vals = sorted(enumerate(values), key=lambda t: t[1])
        ranks = [0.0] * n
        for rank, (i, _) in enumerate(sorted_vals):
            ranks[i] = rank + 1.0
        return ranks

    rx = _ranks(x)
    ry = _ranks(y)
    mean_rx = _mean(rx)
    mean_ry = _mean(ry)
    num = sum((rx[i] - mean_rx) * (ry[i] - mean_ry) for i in range(n))
    den_x = math.sqrt(sum((v - mean_rx) ** 2 for v in rx))
    den_y = math.sqrt(sum((v - mean_ry) ** 2 for v in ry))
    if den_x == 0 or den_y == 0:
        return 0.0
    return round(num / (den_x * den_y), 4)


def _pearson(x: list[float], y: list[float]) -> float:
    """Pearson-Korrelation."""
    n = len(x)
    if n < 3:
        return 0.0
    mean_x = _mean(x)
    mean_y = _mean(y)
    num = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    den_x = math.sqrt(sum((v - mean_x) ** 2 for v in x))
    den_y = math.sqrt(sum((v - mean_y) ** 2 for v in y))
    if den_x == 0 or den_y == 0:
        return 0.0
    return round(num / (den_x * den_y), 4)


def _t_test_two_samples(a: list[float], b: list[float]) -> tuple[float, float]:
    """
    Welch's t-Test für zwei unabhängige Stichproben.
    Gibt (t_statistic, approximate_p_value) zurück.
    """
    na, nb = len(a), len(b)
    if na < 2 or nb < 2:
        return 0.0, 1.0

    mean_a, mean_b = _mean(a), _mean(b)
    var_a = sum((v - mean_a) ** 2 for v in a) / (na - 1)
    var_b = sum((v - mean_b) ** 2 for v in b) / (nb - 1)

    se = math.sqrt(var_a / na + var_b / nb)
    if se == 0:
        return 0.0, 1.0

    t = (mean_a - mean_b) / se

    # Welch-Satterthwaite Freiheitsgrade
    df_num = (var_a / na + var_b / nb) ** 2
    df_den = (var_a / na) ** 2 / (na - 1) + (var_b / nb) ** 2 / (nb - 1)
    df = df_num / df_den if df_den > 0 else na + nb - 2

    # Approximierter p-Wert via Survival-Funktion (vereinfacht)
    # Nutzt scipy wenn verfügbar
    try:
        from scipy import stats as sp
        p_value = float(2 * sp.t.sf(abs(t), df=df))
    except ImportError:
        # Grobe Approximation: t > 2 ≈ p < 0.05 bei df >= 10
        if abs(t) > 3.0:
            p_value = 0.01
        elif abs(t) > 2.0:
            p_value = 0.05
        elif abs(t) > 1.5:
            p_value = 0.15
        else:
            p_value = 0.5

    return round(t, 4), round(p_value, 6)


# ---------------------------------------------------------------------------
# Granger-Kausalitätstests
# ---------------------------------------------------------------------------

def _strength_label(p_value: float) -> str:
    if p_value < 0.001:
        return "sehr stark"
    if p_value < 0.01:
        return "stark"
    if p_value < 0.05:
        return "moderat"
    if p_value < 0.1:
        return "schwach (grenzwertig)"
    return "nicht signifikant"


def test_granger_causality(
    x: list[float],
    y: list[float],
    max_lag: int = 7,
    name_x: str = "X",
    name_y: str = "Y",
    implied_chain: str = "",
) -> Optional[GrangerResult]:
    """
    Testet ob X (cause) Granger-kausal für Y (effect) ist.

    Granger-Kausalität: X hilft dabei, Y besser vorherzusagen als Y allein.
    Das ist nicht Kausalität im philosophischen Sinne, aber starkes prädiktives Signal.

    Args:
        x:         Zeitreihe der möglichen Ursache
        y:         Zeitreihe des möglichen Effekts
        max_lag:   Maximale Verzögerung in Tagen
        name_x:    Name der Ursachen-Metrik (für Ausgabe)
        name_y:    Name der Effekt-Metrik (für Ausgabe)
        implied_chain: Z.B. "Instagram → Revenue in 3 Tagen"

    Returns:
        GrangerResult oder None wenn zu wenig Daten
    """
    n = min(len(x), len(y))
    if n < max_lag * 3:
        return None

    # Daten auf gleiche Länge trimmen
    x = x[-n:]
    y = y[-n:]

    best_lag = 1
    best_p = 1.0
    best_f = 0.0

    if HAS_STATSMODELS and HAS_NUMPY:
        try:
            # statsmodels erwartet: [y, x] — y ist die abhängige Variable
            data = np.column_stack([y, x])
            results = grangercausalitytests(data, maxlag=max_lag, verbose=False)

            for lag, lag_results in results.items():
                # ssr_ftest: F-Test basierend auf Sum of Squared Residuals
                f_stat = lag_results[0].get("ssr_ftest", (0, 1, 0, 0))
                p = float(f_stat[1])
                f = float(f_stat[0])
                if p < best_p:
                    best_p = p
                    best_f = f
                    best_lag = lag
        except Exception:
            # Fallback: CCF als Proxy
            best_p, best_f, best_lag = _granger_fallback(x, y, max_lag)
    else:
        best_p, best_f, best_lag = _granger_fallback(x, y, max_lag)

    is_significant = best_p < 0.05
    strength = _strength_label(best_p)

    description = (
        f"{name_x} beeinflusst {name_y} mit {best_lag} {'Tag' if best_lag == 1 else 'Tagen'} "
        f"Verzögerung (p={best_p:.4f}, {strength})"
    )
    if not is_significant:
        description = f"Kein signifikanter Granger-Zusammenhang: {name_x} → {name_y} (p={best_p:.3f})"

    chain = implied_chain or f"{name_x} → {name_y} in {best_lag} {'Tag' if best_lag == 1 else 'Tagen'}"

    return GrangerResult(
        cause=name_x,
        effect=name_y,
        optimal_lag=best_lag,
        p_value=round(best_p, 6),
        f_statistic=round(best_f, 4),
        is_significant=is_significant,
        strength=strength,
        description=description,
        implied_chain=chain,
    )


def _granger_fallback(
    x: list[float], y: list[float], max_lag: int
) -> tuple[float, float, int]:
    """
    Approximiert Granger-Kausalität via Kreuzkorrelation.
    Fallback wenn statsmodels nicht verfügbar.
    """
    best_lag = 1
    best_corr = 0.0

    for lag in range(1, min(max_lag + 1, len(x) // 3)):
        x_lagged = x[:-lag] if lag > 0 else x
        y_current = y[lag:]
        if len(x_lagged) != len(y_current) or len(x_lagged) < 5:
            continue
        corr = abs(_pearson(x_lagged, y_current))
        if corr > best_corr:
            best_corr = corr
            best_lag = lag

    # Korrelation in approximierten p-Wert umrechnen
    n = len(x)
    if best_corr > 0 and n > 3:
        t = best_corr * math.sqrt(n - 2) / math.sqrt(max(1e-10, 1 - best_corr ** 2))
        if abs(t) > 3.0:
            p = 0.01
        elif abs(t) > 2.0:
            p = 0.05
        elif abs(t) > 1.5:
            p = 0.15
        else:
            p = 0.5
    else:
        p = 1.0

    return p, best_corr * 10, best_lag  # F-Statistik approximiert


# ---------------------------------------------------------------------------
# Kreuzkorrelation
# ---------------------------------------------------------------------------

def compute_cross_correlation(
    a: list[float],
    b: list[float],
    name_a: str = "A",
    name_b: str = "B",
    max_lag: int = 7,
) -> CrossCorrelation:
    """
    Berechnet die zeitverzögerte Kreuzkorrelation zwischen zwei Metriken.

    Bei Lag k > 0: Wie gut sagt a(t) den Wert b(t+k) voraus?
    """
    n = min(len(a), len(b))
    max_lag = min(max_lag, n // 3)
    a = a[-n:]
    b = b[-n:]

    correlations: list[float] = []
    for lag in range(0, max_lag + 1):
        if lag == 0:
            r = _pearson(a, b)
        else:
            # a[:-lag] gegen b[lag:] — a führt b
            a_sub = a[: n - lag]
            b_sub = b[lag:]
            if len(a_sub) < 5:
                r = 0.0
            else:
                r = _pearson(a_sub, b_sub)
        correlations.append(round(r, 4))

    # Stärkster Lag
    abs_corrs = [abs(c) for c in correlations]
    dominant_lag = abs_corrs.index(max(abs_corrs)) if abs_corrs else 0
    peak_corr = correlations[dominant_lag] if correlations else 0.0

    # Positiver und negativer Peak
    max_pos_idx = max(range(len(correlations)), key=lambda i: correlations[i]) if correlations else 0
    min_neg_idx = min(range(len(correlations)), key=lambda i: correlations[i]) if correlations else 0

    # Interpretation
    if abs(peak_corr) > 0.7:
        strength = "starker"
    elif abs(peak_corr) > 0.4:
        strength = "mittlerer"
    elif abs(peak_corr) > 0.2:
        strength = "schwacher"
    else:
        strength = "kein relevanter"

    direction = "positiver" if peak_corr > 0 else "negativer"

    if dominant_lag == 0:
        interp = f"{strength} {direction} Zusammenhang am selben Tag (r={peak_corr:.3f})"
    else:
        interp = (
            f"{strength} {direction} Zusammenhang: {name_a} → {name_b} "
            f"mit {dominant_lag} {'Tag' if dominant_lag == 1 else 'Tagen'} Verzögerung "
            f"(r={peak_corr:.3f})"
        )

    return CrossCorrelation(
        metric_a=name_a,
        metric_b=name_b,
        correlations=correlations,
        max_lag_positive=max_pos_idx,
        max_lag_negative=min_neg_idx,
        peak_correlation=peak_corr,
        dominant_lag=dominant_lag,
        interpretation=interp,
    )


# ---------------------------------------------------------------------------
# Event-Impact-Analyse
# ---------------------------------------------------------------------------

def analyze_event_impact(
    values: list[float],
    dates: list[date],
    event_date: date,
    event_title: str,
    metric: str = "revenue",
    window: int = 7,
) -> Optional[EventImpact]:
    """
    Interrupted Time Series Analyse: Was hat ein Business-Event bewirkt?

    Vergleicht Trend und Niveau vor vs. nach dem Event.

    Args:
        values:       Zeitreihe der Metrik
        dates:        Dazugehörige Datumsangaben
        event_date:   Datum des Events
        event_title:  Name des Events
        metric:       Name der Metrik
        window:       Beobachtungsfenster in Tagen (vor/nach Event)
    """
    if len(values) != len(dates) or len(values) < window * 2:
        return None

    # Segmente vor und nach dem Event
    before_vals = []
    before_dates = []
    after_vals = []
    after_dates = []

    for d, v in zip(dates, values):
        days_diff = (d - event_date).days
        if -window <= days_diff < 0:
            before_vals.append(v)
            before_dates.append(d)
        elif 0 <= days_diff < window:
            after_vals.append(v)
            after_dates.append(d)

    if len(before_vals) < 3 or len(after_vals) < 3:
        return None

    mean_before = _mean(before_vals)
    mean_after = _mean(after_vals)

    # Trendraten (Slope als %/Tag relativ zum Mittelwert)
    x_before = list(range(len(before_vals)))
    x_after = list(range(len(after_vals)))
    slope_before, _, _ = _linear_regression(x_before, before_vals)
    slope_after, _, _ = _linear_regression(x_after, after_vals)

    trend_before = (slope_before / mean_before * 100) if mean_before != 0 else 0.0
    trend_after = (slope_after / mean_after * 100) if mean_after != 0 else 0.0

    level_change = _pct_change(mean_after, mean_before)

    # t-Test: Ist der Unterschied signifikant?
    _, p_value = _t_test_two_samples(before_vals, after_vals)
    is_significant = p_value < 0.05

    # Lesbarer Text
    if is_significant:
        direction = "erhöht" if level_change > 0 else "gesenkt"
        description = (
            f"'{event_title}' hat {metric} um {abs(level_change):.1f}% {direction} "
            f"(von Ø {mean_before:.0f} auf Ø {mean_after:.0f}, p={p_value:.3f}). "
            f"Trend vorher: {trend_before:+.2f}%/Tag → nachher: {trend_after:+.2f}%/Tag"
        )
    else:
        description = (
            f"'{event_title}' hat keinen statistisch signifikanten Effekt auf {metric} "
            f"(p={p_value:.3f}, Niveau-Änderung: {level_change:+.1f}%)"
        )

    return EventImpact(
        event_title=event_title,
        event_date=event_date.isoformat(),
        metric=metric,
        trend_before=round(trend_before, 3),
        trend_after=round(trend_after, 3),
        level_before=round(mean_before, 2),
        level_after=round(mean_after, 2),
        level_change_pct=round(level_change, 2),
        is_significant=is_significant,
        p_value=round(p_value, 6),
        description=description,
    )


# ---------------------------------------------------------------------------
# Korrelationsmatrix
# ---------------------------------------------------------------------------

def compute_correlation_matrix(
    metrics: dict[str, list[float]],
) -> CorrelationMatrix:
    """
    Berechnet Pearson + Spearman Korrelationsmatrix für alle Metrik-Paare.

    Args:
        metrics: Dict mit Metrikname → Werte-Liste (alle gleich lang)
    """
    names = list(metrics.keys())
    n_min = min(len(v) for v in metrics.values()) if metrics else 0

    # Auf gleiche Länge kürzen
    trimmed = {k: v[-n_min:] for k, v in metrics.items()}

    pearson: dict[str, dict[str, float]] = {}
    spearman: dict[str, dict[str, float]] = {}

    for a in names:
        pearson[a] = {}
        spearman[a] = {}
        for b in names:
            if a == b:
                pearson[a][b] = 1.0
                spearman[a][b] = 1.0
            else:
                pearson[a][b] = _pearson(trimmed[a], trimmed[b])
                spearman[a][b] = _spearman_rank_correlation(trimmed[a], trimmed[b])

    # Stärkste Korrelationen finden (exkl. Diagonale)
    max_pos = ("", "", 0.0)
    max_neg = ("", "", 0.0)
    for a in names:
        for b in names:
            if a >= b:
                continue
            r = pearson[a][b]
            if r > max_pos[2]:
                max_pos = (a, b, r)
            if r < max_neg[2]:
                max_neg = (a, b, r)

    return CorrelationMatrix(
        pearson=pearson,
        spearman=spearman,
        strongest_positive=max_pos,
        strongest_negative=max_neg,
    )


# ---------------------------------------------------------------------------
# Anomalie-Attribution
# ---------------------------------------------------------------------------

def attribute_anomaly(
    anomaly_date: date,
    metric: str,
    observed: float,
    expected: float,
    dates: list[date],
    business_events: Optional[list[dict]] = None,  # [{date, title, category}]
    holidays: Optional[list[dict]] = None,          # [{date, name}]
    weekday_profile: Optional[dict[str, float]] = None,
) -> AnomalyAttribution:
    """
    Erklärt warum ein bestimmter Tag anomal war.

    Prüft folgende mögliche Ursachen:
    1. Business Event in ±7 Tagen
    2. Feiertag in ±3 Tagen
    3. Wochentag-Effekt (entspricht das dem historischen Wochentag-Profil?)
    4. Saison-Effekt
    """
    deviation_pct = _pct_change(observed, expected) if expected != 0 else 0.0
    probable_causes: list[dict] = []
    explained_pct = 0.0

    # 1. Business Events in ±7 Tagen
    if business_events:
        for event in business_events:
            try:
                ev_date = date.fromisoformat(event.get("date", ""))
            except (ValueError, TypeError):
                continue
            days_away = abs((anomaly_date - ev_date).days)
            if days_away <= 7:
                probability = max(5.0, 35.0 - days_away * 4.0)
                probable_causes.append({
                    "cause": f"Business Event: {event.get('title', 'Unbekannt')}",
                    "probability_pct": round(probability, 1),
                    "description": f"{days_away} Tage {'vor' if anomaly_date < ev_date else 'nach'} Event",
                })
                explained_pct += probability

    # 2. Feiertage in ±3 Tagen
    if holidays:
        for h in holidays:
            try:
                h_date = date.fromisoformat(h.get("date", ""))
            except (ValueError, TypeError):
                continue
            days_away = abs((anomaly_date - h_date).days)
            if days_away <= 3:
                probability = max(10.0, 40.0 - days_away * 10.0)
                probable_causes.append({
                    "cause": f"Feiertag: {h.get('name', 'Feiertag')}",
                    "probability_pct": round(probability, 1),
                    "description": f"{'Am selben Tag' if days_away == 0 else f'{days_away} Tage entfernt'}",
                })
                explained_pct += probability

    # 3. Wochentag-Effekt
    if weekday_profile:
        wd_name = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"][anomaly_date.weekday()]
        wd_avg = weekday_profile.get(wd_name, 0.0)
        if wd_avg > 0 and expected > 0:
            wd_effect = _pct_change(wd_avg, expected)
            if abs(wd_effect) > 10:
                probability = min(30.0, abs(wd_effect))
                probable_causes.append({
                    "cause": f"Wochentag-Effekt ({wd_name})",
                    "probability_pct": round(probability, 1),
                    "description": f"{wd_name} ist historisch {wd_effect:+.1f}% vs Durchschnitt",
                })
                explained_pct += probability

    # Normalisierung: Wahrscheinlichkeiten dürfen nicht > 95% sein
    total_prob = sum(c["probability_pct"] for c in probable_causes)
    if total_prob > 95:
        factor = 95.0 / total_prob
        for c in probable_causes:
            c["probability_pct"] = round(c["probability_pct"] * factor, 1)

    # Sortieren nach Wahrscheinlichkeit
    probable_causes.sort(key=lambda x: x["probability_pct"], reverse=True)

    unexplained = max(0.0, 100.0 - sum(c["probability_pct"] for c in probable_causes))

    return AnomalyAttribution(
        anomaly_date=anomaly_date.isoformat(),
        metric=metric,
        observed_value=round(observed, 2),
        expected_value=round(expected, 2),
        deviation_pct=round(deviation_pct, 1),
        probable_causes=probable_causes[:4],
        unexplained_pct=round(unexplained, 1),
    )


# ---------------------------------------------------------------------------
# Vollständige Kausalitätsanalyse
# ---------------------------------------------------------------------------

def analyze_all_causality(
    revenue: list[float],
    traffic: list[float],
    conversion_rate: list[float],
    new_customers: list[float],
    dates: Optional[list[date]] = None,
    business_events: Optional[list[dict]] = None,
) -> CausalityBundle:
    """
    Führt alle Kausalitätstests für die vier Kernmetriken durch.

    Testet:
    - Traffic → Revenue (Lag 0-7)
    - Conversion Rate → Revenue (Lag 0-3)
    - New Customers → Revenue (Lag 0-14)
    - Traffic → Conversion Rate (Lag 0-3)

    Args:
        revenue, traffic, conversion_rate, new_customers: Zeitreihen
        dates:            Datumsangaben (optional)
        business_events:  Business Events für Impact-Analyse

    Returns:
        CausalityBundle mit allen Ergebnissen
    """
    cr_pct = [v * 100 for v in conversion_rate]

    # --- Granger-Tests ---
    granger_tests = [
        (traffic,      revenue,      "Traffic",          "Umsatz",          7,  "Traffic → Umsatz in X Tagen"),
        (cr_pct,       revenue,      "Conversion Rate",  "Umsatz",          3,  "Conversion Rate → Umsatz in X Tagen"),
        (new_customers, revenue,     "Neue Kunden",      "Umsatz",          14, "Neue Kunden → Umsatz in X Tagen"),
        (traffic,      cr_pct,       "Traffic",          "Conversion Rate", 3,  "Traffic-Qualität → Conversion in X Tagen"),
        (new_customers, traffic,     "Neue Kunden",      "Traffic",         7,  "Neue Kunden → Traffic-Wachstum in X Tagen"),
    ]

    granger_results: list[GrangerResult] = []
    for cause_vals, effect_vals, cause_name, effect_name, max_lag, chain_template in granger_tests:
        result = test_granger_causality(
            x=cause_vals,
            y=effect_vals,
            max_lag=max_lag,
            name_x=cause_name,
            name_y=effect_name,
            implied_chain=chain_template.replace("X Tagen", "? Tagen"),
        )
        if result:
            # Ersetze "? Tagen" mit tatsächlichem Lag
            result.implied_chain = chain_template.replace("X Tagen", f"{result.optimal_lag} Tagen")
            granger_results.append(result)

    significant = [r for r in granger_results if r.is_significant]

    # --- Kreuzkorrelationen ---
    ccfs = [
        compute_cross_correlation(traffic,       revenue,       "Traffic",         "Umsatz",          7),
        compute_cross_correlation(cr_pct,        revenue,       "Conversion Rate", "Umsatz",          3),
        compute_cross_correlation(new_customers, revenue,       "Neue Kunden",     "Umsatz",          7),
        compute_cross_correlation(traffic,       cr_pct,        "Traffic",         "Conversion Rate", 3),
    ]

    # --- Korrelationsmatrix ---
    corr_matrix = compute_correlation_matrix({
        "revenue": revenue,
        "traffic": traffic,
        "conversion_rate": cr_pct,
        "new_customers": new_customers,
    })

    # --- Event-Impact-Analyse ---
    event_impacts: list[EventImpact] = []
    if business_events and dates:
        for event in business_events[:5]:  # Max 5 Events analysieren
            try:
                ev_date = date.fromisoformat(event.get("date", ""))
            except (ValueError, TypeError):
                continue
            for metric_name, metric_vals in [("revenue", revenue), ("traffic", traffic)]:
                impact = analyze_event_impact(metric_vals, dates, ev_date, event.get("title", ""), metric_name)
                if impact:
                    event_impacts.append(impact)

    # --- Kausalketten-Zusammenfassung ---
    chain_lines = []
    if significant:
        chain_lines.append("BEWIESENE KAUSALITÄTEN (statistisch signifikant, p<0.05):")
        for r in significant:
            chain_lines.append(f"  ✓ {r.description}")
    else:
        chain_lines.append("Keine statistisch signifikanten Granger-Kausalitäten mit verfügbaren Daten.")
        chain_lines.append("  Hinweis: Mindestens 60-90 Tage Daten für robuste Granger-Tests empfohlen.")

    # Stärkste Korrelation erwähnen
    sp = corr_matrix.strongest_positive
    if sp[2] > 0.5:
        chain_lines.append(f"\nStärkste Korrelation: {sp[0]} ↔ {sp[1]} (r={sp[2]:.3f})")

    # Event-Impacts erwähnen
    sig_events = [e for e in event_impacts if e.is_significant]
    if sig_events:
        chain_lines.append("\nNACHGEWIESENE EVENT-IMPACTS:")
        for e in sig_events[:3]:
            chain_lines.append(f"  ✓ {e.description}")

    return CausalityBundle(
        granger_results=granger_results,
        significant_causalities=significant,
        cross_correlations=ccfs,
        correlation_matrix=corr_matrix,
        event_impacts=event_impacts,
        anomaly_attributions=[],
        causal_chain_summary="\n".join(chain_lines),
    )


# ---------------------------------------------------------------------------
# Kontext-Builder für KI (Schicht 11)
# ---------------------------------------------------------------------------

def build_causal_chain(bundle: CausalityBundle, extra_links: dict[str, str] = None) -> list[str]:
    """
    Baut rekursiv eine Kausalkette bis zur Kernursache.
    extra_links: optionale Mapping wie {"Social Media Reichweite": "Posts"}
    Gibt Liste von Sätzen zurück.
    """
    if extra_links is None:
        extra_links = {}
    # Baue Map: effect -> (cause, lag, desc)
    effect_map = {}
    for r in bundle.significant_causalities:
        effect_map[r.effect] = {
            "cause": r.cause,
            "lag": r.optimal_lag,
            "desc": r.description,
        }
    # Starte bei "Umsatz" und folge der Kette
    chain = []
    current = "Umsatz"
    visited = set()
    while current in effect_map and current not in visited:
        visited.add(current)
        entry = effect_map[current]
        cause = entry["cause"]
        lag = entry["lag"]
        chain.append(f"{current} fällt, weil {cause} fällt (Verzögerung: {lag} Tage).")
        current = cause
    # Prüfe, ob für die letzte Ursache noch ein extra Link existiert (z.B. Social → Posts)
    if current in extra_links:
        chain.append(f"{current} fällt, weil {extra_links[current]} fällt.")
        current = extra_links[current]
    # Kernursache markieren
    chain.append(f"Kern-Ursache: {current}")
    return chain


def build_causality_context(bundle: CausalityBundle, extra_links: dict[str, str] = None) -> str:
    """
    Formatiert CausalityBundle als Profi-Kausalketten-Kontext.
    Gibt die Ursachen-Kette bis zur Kernursache aus.
    """
    lines: list[str] = ["KAUSALITÄTSANALYSE (Profi-Level):"]
    # Profi-Kausalkette
    chain = build_causal_chain(bundle, extra_links=extra_links)
    lines.extend(chain)

    # Kreuzkorrelation-Highlights (nur starke)
    strong_ccf = [c for c in bundle.cross_correlations if abs(c.peak_correlation) > 0.4]
    if strong_ccf:
        lines.append("\nKREUZKORRELATIONEN (|r| > 0.4):")
        for c in strong_ccf:
            lines.append(f"  {c.interpretation}")

    # Korrelationsmatrix (wichtigste Paare)
    pm = bundle.correlation_matrix.pearson
    if "revenue" in pm:
        lines.append("\nKORRELATIONEN MIT UMSATZ (Pearson r):")
        for metric in ("traffic", "conversion_rate", "new_customers"):
            if metric in pm.get("revenue", {}):
                r = pm["revenue"][metric]
                label = "stark" if abs(r) > 0.7 else "mittel" if abs(r) > 0.4 else "schwach"
                lines.append(f"  Umsatz ↔ {metric}: r={r:.3f} ({label})")

    # Event-Impacts
    if bundle.event_impacts:
        sig = [e for e in bundle.event_impacts if e.is_significant]
        lines.append(f"\nEVENT-IMPACTS: {len(bundle.event_impacts)} analysiert, {len(sig)} signifikant")
        for e in sig[:3]:
            lines.append(f"  {e.description}")

    return "\n".join(lines)
