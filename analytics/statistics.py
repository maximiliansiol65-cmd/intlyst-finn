"""
Schicht 2 — Statistische Grundanalyse
analytics/statistics.py

Berechnet für JEDE Metrik alle relevanten statistischen Kennzahlen.
Verwendet numpy/scipy wenn verfügbar, fällt auf Pure-Python zurück.

Installationsempfehlung:
    pip install numpy scipy
"""

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

# Optionale Abhängigkeiten — Graceful Degradation
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


# ---------------------------------------------------------------------------
# Datenstruktur
# ---------------------------------------------------------------------------

@dataclass
class MetricStats:
    """
    Vollständige statistische Beschreibung einer Metrik-Zeitreihe.

    Alle Felder sind immer vorhanden (keine Optionals in der Ausgabe),
    verwenden aber 0.0 / [] als Fallback wenn nicht berechenbar.
    """

    # Eingabe
    n: int                          # Anzahl Datenpunkte
    metric_name: str

    # Zentralmaße
    mean: float                     # Arithmetisches Mittel
    median: float                   # Robuster Mittelpunkt
    trimmed_mean: float             # Mittel ohne Ausreißer (10% Trim)

    # Streuungsmaße
    std_dev: float                  # Standardabweichung
    variance: float                 # Varianz
    cv: float                       # Coefficient of Variation (Std/Mean)
    iqr: float                      # Interquartilsabstand Q75–Q25
    value_range: float              # Max − Min

    # Extremwerte
    minimum: float
    maximum: float

    # Verteilungsmaße
    skewness: float                 # Schiefe (0=symmetrisch, >0=rechtsskewed)
    kurtosis: float                 # Wölbung (3=normal, >3=spitz)

    # Perzentilen
    p10: float
    p25: float
    p50: float
    p75: float
    p90: float
    p95: float
    p99: float

    # Trendmaße
    linear_slope: float             # OLS-Steigung (Wert pro Tag)
    linear_r2: float                # Güte des linearen Fits (0–1)
    momentum_7d: float              # Wachstumsrate letzte 7 Tage in %
    momentum_30d: float             # Wachstumsrate letzte 30 Tage in %
    acceleration: float             # Ändert sich die Wachstumsrate? (momentum_7d - momentum_30d)

    # Vergleichsmaße
    wow_change: float               # Week-over-Week in %
    mom_change: float               # Month-over-Month in %
    vs_own_average: float           # Letzter Wert vs Gesamtmittel in %

    # Anomalie-Scores
    z_scores: list[float]           # Z-Score für jeden Datenpunkt
    outlier_indices: list[int]      # Indizes der Ausreißer (|Z| > 2.5)
    outlier_values: list[float]     # Werte der Ausreißer
    latest_z_score: float           # Z-Score des letzten Wertes

    # Saisonalität (wenn dates vorhanden)
    weekday_profile: dict[str, float]   # "Montag"→Durchschnitt ... "Sonntag"
    best_weekday: str               # Stärkster Wochentag
    worst_weekday: str              # Schwächster Wochentag
    monthly_profile: dict[int, float]   # Monat 1–12 → Durchschnitt

    # Signifikanz (wenn scipy verfügbar)
    trend_is_significant: bool      # Linearer Trend statistisch signifikant?
    trend_p_value: float            # p-Wert des Trendtests


WEEKDAY_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]


# ---------------------------------------------------------------------------
# Pure-Python Implementierungen (Fallback)
# ---------------------------------------------------------------------------

def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return (s[mid - 1] + s[mid]) / 2.0 if n % 2 == 0 else s[mid]


def _variance(values: list[float], mean: float) -> float:
    if len(values) < 2:
        return 0.0
    return sum((v - mean) ** 2 for v in values) / (len(values) - 1)  # Bessel-Korrektur


def _percentile(values: list[float], p: float) -> float:
    """Lineare Interpolation wie numpy.percentile."""
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n == 1:
        return s[0]
    idx = (n - 1) * p / 100.0
    lo = int(math.floor(idx))
    hi = int(math.ceil(idx))
    frac = idx - lo
    if lo >= n - 1:
        return s[-1]
    return s[lo] * (1 - frac) + s[hi] * frac


def _trimmed_mean(values: list[float], trim: float = 0.1) -> float:
    """Arithmetisches Mittel ohne die äußersten trim-Anteile."""
    if not values:
        return 0.0
    s = sorted(values)
    cut = int(len(s) * trim)
    trimmed = s[cut: len(s) - cut] if cut > 0 else s
    return _mean(trimmed)


def _skewness(values: list[float], mean: float, std: float) -> float:
    """Fishers Schiefe."""
    if std == 0 or len(values) < 3:
        return 0.0
    n = len(values)
    return (n / ((n - 1) * (n - 2))) * sum(((v - mean) / std) ** 3 for v in values)


def _kurtosis(values: list[float], mean: float, std: float) -> float:
    """Fishers Exzess-Kurtosis (0 = normalverteilt)."""
    if std == 0 or len(values) < 4:
        return 0.0
    n = len(values)
    k4 = sum(((v - mean) / std) ** 4 for v in values) / n
    return k4 - 3.0  # Exzess


def _linear_regression(x: list[float], y: list[float]) -> tuple[float, float, float]:
    """
    OLS lineare Regression: y = slope * x + intercept.

    Returns:
        (slope, intercept, r_squared)
    """
    n = len(x)
    if n < 2:
        return 0.0, 0.0, 0.0
    mean_x = _mean(x)
    mean_y = _mean(y)
    ss_xy = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    ss_xx = sum((x[i] - mean_x) ** 2 for i in range(n))
    if ss_xx == 0:
        return 0.0, mean_y, 0.0
    slope = ss_xy / ss_xx
    intercept = mean_y - slope * mean_x
    # R²
    y_pred = [slope * x[i] + intercept for i in range(n)]
    ss_res = sum((y[i] - y_pred[i]) ** 2 for i in range(n))
    ss_tot = sum((y[i] - mean_y) ** 2 for i in range(n))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return round(slope, 6), round(intercept, 4), round(max(0.0, min(1.0, r2)), 4)


def _momentum(values: list[float], window: int) -> float:
    """
    Wachstumsrate der letzten `window` Werte vs. den window Werten davor.
    Gibt Prozent-Änderung zurück.
    """
    n = len(values)
    if n < 2:
        return 0.0
    if n < window:
        return 0.0

    if n < window * 2:
        half = n // 2
        if half == 0:
            return 0.0
        recent = values[-half:]
        older = values[:half]
    else:
        recent = values[-window:]
        older = values[-window * 2: -window]

    avg_recent = _mean(recent)
    avg_older = _mean(older)
    if avg_older == 0:
        return 0.0
    return round((avg_recent - avg_older) / abs(avg_older) * 100, 2)


def _z_scores(values: list[float], mean: float, std: float) -> list[float]:
    if std == 0:
        return [0.0] * len(values)
    return [(v - mean) / std for v in values]


def _pct_change(current: float, previous: float) -> float:
    if previous == 0:
        return 0.0
    return round((current - previous) / abs(previous) * 100, 2)


# ---------------------------------------------------------------------------
# Scipy-beschleunigte Versionen
# ---------------------------------------------------------------------------

def _compute_with_scipy(values: list[float]) -> tuple[float, float, float, float]:
    """
    Berechnet Skewness, Kurtosis und Trend-p-Wert via scipy.

    Returns:
        (skewness, kurtosis, trend_slope_pvalue, pearsonr)
    """
    if not HAS_SCIPY or len(values) < 5:
        return 0.0, 0.0, 1.0, 0.0
    x = list(range(len(values)))
    skew = float(scipy_stats.skew(values))
    kurt = float(scipy_stats.kurtosis(values))  # Exzess-Kurtosis
    slope_result = scipy_stats.linregress(x, values)
    p_value = float(slope_result.pvalue)
    return round(skew, 4), round(kurt, 4), round(p_value, 6), round(float(slope_result.rvalue ** 2), 4)


# ---------------------------------------------------------------------------
# Saisonalitätsanalyse
# ---------------------------------------------------------------------------

def _compute_weekday_profile(
    values: list[float],
    dates: list[date],
) -> tuple[dict[str, float], str, str]:
    """
    Berechnet den Durchschnittswert pro Wochentag.

    Returns:
        (profile_dict, best_weekday_name, worst_weekday_name)
    """
    buckets: dict[int, list[float]] = {i: [] for i in range(7)}
    for d, v in zip(dates, values):
        buckets[d.weekday()].append(v)

    profile: dict[str, float] = {}
    avgs: dict[int, float] = {}
    for wd_idx, day_values in buckets.items():
        if day_values:
            avg = _mean(day_values)
            profile[WEEKDAY_DE[wd_idx]] = round(avg, 2)
            avgs[wd_idx] = avg

    if not avgs:
        return {}, "Unbekannt", "Unbekannt"

    best_idx = max(avgs.items(), key=lambda x: x[1])[0]
    worst_idx = min(avgs.items(), key=lambda x: x[1])[0]

    return profile, WEEKDAY_DE[best_idx], WEEKDAY_DE[worst_idx]


def _compute_monthly_profile(
    values: list[float],
    dates: list[date],
) -> dict[int, float]:
    """Durchschnittswert pro Kalendermonat (1–12)."""
    buckets: dict[int, list[float]] = {}
    for d, v in zip(dates, values):
        buckets.setdefault(d.month, []).append(v)
    return {month: round(_mean(mvs), 2) for month, mvs in sorted(buckets.items())}


# ---------------------------------------------------------------------------
# Haupt-Berechnungsfunktion
# ---------------------------------------------------------------------------

def compute_stats(
    values: list[float],
    dates: Optional[list[date]] = None,
    metric_name: str = "metric",
) -> MetricStats:
    """
    Berechnet alle statistischen Kennzahlen für eine Metrik-Zeitreihe.

    Args:
        values:      Zeitreihe (chronologisch sortiert, ältester Wert zuerst)
        dates:       Dazugehörige Datumsangaben (für Saisonalitätsanalyse)
        metric_name: Name der Metrik (für Beschriftung)

    Returns:
        MetricStats mit allen Kennzahlen

    Raises:
        Niemals — leere Eingaben führen zu Null-Werten
    """
    n = len(values)

    if n == 0:
        return _empty_stats(metric_name)

    # --- Zentralmaße ---
    mean = _mean(values)
    median = _median(values)
    trimmed = _trimmed_mean(values, trim=0.1)

    # --- Streuungsmaße ---
    variance = _variance(values, mean)
    std_dev = math.sqrt(variance)
    cv = round(std_dev / mean * 100, 2) if mean != 0 else 0.0
    p25 = _percentile(values, 25)
    p75 = _percentile(values, 75)
    iqr = round(p75 - p25, 4)
    minimum = min(values)
    maximum = max(values)
    value_range = round(maximum - minimum, 4)

    # --- Verteilungsmaße ---
    if HAS_SCIPY and n >= 5:
        skewness, kurtosis_val, trend_p, r2_scipy = _compute_with_scipy(values)
    else:
        skewness = _skewness(values, mean, std_dev)
        kurtosis_val = _kurtosis(values, mean, std_dev)
        trend_p = 1.0
        r2_scipy = None

    if math.isnan(skewness):
        skewness = 0.0
    if math.isnan(kurtosis_val):
        kurtosis_val = 0.0

    # --- Perzentilen ---
    p10 = _percentile(values, 10)
    p50 = _percentile(values, 50)
    p90 = _percentile(values, 90)
    p95 = _percentile(values, 95)
    p99 = _percentile(values, 99)

    # --- Trendmaße ---
    x_indices = list(range(n))
    slope, intercept, r2 = _linear_regression(x_indices, values)
    if r2_scipy is not None:
        r2 = r2_scipy  # scipy-Ergebnis ist genauer

    momentum_7 = _momentum(values, 7)
    momentum_30 = _momentum(values, 30)
    acceleration = round(momentum_7 - momentum_30, 2)

    # --- Vergleichsmaße ---
    # WoW: Mittelwert letzte 7 Tage vs. 7 Tage davor
    week_current = _mean(values[-7:]) if len(values) >= 7 else _mean(values)
    week_prev = _mean(values[-14:-7]) if len(values) >= 14 else _mean(values[:-7]) if len(values) > 7 else mean
    wow = _pct_change(week_current, week_prev)

    # MoM: Mittelwert letzte 30 Tage vs. 30 Tage davor
    month_current = _mean(values[-30:]) if len(values) >= 30 else _mean(values)
    month_prev = _mean(values[-60:-30]) if len(values) >= 60 else _mean(values[:-30]) if len(values) > 30 else mean
    mom = _pct_change(month_current, month_prev)

    # Letzter Wert vs. Gesamtdurchschnitt
    vs_avg = _pct_change(values[-1], mean) if values else 0.0

    # --- Anomalie-Scores ---
    z_scores_list = _z_scores(values, mean, std_dev)
    outlier_indices = [i for i, z in enumerate(z_scores_list) if abs(z) > 2.5]
    outlier_values = [round(values[i], 2) for i in outlier_indices]
    latest_z = z_scores_list[-1] if z_scores_list else 0.0

    # --- Saisonalität ---
    weekday_profile: dict[str, float] = {}
    best_wd = "Unbekannt"
    worst_wd = "Unbekannt"
    monthly_profile: dict[int, float] = {}

    if dates and len(dates) == n:
        weekday_profile, best_wd, worst_wd = _compute_weekday_profile(values, dates)
        if n >= 60:  # Mindestens 2 Monate für monatliche Analyse
            monthly_profile = _compute_monthly_profile(values, dates)

    # --- Trendsignifikanz ---
    trend_significant = trend_p < 0.05 if trend_p < 1.0 else False

    return MetricStats(
        n=n,
        metric_name=metric_name,
        mean=round(mean, 4),
        median=round(median, 4),
        trimmed_mean=round(trimmed, 4),
        std_dev=round(std_dev, 4),
        variance=round(variance, 4),
        cv=round(cv, 2),
        iqr=round(iqr, 4),
        value_range=round(value_range, 4),
        minimum=round(minimum, 4),
        maximum=round(maximum, 4),
        skewness=round(skewness, 4),
        kurtosis=round(kurtosis_val, 4),
        p10=round(p10, 4),
        p25=round(p25, 4),
        p50=round(p50, 4),
        p75=round(p75, 4),
        p90=round(p90, 4),
        p95=round(p95, 4),
        p99=round(p99, 4),
        linear_slope=slope,
        linear_r2=r2,
        momentum_7d=momentum_7,
        momentum_30d=momentum_30,
        acceleration=acceleration,
        wow_change=wow,
        mom_change=mom,
        vs_own_average=round(vs_avg, 2),
        z_scores=z_scores_list,
        outlier_indices=outlier_indices,
        outlier_values=outlier_values,
        latest_z_score=round(latest_z, 3),
        weekday_profile=weekday_profile,
        best_weekday=best_wd,
        worst_weekday=worst_wd,
        monthly_profile=monthly_profile,
        trend_is_significant=trend_significant,
        trend_p_value=round(trend_p, 6),
    )


def _empty_stats(metric_name: str) -> MetricStats:
    """Gibt ein leeres MetricStats-Objekt zurück (für fehlende Daten)."""
    return MetricStats(
        n=0,
        metric_name=metric_name,
        mean=0.0, median=0.0, trimmed_mean=0.0,
        std_dev=0.0, variance=0.0, cv=0.0, iqr=0.0, value_range=0.0,
        minimum=0.0, maximum=0.0,
        skewness=0.0, kurtosis=0.0,
        p10=0.0, p25=0.0, p50=0.0, p75=0.0, p90=0.0, p95=0.0, p99=0.0,
        linear_slope=0.0, linear_r2=0.0,
        momentum_7d=0.0, momentum_30d=0.0, acceleration=0.0,
        wow_change=0.0, mom_change=0.0, vs_own_average=0.0,
        z_scores=[], outlier_indices=[], outlier_values=[], latest_z_score=0.0,
        weekday_profile={}, best_weekday="Unbekannt", worst_weekday="Unbekannt",
        monthly_profile={},
        trend_is_significant=False, trend_p_value=1.0,
    )


# ---------------------------------------------------------------------------
# Batch-Analyse für alle Metriken auf einmal
# ---------------------------------------------------------------------------

@dataclass
class FullStatisticsBundle:
    """Statistische Analyse aller Kernmetriken eines Unternehmens."""

    revenue: MetricStats
    traffic: MetricStats
    conversion_rate: MetricStats
    new_customers: MetricStats
    computed_at: str


def compute_full_bundle(
    revenue: list[float],
    traffic: list[float],
    conversion_rate: list[float],
    new_customers: list[float],
    dates: Optional[list[date]] = None,
) -> FullStatisticsBundle:
    """
    Berechnet die statistische Analyse aller vier Kernmetriken parallel.

    Args:
        revenue:         Tägliche Umsätze in EUR
        traffic:         Tägliche Besucherzahlen
        conversion_rate: Tägliche Conversion Rate (Dezimalwert: 0.032 = 3.2%)
        new_customers:   Täglich neue Kunden
        dates:           Datumsangaben (für Saisonalitätsanalyse)

    Returns:
        FullStatisticsBundle mit MetricStats für jede Metrik
    """
    from datetime import datetime

    # Conversion Rate für Analyse in Prozent umwandeln (lesbarer)
    cr_pct = [v * 100 for v in conversion_rate]

    return FullStatisticsBundle(
        revenue=compute_stats(revenue, dates, "revenue"),
        traffic=compute_stats(traffic, dates, "traffic"),
        conversion_rate=compute_stats(cr_pct, dates, "conversion_rate"),
        new_customers=compute_stats(new_customers, dates, "new_customers"),
        computed_at=datetime.utcnow().isoformat(),
    )


# ---------------------------------------------------------------------------
# Kontext-Builder für KI (Schicht 11)
# ---------------------------------------------------------------------------

def build_statistics_context(bundle: FullStatisticsBundle) -> str:
    """
    Formatiert FullStatisticsBundle als präzisen Kontext-String für Claude.

    Enthält nur statistisch bedeutsame Informationen — keine Füllwörter.
    """
    lines: list[str] = []
    lines.append("STATISTISCHE ANALYSE:")

    def _metric_block(s: MetricStats, label: str, unit: str = "") -> list[str]:
        if s.n == 0:
            return [f"  {label}: Keine Daten"]
        u = f" {unit}" if unit else ""
        block = [
            f"  {label} (n={s.n}):",
            f"    Ø {s.mean:.2f}{u} | Median {s.median:.2f}{u} | σ {s.std_dev:.2f} | CV {s.cv:.1f}%",
            f"    Trend: {s.linear_slope:+.3f}{u}/Tag | R²={s.linear_r2:.2f} | {'✓ signifikant' if s.trend_is_significant else '○ nicht signifikant'} (p={s.trend_p_value:.3f})",
            f"    Momentum: 7d {s.momentum_7d:+.1f}% | 30d {s.momentum_30d:+.1f}% | Beschleunigung {s.acceleration:+.1f}pp",
            f"    WoW {s.wow_change:+.1f}% | MoM {s.mom_change:+.1f}% | vs.Ø {s.vs_own_average:+.1f}%",
        ]
        if s.outlier_indices:
            block.append(f"    Ausreißer: {len(s.outlier_indices)} Datenpunkte (|z|>2.5) | Letzter z={s.latest_z_score:+.2f}")
        if s.best_weekday and s.best_weekday != "Unbekannt":
            block.append(f"    Bester Tag: {s.best_weekday} | Schwächster Tag: {s.worst_weekday}")
        return block

    lines.extend(_metric_block(bundle.revenue, "Umsatz", "EUR"))
    lines.extend(_metric_block(bundle.traffic, "Traffic", "Besucher"))
    lines.extend(_metric_block(bundle.conversion_rate, "Conversion Rate", "%"))
    lines.extend(_metric_block(bundle.new_customers, "Neue Kunden", ""))

    return "\n".join(lines)
