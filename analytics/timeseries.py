"""
Schicht 3 — Zeitreihenanalyse
analytics/timeseries.py

Zerlegt jede Metrik in ihre Bestandteile:
  - STL Trend-Decomposition (Trend + Saisonalität + Residuen)
  - ADF Stationaritätstest (echter Trend nachweisbar?)
  - Autokorrelation (welcher Lag hat den stärksten Einfluss?)
  - Changepoint Detection (wann hat sich der Trend fundamental geändert?)
  - Wochentag-Analyse (statistisch signifikante Tagesunterschiede)
  - Intra-Monat-Analyse (Wochen 1–4 Profil)

Installationsempfehlung:
    pip install statsmodels ruptures
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
    from statsmodels.tsa.seasonal import STL
    from statsmodels.tsa.stattools import adfuller, acf, pacf
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False

try:
    import ruptures as rpt
    HAS_RUPTURES = True
except ImportError:
    HAS_RUPTURES = False

from analytics.statistics import _mean, _variance, _linear_regression, WEEKDAY_DE


# ---------------------------------------------------------------------------
# Datenstrukturen
# ---------------------------------------------------------------------------

@dataclass
class ChangePoint:
    """Ein erkannter Strukturbruch in der Zeitreihe."""

    index: int              # Position in der Zeitreihe
    date: Optional[str]     # ISO-Datum wenn dates vorhanden
    trend_before: float     # Mittlere Wachstumsrate vor dem Bruch (%/Woche)
    trend_after: float      # Mittlere Wachstumsrate nach dem Bruch (%/Woche)
    description: str        # "Von +3%/Woche auf -1%/Woche"


@dataclass
class WeekdayBreakdown:
    """Statistisches Profil nach Wochentag."""

    averages: dict[str, float]   # Wochentag → Durchschnittswert
    is_significant: dict[str, bool]  # Wochentag → statistisch signifikant?
    best_day: str
    worst_day: str
    spread_pct: float            # Unterschied Best vs. Worst in %


@dataclass
class IntramontBreakdown:
    """Statistisches Profil nach Monatswoche."""

    week1: float    # Tage 1–7
    week2: float    # Tage 8–14
    week3: float    # Tage 15–21
    week4: float    # Tage 22–31
    strongest_week: int  # 1–4
    weakest_week: int    # 1–4


@dataclass
class TimeSeriesAnalysis:
    """
    Vollständige Zeitreihenanalyse einer Metrik.

    Enthält alle Komponenten nach der Zerlegung.
    """

    n: int
    metric_name: str

    # STL-Zerlegung
    trend_component: list[float]        # Bereinigter Trend ohne Saisonrauschen
    seasonal_component: list[float]     # Isolierte saisonale Komponente
    residual_component: list[float]     # Unerklärliche Residuen (Anomalie-Signal)
    trend_strength: float               # 0–1: Wie stark ist der Trend?
    seasonal_strength: float            # 0–1: Wie stark ist die Saisonalität?
    stl_available: bool

    # Stationarität (ADF-Test)
    is_stationary: bool                 # True wenn kein echter Trend
    has_real_trend: bool                # True wenn statistisch signifikanter Trend
    adf_pvalue: float                   # p < 0.05 → echter Trend nachweisbar

    # Autokorrelation (ACF/PACF)
    autocorrelations: list[float]       # ACF Lags 1–14
    partial_autocorrelations: list[float]  # PACF Lags 1–14
    dominant_lag: int                   # Lag mit stärkster Korrelation
    dominant_lag_strength: float        # Stärke der Autokorrelation (|r|)

    # Changepoints
    changepoints: list[ChangePoint]
    most_recent_changepoint: Optional[ChangePoint]

    # Wochentag-Analyse
    weekday: WeekdayBreakdown

    # Intra-Monat-Analyse
    intramonth: IntramontBreakdown

    # Schätzung: Bereinigter Tageswert (ohne Saisoneffekt)
    today_deseasonalized: Optional[float]


# ---------------------------------------------------------------------------
# Pure-Python Fallbacks
# ---------------------------------------------------------------------------

def _simple_moving_average(values: list[float], window: int) -> list[float]:
    """Gleitender Durchschnitt als einfacher Trend-Ersatz."""
    result = []
    for i in range(len(values)):
        start = max(0, i - window + 1)
        end = i + 1
        result.append(_mean(values[start:end]))
    return result


def _simple_acf(values: list[float], max_lag: int = 14) -> list[float]:
    """
    Autokorrelation via Pearson-Korrelation mit Lag k.
    Pure-Python Fallback wenn statsmodels nicht verfügbar.
    """
    n = len(values)
    if n == 0:
        return []
    if n < 2:
        return [1.0]

    max_lag = min(max_lag, n - 1)

    mean = _mean(values)
    denom = sum((v - mean) ** 2 for v in values)
    if denom == 0:
        return [1.0] + [0.0] * max_lag

    result = [1.0]
    for lag in range(1, max_lag + 1):
        cov = sum((values[i] - mean) * (values[i - lag] - mean) for i in range(lag, n))
        result.append(round(cov / denom, 4))
    return result


def _detect_changepoints_fallback(values: list[float]) -> list[int]:
    """
    Einfache Changepoint-Erkennung via gleitendem Mittelwert.
    Erkennt Punkte wo sich der lokale Durchschnitt stark ändert.
    Fallback wenn ruptures nicht verfügbar.
    """
    if len(values) < 14:
        return []

    window = min(7, len(values) // 4)
    changepoints = []
    prev_avg = _mean(values[:window])

    for i in range(window, len(values) - window):
        curr_avg = _mean(values[i: i + window])
        if prev_avg != 0:
            change = abs((curr_avg - prev_avg) / abs(prev_avg))
            if change > 0.25:  # >25% Änderung im lokalen Durchschnitt
                # Prüfe ob dieser Changepoint nicht zu nah am letzten ist
                if not changepoints or i - changepoints[-1] > window:
                    changepoints.append(i)
        prev_avg = curr_avg

    return changepoints[:3]  # Max 3 Changepoints


# ---------------------------------------------------------------------------
# STL Decomposition
# ---------------------------------------------------------------------------

def _stl_decompose(
    values: list[float],
    period: int = 7,
) -> tuple[list[float], list[float], list[float], float, float, bool]:
    """
    STL-Zerlegung: Trend + Saison + Residuen.

    Args:
        values: Zeitreihe (mind. 2 × period Datenpunkte für STL)
        period: Saisonale Periode (7 für wöchentlich, 12 für monatlich)

    Returns:
        (trend, seasonal, residual, trend_strength, seasonal_strength, stl_used)
    """
    n = len(values)

    # STL braucht mindestens 2 × period + 1 Datenpunkte
    if HAS_STATSMODELS and HAS_NUMPY and n >= max(14, 2 * period + 1):
        try:
            arr = np.array(values, dtype=float)
            stl = STL(arr, period=period, robust=True)
            result = stl.fit()

            trend = list(result.trend)
            seasonal = list(result.seasonal)
            residual = list(result.resid)

            # Stärke-Maße nach Cleveland et al. (1990)
            var_resid = float(np.var(residual)) if residual else 1.0
            var_trend_plus_resid = float(np.var([t + r for t, r in zip(trend, residual)])) if trend else 1.0
            var_seas_plus_resid = float(np.var([s + r for s, r in zip(seasonal, residual)])) if seasonal else 1.0

            trend_strength = max(0.0, 1.0 - var_resid / var_trend_plus_resid) if var_trend_plus_resid > 0 else 0.0
            seasonal_strength = max(0.0, 1.0 - var_resid / var_seas_plus_resid) if var_seas_plus_resid > 0 else 0.0

            return (
                [round(v, 4) for v in trend],
                [round(v, 4) for v in seasonal],
                [round(v, 4) for v in residual],
                round(trend_strength, 3),
                round(seasonal_strength, 3),
                True,
            )
        except Exception:
            pass  # Fallback bei numerischen Problemen

    # Fallback: Einfacher gleitender Durchschnitt als Trend
    trend = _simple_moving_average(values, window=7)
    seasonal = [0.0] * n
    residual = [round(values[i] - trend[i], 4) for i in range(n)]

    # Einfache Trend-Stärke via R²
    x = list(range(n))
    slope, _, r2 = _linear_regression(x, trend)
    trend_strength = round(r2, 3)

    return (
        [round(v, 4) for v in trend],
        seasonal,
        residual,
        trend_strength,
        0.0,
        False,
    )


# ---------------------------------------------------------------------------
# ADF Stationaritätstest
# ---------------------------------------------------------------------------

def _test_stationarity(values: list[float]) -> tuple[bool, bool, float]:
    """
    Augmented Dickey-Fuller Test auf Stationarität.

    Returns:
        (is_stationary, has_real_trend, p_value)

    Interpretation:
        p < 0.05: Zeitreihe ist stationär (kein Unit Root → kontrollierter Trend möglich)
        p >= 0.05: Zeitreihe ist nicht-stationär (echter persistenter Trend)
    """
    if HAS_STATSMODELS and len(values) >= 8:
        try:
            result = adfuller(values, autolag="AIC")
            p_value = float(result[1])
            is_stationary = p_value < 0.05
            has_real_trend = not is_stationary
            return is_stationary, has_real_trend, round(p_value, 6)
        except Exception:
            pass

    # Fallback: Lineare Regression als Proxy
    n = len(values)
    if n < 4:
        return True, False, 1.0
    x = list(range(n))
    slope, _, r2 = _linear_regression(x, values)
    # Heuristik: Starker Trend wenn R² > 0.3 und Slope deutlich > 0
    has_trend = r2 > 0.3 and abs(slope) > 0.01 * _mean(values) if _mean(values) != 0 else False
    return not has_trend, has_trend, (1.0 - r2)  # Approximierter p-Wert


# ---------------------------------------------------------------------------
# Autokorrelation
# ---------------------------------------------------------------------------

def _compute_autocorrelations(
    values: list[float],
    max_lag: int = 14,
) -> tuple[list[float], list[float], int, float]:
    """
    Berechnet ACF und PACF.

    Returns:
        (acf_values, pacf_values, dominant_lag, dominant_lag_strength)
    """
    n = len(values)
    effective_lag = min(max_lag, n // 2 - 1)
    if effective_lag < 1:
        return [], [], 0, 0.0

    if HAS_STATSMODELS and HAS_NUMPY and n >= 10:
        try:
            arr = np.array(values, dtype=float)
            acf_vals = acf(arr, nlags=effective_lag, fft=True)[1:]  # Lag 0 weglassen
            pacf_vals = pacf(arr, nlags=effective_lag, method="ywm")[1:]

            acf_list = [round(float(v), 4) for v in acf_vals]
            pacf_list = [round(float(v), 4) for v in pacf_vals]
        except Exception:
            acf_list = _simple_acf(values, effective_lag)
            pacf_list = []
    else:
        acf_list = _simple_acf(values, effective_lag)
        pacf_list = []

    # Dominanter Lag (stärkste absolute Autokorrelation)
    if acf_list:
        dominant_idx = max(range(len(acf_list)), key=lambda i: abs(acf_list[i]))
        dominant_lag = dominant_idx + 1  # 1-basiert
        dominant_strength = round(abs(acf_list[dominant_idx]), 4)
    else:
        dominant_lag = 0
        dominant_strength = 0.0

    return acf_list, pacf_list, dominant_lag, dominant_strength


# ---------------------------------------------------------------------------
# Changepoint Detection
# ---------------------------------------------------------------------------

def _detect_changepoints(
    values: list[float],
    dates: Optional[list[date]] = None,
) -> tuple[list[ChangePoint], Optional[ChangePoint]]:
    """
    Erkennt strukturelle Brüche in der Zeitreihe.

    Verwendet ruptures (PELT-Algorithmus) wenn verfügbar,
    sonst einfache Heuristik.

    Returns:
        (changepoints, most_recent_changepoint)
    """
    n = len(values)
    if n < 14:
        return [], None

    # Changepoint-Indizes berechnen
    cp_indices: list[int] = []

    if HAS_RUPTURES and HAS_NUMPY:
        try:
            arr = np.array(values, dtype=float).reshape(-1, 1)
            algo = rpt.Pelt(model="rbf", min_size=7).fit(arr)
            raw = algo.predict(pen=max(1.0, _mean(values) * 0.1))
            # ruptures gibt den letzten Punkt immer zurück (n) — den ignorieren
            cp_indices = [i for i in raw if 0 < i < n]
        except Exception:
            cp_indices = _detect_changepoints_fallback(values)
    else:
        cp_indices = _detect_changepoints_fallback(values)

    # Changepoints zu strukturierten Objekten aufbauen
    def _weekly_growth(segment: list[float]) -> float:
        """Durchschnittliche Wachstumsrate in %/Woche für ein Segment."""
        if len(segment) < 2:
            return 0.0
        x = list(range(len(segment)))
        slope, _, _ = _linear_regression(x, segment)
        mean_val = _mean(segment)
        return round(slope / mean_val * 7 * 100, 1) if mean_val != 0 else 0.0

    changepoints: list[ChangePoint] = []
    prev_idx = 0
    for cp_idx in cp_indices:
        segment_before = values[prev_idx:cp_idx]
        segment_after = values[cp_idx: min(cp_idx + 30, n)]

        growth_before = _weekly_growth(segment_before)
        growth_after = _weekly_growth(segment_after)

        description = (
            f"Trend: {growth_before:+.1f}%/Woche → {growth_after:+.1f}%/Woche"
        )
        if growth_after > growth_before:
            description += " (Aufwärtswende)"
        elif growth_after < growth_before:
            description += " (Abwärtswende)"

        cp_date = dates[cp_idx].isoformat() if dates and cp_idx < len(dates) else None

        changepoints.append(ChangePoint(
            index=cp_idx,
            date=cp_date,
            trend_before=growth_before,
            trend_after=growth_after,
            description=description,
        ))
        prev_idx = cp_idx

    most_recent = changepoints[-1] if changepoints else None
    return changepoints, most_recent


# ---------------------------------------------------------------------------
# Wochentag-Analyse
# ---------------------------------------------------------------------------

def _compute_weekday_breakdown(
    values: list[float],
    dates: list[date],
) -> WeekdayBreakdown:
    """
    Statistisches Profil nach Wochentag mit Signifikanztest.

    Vergleicht jeden Wochentag-Durchschnitt gegen den Gesamtmittelwert.
    """
    buckets: dict[int, list[float]] = {i: [] for i in range(7)}
    for d, v in zip(dates, values):
        buckets[d.weekday()].append(v)

    global_mean = _mean(values)
    global_var = _variance(values, global_mean) if len(values) >= 2 else 0.0
    global_std = math.sqrt(global_var)

    averages: dict[str, float] = {}
    is_significant: dict[str, bool] = {}

    for wd_idx, day_values in buckets.items():
        day_name = WEEKDAY_DE[wd_idx]
        if not day_values:
            averages[day_name] = 0.0
            is_significant[day_name] = False
            continue

        day_avg = _mean(day_values)
        averages[day_name] = round(day_avg, 2)

        # Einfacher t-Test: Wochentag-Mittel vs. Gesamtmittel
        if global_std > 0 and len(day_values) >= 3:
            t_stat = abs(day_avg - global_mean) / (global_std / math.sqrt(len(day_values)))
            # Vereinfacht: t > 2 ≈ p < 0.05 bei df >= 10
            is_significant[day_name] = t_stat > 2.0
        else:
            is_significant[day_name] = False

    # Bester und schlechtester Tag
    valid_avgs = {k: v for k, v in averages.items() if v > 0}
    if valid_avgs:
        best_day = max(valid_avgs.items(), key=lambda x: x[1])[0]
        worst_day = min(valid_avgs.items(), key=lambda x: x[1])[0]
        best_val = valid_avgs[best_day]
        worst_val = valid_avgs[worst_day]
        spread = round((best_val - worst_val) / abs(worst_val) * 100, 1) if worst_val != 0 else 0.0
    else:
        best_day = "Unbekannt"
        worst_day = "Unbekannt"
        spread = 0.0

    return WeekdayBreakdown(
        averages=averages,
        is_significant=is_significant,
        best_day=best_day,
        worst_day=worst_day,
        spread_pct=spread,
    )


# ---------------------------------------------------------------------------
# Intra-Monat-Analyse
# ---------------------------------------------------------------------------

def _compute_intramonth_breakdown(
    values: list[float],
    dates: list[date],
) -> IntramontBreakdown:
    """
    Teilt den Monat in 4 Wochen und berechnet die durchschnittliche Performance.

    Woche 1: Tage 1–7   (Monatsbeginn-Effekt?)
    Woche 2: Tage 8–14
    Woche 3: Tage 15–21
    Woche 4: Tage 22–31 (Monatsende-Effekt?)
    """
    week_buckets: dict[int, list[float]] = {1: [], 2: [], 3: [], 4: []}

    for d, v in zip(dates, values):
        day = d.day
        if day <= 7:
            week_buckets[1].append(v)
        elif day <= 14:
            week_buckets[2].append(v)
        elif day <= 21:
            week_buckets[3].append(v)
        else:
            week_buckets[4].append(v)

    week_avgs = {w: _mean(vs) if vs else 0.0 for w, vs in week_buckets.items()}

    strongest = max(week_avgs.items(), key=lambda x: x[1])[0]
    weakest = min(week_avgs.items(), key=lambda x: x[1])[0]

    return IntramontBreakdown(
        week1=round(week_avgs[1], 2),
        week2=round(week_avgs[2], 2),
        week3=round(week_avgs[3], 2),
        week4=round(week_avgs[4], 2),
        strongest_week=strongest,
        weakest_week=weakest,
    )


# ---------------------------------------------------------------------------
# Heute entsaisonalisiert
# ---------------------------------------------------------------------------

def _deseasonalize_today(
    seasonal_component: list[float],
    dates: list[date],
    latest_value: float,
) -> Optional[float]:
    """
    Entfernt den Saisoneffekt vom heutigen Wert.
    Gibt den entsaisonalisierten Wert zurück.
    """
    if not seasonal_component or not dates:
        return None

    today = date.today()
    today_wd = today.weekday()

    # Finde den Durchschnitt der Saisonkomponente für den heutigen Wochentag
    wd_seasonal: list[float] = []
    for i, d in enumerate(dates):
        if d.weekday() == today_wd and i < len(seasonal_component):
            wd_seasonal.append(seasonal_component[i])

    if not wd_seasonal:
        return None

    avg_seasonal = _mean(wd_seasonal)
    return round(latest_value - avg_seasonal, 2)


# ---------------------------------------------------------------------------
# Haupt-Analysefunktion
# ---------------------------------------------------------------------------

def analyze_timeseries(
    values: list[float],
    dates: Optional[list[date]] = None,
    metric_name: str = "metric",
    period: int = 7,
) -> TimeSeriesAnalysis:
    """
    Vollständige Zeitreihenanalyse einer Metrik.

    Args:
        values:      Zeitreihe (chronologisch, ältester Wert zuerst)
        dates:       Datumsangaben (optional, für Wochentag/Saisonanalyse)
        metric_name: Name der Metrik
        period:      Saisonale Periode (Standard: 7 für wöchentlich)

    Returns:
        TimeSeriesAnalysis mit allen Ergebnissen

    Raises:
        Niemals — alle Fehler werden intern abgefangen
    """
    n = len(values)

    if n == 0:
        return _empty_timeseries(metric_name)

    # Sicherstellung: dates und values haben gleiche Länge
    if dates and len(dates) != n:
        dates = None  # Inkonsistente Daten → Saisonanalyse deaktivieren

    # --- STL Decomposition ---
    trend, seasonal, residual, trend_strength, seasonal_strength, stl_used = _stl_decompose(
        values, period=period
    )

    # --- Stationaritätstest ---
    is_stationary, has_real_trend, adf_pvalue = _test_stationarity(values)

    # --- Autokorrelation ---
    acf_vals, pacf_vals, dominant_lag, dominant_strength = _compute_autocorrelations(
        values, max_lag=min(14, n // 2 - 1)
    )

    # --- Changepoints ---
    changepoints, most_recent_cp = _detect_changepoints(values, dates)

    # --- Wochentag-Analyse ---
    if dates and n >= 14:
        weekday_breakdown = _compute_weekday_breakdown(values, dates)
    else:
        weekday_breakdown = WeekdayBreakdown(
            averages={}, is_significant={},
            best_day="Unbekannt", worst_day="Unbekannt", spread_pct=0.0,
        )

    # --- Intra-Monat-Analyse ---
    if dates and n >= 28:
        intramonth = _compute_intramonth_breakdown(values, dates)
    else:
        intramonth = IntramontBreakdown(
            week1=0.0, week2=0.0, week3=0.0, week4=0.0,
            strongest_week=1, weakest_week=1,
        )

    # --- Entsaisonalisierter Tageswert ---
    today_deseasonalized = None
    if stl_used and values:
        today_deseasonalized = _deseasonalize_today(seasonal, dates or [], values[-1])

    slope, _, _ = _linear_regression(list(range(n)), values)
    trend_direction = "up" if slope > 0.01 else "down" if slope < -0.01 else "flat"

    ts = TimeSeriesAnalysis(
        n=n,
        metric_name=metric_name,
        trend_component=trend,
        seasonal_component=seasonal,
        residual_component=residual,
        trend_strength=trend_strength,
        seasonal_strength=seasonal_strength,
        stl_available=stl_used,
        is_stationary=is_stationary,
        has_real_trend=has_real_trend,
        adf_pvalue=adf_pvalue,
        autocorrelations=acf_vals,
        partial_autocorrelations=pacf_vals,
        dominant_lag=dominant_lag,
        dominant_lag_strength=dominant_strength,
        changepoints=changepoints,
        most_recent_changepoint=most_recent_cp,
        weekday=weekday_breakdown,
        intramonth=intramonth,
        today_deseasonalized=today_deseasonalized,
    )

    # Zusatzfelder für Tests/Downstream-Consumers
    ts.trend_slope = slope
    ts.trend_direction = trend_direction
    ts.weekday_breakdown = weekday_breakdown
    return ts


def _empty_timeseries(metric_name: str) -> TimeSeriesAnalysis:
    """Leeres TimeSeriesAnalysis-Objekt für fehlende Daten."""
    ts = TimeSeriesAnalysis(
        n=0,
        metric_name=metric_name,
        trend_component=[],
        seasonal_component=[],
        residual_component=[],
        trend_strength=0.0,
        seasonal_strength=0.0,
        stl_available=False,
        is_stationary=True,
        has_real_trend=False,
        adf_pvalue=1.0,
        autocorrelations=[],
        partial_autocorrelations=[],
        dominant_lag=0,
        dominant_lag_strength=0.0,
        changepoints=[],
        most_recent_changepoint=None,
        weekday=WeekdayBreakdown(
            averages={}, is_significant={},
            best_day="Unbekannt", worst_day="Unbekannt", spread_pct=0.0,
        ),
        intramonth=IntramontBreakdown(
            week1=0.0, week2=0.0, week3=0.0, week4=0.0,
            strongest_week=1, weakest_week=1,
        ),
        today_deseasonalized=None,
    )

    ts.trend_slope = 0.0
    ts.trend_direction = "stable"
    ts.weekday_breakdown = ts.weekday
    return ts


# ---------------------------------------------------------------------------
# Batch-Analyse
# ---------------------------------------------------------------------------

@dataclass
class TimeSeriesBundle:
    """Zeitreihenanalyse aller Kernmetriken."""

    revenue: TimeSeriesAnalysis
    traffic: TimeSeriesAnalysis
    conversion_rate: TimeSeriesAnalysis
    new_customers: TimeSeriesAnalysis


def analyze_all_timeseries(
    revenue: list[float],
    traffic: list[float],
    conversion_rate: list[float],
    new_customers: list[float],
    dates: Optional[list[date]] = None,
) -> TimeSeriesBundle:
    """
    Analysiert alle vier Kernmetriken.

    Conversion Rate wird intern als Prozent (0.032 × 100 = 3.2) behandelt.
    """
    cr_pct = [v * 100 for v in conversion_rate]

    return TimeSeriesBundle(
        revenue=analyze_timeseries(revenue, dates, "revenue"),
        traffic=analyze_timeseries(traffic, dates, "traffic"),
        conversion_rate=analyze_timeseries(cr_pct, dates, "conversion_rate"),
        new_customers=analyze_timeseries(new_customers, dates, "new_customers"),
    )


# ---------------------------------------------------------------------------
# Kontext-Builder für KI (Schicht 11)
# ---------------------------------------------------------------------------

def build_timeseries_context(bundle: TimeSeriesBundle) -> str:
    """
    Formatiert TimeSeriesBundle als präzisen Kontext-String für Claude.

    Enthält nur auswertbare Erkenntnisse — keine Rohdaten.
    """
    lines: list[str] = ["ZEITREIHENANALYSE:"]

    def _ts_block(ts: TimeSeriesAnalysis, label: str) -> list[str]:
        if ts.n == 0:
            return [f"  {label}: Keine Daten"]

        block = [f"  {label} (n={ts.n}):"]

        # STL
        if ts.stl_available:
            block.append(
                f"    STL: Trend-Stärke {ts.trend_strength:.2f} | Saisonalität {ts.seasonal_strength:.2f}"
            )
            if ts.today_deseasonalized is not None:
                block.append(f"    Entsaisonalisiert heute: {ts.today_deseasonalized:.2f}")
        else:
            block.append("    STL: statsmodels nicht verfügbar — einfacher Trend")

        # ADF
        trend_desc = "echter Trend nachweisbar" if ts.has_real_trend else "kein signifikanter Trend"
        block.append(f"    ADF-Test: {trend_desc} (p={ts.adf_pvalue:.3f})")

        # Autokorrelation
        if ts.dominant_lag > 0:
            block.append(
                f"    Dominanter Lag: {ts.dominant_lag} Tage (r={ts.dominant_lag_strength:.3f})"
            )

        # Changepoints
        if ts.changepoints:
            cp = ts.most_recent_changepoint
            if cp:
                date_str = f" am {cp.date}" if cp.date else ""
                block.append(f"    Letzter Strukturbruch{date_str}: {cp.description}")

        # Wochentag
        wd = ts.weekday
        if wd.best_day != "Unbekannt":
            sig_days = [d for d, sig in wd.is_significant.items() if sig]
            block.append(
                f"    Wochentag: Stark {wd.best_day} | Schwach {wd.worst_day} | Spread {wd.spread_pct:+.1f}%"
            )
            if sig_days:
                block.append(f"    Statistisch signifikant: {', '.join(sig_days)}")

        # Intra-Monat
        im = ts.intramonth
        if im.week1 > 0 or im.week2 > 0:
            block.append(
                f"    Monats-Profil: W1={im.week1:.0f} | W2={im.week2:.0f} | W3={im.week3:.0f} | W4={im.week4:.0f}"
                f" → stärkste Woche: {im.strongest_week}"
            )

        return block

    lines.extend(_ts_block(bundle.revenue, "Umsatz"))
    lines.extend(_ts_block(bundle.traffic, "Traffic"))
    lines.extend(_ts_block(bundle.conversion_rate, "Conversion Rate"))
    lines.extend(_ts_block(bundle.new_customers, "Neue Kunden"))

    return "\n".join(lines)
