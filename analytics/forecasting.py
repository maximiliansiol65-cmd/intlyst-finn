"""
Schicht 6 — Prognosemodelle
analytics/forecasting.py

Drei Modelle parallel. Ensemble-Methode für maximale Genauigkeit.

Modell 1: ETS (Exponential Smoothing)         — Kurzfrist 1–14 Tage
Modell 2: SARIMAX (ARIMA mit Saisonalität)    — Mittelfrist 14–60 Tage
Modell 3: Simple Trend Extrapolation          — Langfrist-Fallback

Ensemble: Gewichtetes Mittel basierend auf In-Sample MAE.

Installationsempfehlung:
    pip install statsmodels (bereits in requirements.txt)
    pip install prophet  (optional, sehr groß: ~500MB)
"""

import math
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False

try:
    from prophet import Prophet
    import pandas as pd
    HAS_PROPHET = True
except ImportError:
    HAS_PROPHET = False

from analytics.statistics import _mean, _linear_regression


# ---------------------------------------------------------------------------
# Datenstrukturen
# ---------------------------------------------------------------------------

@dataclass
class ForecastPoint:
    """Ein einzelner Prognosepunkt."""

    date: str               # ISO-Datum
    value: float            # Prognostizierter Wert
    lower: float            # Untere Konfidenzgrenze
    upper: float            # Obere Konfidenzgrenze
    is_forecast: bool       # True = Prognose, False = historischer Wert


@dataclass
class ModelForecast:
    """Ergebnis eines einzelnen Prognosemodells."""

    model_name: str         # "ets" | "sarimax" | "trend" | "prophet"
    points: list[float]     # Prognostizierte Werte
    mae: float              # Mean Absolute Error (In-Sample, letzte 7 Tage)
    weight: float           # Ensemble-Gewicht (0–1)
    available: bool         # Konnte das Modell berechnet werden?


@dataclass
class ForecastResult:
    """Vollständige Prognose für eine Metrik."""

    metric: str
    horizon_days: int

    # Historische Daten als ForecastPoints
    historical: list[ForecastPoint]

    # Ensemble-Prognose
    forecast: list[ForecastPoint]

    # Individuelle Modelle
    models: list[ModelForecast]

    # Überblick
    trend: str                          # "up" | "down" | "stable"
    trend_pct: float                    # Trendstärke in % (letzte 30 Tage)
    growth_pct_30d: float               # Prognostiziertes Wachstum in 30 Tagen
    confidence: int                     # 0–100

    # Tages-Vorhersage
    today_forecast: float               # Wert für heute
    today_range: tuple[float, float]    # (lower, upper)
    today_explanation: str              # Warum dieser Wert?

    # Monatsziel-Projektion
    month_projection: Optional["MonthProjection"]

    # Zusammenfassung
    summary: str


@dataclass
class MonthProjection:
    """Projektion ob das Monatsziel erreichbar ist."""

    target: float                       # Monatsziel
    current_month_to_date: float        # Bereits erreichter Wert
    projected_month_end: float          # Prognostizierter Monatsendwert
    gap: float                          # Lücke zum Ziel (negativ = hinter Plan)
    daily_needed: float                 # Benötigter Tagesumsatz für Rest des Monats
    feasibility_pct: float              # Wahrscheinlichkeit Ziel zu erreichen (0–100)
    days_remaining: int
    status: str                         # "on_track" | "at_risk" | "behind" | "achieved"


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _compute_mae(actuals: list[float], predicted: list[float]) -> float:
    """Mean Absolute Error."""
    n = min(len(actuals), len(predicted))
    if n == 0:
        return 0.0
    return _mean([abs(actuals[i] - predicted[i]) for i in range(n)])


def _confidence_from_volatility(values: list[float], horizon: int) -> int:
    """Schätzt die Prognose-Konfidenz basierend auf Volatilität und Horizont."""
    if not values:
        return 50
    mean_val = _mean(values)
    if mean_val == 0:
        return 50
    std = math.sqrt(_mean([(v - mean_val) ** 2 for v in values]))
    cv = std / mean_val  # Coefficient of Variation
    # Konfidenz sinkt mit hoher Volatilität und langem Horizont
    base_confidence = max(40, min(90, int(90 - cv * 100)))
    horizon_penalty = min(20, int(horizon / 7 * 5))  # -5% pro Woche
    return max(30, base_confidence - horizon_penalty)


def _future_dates(horizon: int) -> list[str]:
    """Erzeugt Liste der nächsten N Datum-Strings."""
    return [(date.today() + timedelta(days=i + 1)).isoformat() for i in range(horizon)]


def _confidence_band(value: float, cv: float, horizon_day: int, total_horizon: int) -> tuple[float, float]:
    """Konfidenzband das sich mit dem Horizont aufweitet."""
    base_band = max(0.05, min(0.25, cv))
    expansion = 1.0 + 0.15 * math.sqrt((horizon_day + 1) / max(1, total_horizon))
    band = base_band * expansion
    lower = max(0.0, value * (1 - band))
    upper = value * (1 + band)
    return round(lower, 4), round(upper, 4)


# ---------------------------------------------------------------------------
# Modell 1: ETS (Exponential Smoothing)
# ---------------------------------------------------------------------------

def _forecast_ets(values: list[float], horizon: int) -> ModelForecast:
    """
    Exponential Triple Smoothing (Holt-Winters).
    Berücksichtigt Trend + Saisonalität (Periode 7).
    Gut für Kurzfrist-Prognosen.
    """
    if not HAS_STATSMODELS or not HAS_NUMPY or len(values) < 14:
        return ModelForecast("ets", [], float("inf"), 0.0, False)

    try:
        arr = np.array(values, dtype=float)

        # Saisonale ETS wenn genug Daten, sonst einfacher Trend
        if len(values) >= 21:
            model = ExponentialSmoothing(
                arr,
                trend="add",
                seasonal="add",
                seasonal_periods=7,
                initialization_method="estimated",
            )
        else:
            model = ExponentialSmoothing(arr, trend="add", initialization_method="estimated")

        fit = model.fit(optimized=True, use_brute=False)
        forecast_raw = fit.forecast(horizon)

        # In-Sample MAE der letzten 7 Tage
        fitted = fit.fittedvalues
        mae = _compute_mae(values[-7:], list(fitted[-7:]))

        return ModelForecast(
            model_name="ets",
            points=[max(0.0, round(float(v), 4)) for v in forecast_raw],
            mae=round(mae, 4),
            weight=0.0,  # wird im Ensemble gesetzt
            available=True,
        )
    except Exception:
        return ModelForecast("ets", [], float("inf"), 0.0, False)


# ---------------------------------------------------------------------------
# Modell 2: SARIMAX (ARIMA mit Saisonalität)
# ---------------------------------------------------------------------------

def _forecast_sarimax(values: list[float], horizon: int) -> ModelForecast:
    """
    SARIMAX — Seasonal ARIMA.
    Konservative Parameter für Stabilität: ARIMA(1,1,1)(1,0,1,7).
    Gut für Mittelfrist-Prognosen.
    """
    if not HAS_STATSMODELS or not HAS_NUMPY or len(values) < 21:
        return ModelForecast("sarimax", [], float("inf"), 0.0, False)

    try:
        import warnings
        arr = np.array(values, dtype=float)

        # Konservative Parameter — schnell und stabil
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = SARIMAX(
                arr,
                order=(1, 1, 1),
                seasonal_order=(1, 0, 1, 7),
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            fit = model.fit(disp=False, maxiter=100)
        forecast_obj = fit.get_forecast(steps=horizon)
        forecast_mean = forecast_obj.predicted_mean

        # In-Sample MAE
        fitted = fit.fittedvalues
        mae = _compute_mae(values[-7:], list(fitted[-7:]))

        return ModelForecast(
            model_name="sarimax",
            points=[max(0.0, round(float(v), 4)) for v in forecast_mean],
            mae=round(mae, 4),
            weight=0.0,
            available=True,
        )
    except Exception:
        return ModelForecast("sarimax", [], float("inf"), 0.0, False)


# ---------------------------------------------------------------------------
# Modell 3: Prophet (Facebook, optional)
# ---------------------------------------------------------------------------

def _forecast_prophet(values: list[float], dates: Optional[list[date]], horizon: int) -> ModelForecast:
    """
    Facebook Prophet — berücksichtigt Feiertage + nichtlineare Trends.
    Nur verfügbar wenn prophet installiert ist.
    """
    if not HAS_PROPHET or not dates or len(values) < 21:
        return ModelForecast("prophet", [], float("inf"), 0.0, False)

    try:
        df = pd.DataFrame({"ds": [str(d) for d in dates[-len(values):]], "y": values[-len(values):]})
        df["ds"] = pd.to_datetime(df["ds"])

        model = Prophet(
            yearly_seasonality=False,
            weekly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=0.05,
        )
        model.fit(df)

        future = model.make_future_dataframe(periods=horizon)
        forecast = model.predict(future)
        forecast_vals = forecast["yhat"].tail(horizon).tolist()

        # In-Sample MAE
        in_sample = model.predict(df)
        mae = _compute_mae(list(df["y"]), list(in_sample["yhat"]))

        return ModelForecast(
            model_name="prophet",
            points=[max(0.0, round(float(v), 4)) for v in forecast_vals],
            mae=round(mae, 4),
            weight=0.0,
            available=True,
        )
    except Exception:
        return ModelForecast("prophet", [], float("inf"), 0.0, False)


# ---------------------------------------------------------------------------
# Modell 4: Trend-Extrapolation (immer verfügbar, als Fallback)
# ---------------------------------------------------------------------------

def _forecast_trend(values: list[float], horizon: int) -> ModelForecast:
    """
    Lineare Trendextrapolation mit exponentieller Dämpfung.
    Immer verfügbar — dient als Fallback wenn andere Modelle scheitern.
    """
    if len(values) < 7:
        last = values[-1] if values else 0.0
        return ModelForecast(
            "trend",
            [round(last, 4)] * horizon,
            0.0,
            0.0,
            True,
        )

    window = min(14, len(values))
    recent = values[-window:]
    x = list(range(window))
    slope, intercept, _ = _linear_regression(x, recent)

    # Dämpfung: Mean Reversion — Slope nimmt über Zeit ab
    base = recent[-1]
    points = []
    for i in range(horizon):
        dampened_slope = slope * (0.95 ** i)
        projected = max(0.0, base + dampened_slope * (i + 1))
        points.append(round(projected, 4))

    # In-Sample MAE der letzten 7 Tage
    fitted = [intercept + slope * xi for xi in x]
    mae = _compute_mae(recent, fitted)

    return ModelForecast(
        model_name="trend",
        points=points,
        mae=round(mae, 4),
        weight=0.0,
        available=True,
    )


# ---------------------------------------------------------------------------
# Ensemble
# ---------------------------------------------------------------------------

def _build_ensemble(models: list[ModelForecast], horizon: int) -> list[float]:
    """
    Gewichtetes Mittel der verfügbaren Modelle.

    Gewichtung: w_i = 1 / MAE_i (bessere Modelle bekommen mehr Gewicht).
    Normiert so dass Summe der Gewichte = 1.
    """
    available = [m for m in models if m.available and m.points and m.mae < float("inf")]
    if not available:
        return [0.0] * horizon

    # Gewichte basierend auf inversem MAE
    inv_maes = [1.0 / (m.mae + 1e-6) for m in available]
    total = sum(inv_maes)
    weights = [w / total for w in inv_maes]

    # Gewichte in Modelle zurückschreiben
    for i, model in enumerate(available):
        model.weight = round(weights[i], 4)

    # Ensemble-Werte berechnen
    ensemble = []
    for step in range(horizon):
        val = sum(weights[i] * available[i].points[step] for i in range(len(available)) if step < len(available[i].points))
        ensemble.append(max(0.0, round(val, 4)))

    return ensemble


# ---------------------------------------------------------------------------
# Monatsziel-Projektion
# ---------------------------------------------------------------------------

def _project_month_goal(
    forecast_values: list[float],
    forecast_dates: list[str],
    revenue_today_month: float,
    monthly_target: Optional[float],
    days_remaining: int,
) -> Optional[MonthProjection]:
    """
    Berechnet ob das Monatsziel erreichbar ist.

    Args:
        forecast_values:      Prognostizierte Tageswerte
        forecast_dates:       ISO-Daten der Prognose
        revenue_today_month:  Bereits erreichter Umsatz im aktuellen Monat
        monthly_target:       Monatsziel in EUR
        days_remaining:       Verbleibende Tage im Monat
    """
    if not monthly_target or monthly_target <= 0:
        return None

    today = date.today()

    # Summiere Prognose für die verbleibenden Tage des aktuellen Monats
    projected_remaining = 0.0
    for val, date_str in zip(forecast_values, forecast_dates):
        try:
            d = date.fromisoformat(date_str)
            if d.month == today.month and d.year == today.year:
                projected_remaining += val
        except ValueError:
            continue

    projected_total = revenue_today_month + projected_remaining
    gap = projected_total - monthly_target
    daily_needed = (monthly_target - revenue_today_month) / max(1, days_remaining)

    # Feasibility: Wie realistisch ist der benötigte Tageswert?
    # Basis: Durchschnittliche prognostizierte Tagesleistung
    avg_forecast_daily = _mean(forecast_values[:days_remaining]) if forecast_values else 0.0
    if daily_needed <= 0:
        feasibility = 100.0
    elif avg_forecast_daily > 0:
        ratio = avg_forecast_daily / daily_needed
        # ratio > 1: forecasted performance > needed → wahrscheinlich erreichbar
        feasibility = min(100.0, max(0.0, ratio * 80.0))
    else:
        feasibility = 0.0

    # Status
    progress = revenue_today_month / monthly_target * 100
    if projected_total >= monthly_target:
        status = "on_track"
    elif feasibility > 50:
        status = "at_risk"
    else:
        status = "behind"

    if progress >= 100:
        status = "achieved"

    return MonthProjection(
        target=round(monthly_target, 2),
        current_month_to_date=round(revenue_today_month, 2),
        projected_month_end=round(projected_total, 2),
        gap=round(gap, 2),
        daily_needed=round(daily_needed, 2),
        feasibility_pct=round(feasibility, 1),
        days_remaining=days_remaining,
        status=status,
    )


# ---------------------------------------------------------------------------
# Tages-Vorhersage
# ---------------------------------------------------------------------------

def _explain_today_forecast(
    today_value: float,
    historical_mean: float,
    weekday_avg: Optional[float],
    momentum_7d: float,
    cv: float,
) -> str:
    """Erzeugt eine lesbare Erklärung für die heutige Prognose."""
    today_wd = date.today().strftime("%A")
    weekday_map = {
        "Monday": "Montag", "Tuesday": "Dienstag", "Wednesday": "Mittwoch",
        "Thursday": "Donnerstag", "Friday": "Freitag", "Saturday": "Samstag", "Sunday": "Sonntag",
    }
    wd_de = weekday_map.get(today_wd, today_wd)

    parts = []

    # Wochentag-Effekt
    if weekday_avg and historical_mean > 0:
        wd_effect = (weekday_avg - historical_mean) / historical_mean * 100
        if abs(wd_effect) > 5:
            direction = "stärker" if wd_effect > 0 else "schwächer"
            parts.append(f"{wd_de} historisch {abs(wd_effect):.0f}% {direction} als Ø")

    # Momentum
    if abs(momentum_7d) > 3:
        direction = "steigendem" if momentum_7d > 0 else "fallendem"
        parts.append(f"7-Tage-Momentum {momentum_7d:+.1f}%")

    # Volatilität
    if cv > 0.15:
        parts.append(f"hohe Volatilität ({cv*100:.0f}% CV)")

    if not parts:
        parts = ["stabiler Trend"]

    return f"Basis: {', '.join(parts)}"


# ---------------------------------------------------------------------------
# Haupt-Prognosefunktion
# ---------------------------------------------------------------------------

def forecast_metric(
    values: list[float],
    dates: Optional[list[date]] = None,
    metric: str = "revenue",
    horizon_days: int = 30,
    monthly_target: Optional[float] = None,
    weekday_profile: Optional[dict[str, float]] = None,
) -> ForecastResult:
    """
    Erstellt eine vollständige Ensemble-Prognose für eine Metrik.

    Args:
        values:           Zeitreihe (chronologisch, ältester Wert zuerst)
        dates:            Dazugehörige Datumsangaben
        metric:           Name der Metrik
        horizon_days:     Prognosehorizont in Tagen
        monthly_target:   Monatsziel (für Zielerreichungs-Projektion)
        weekday_profile:  Historisches Wochentag-Profil (für Tages-Erklärung)

    Returns:
        ForecastResult mit Ensemble-Prognose und Einzelmodellen
    """
    n = len(values)
    if n == 0:
        return _empty_forecast(metric, horizon_days)

    today = date.today()
    future_date_strs = _future_dates(horizon_days)

    # Coefficient of Variation (Volatilitätsmass)
    mean_val = _mean(values)
    std_val = math.sqrt(_mean([(v - mean_val) ** 2 for v in values])) if n > 1 else 0.0
    cv = std_val / mean_val if mean_val > 0 else 0.0

    # --- Einzelmodelle ---
    ets_model   = _forecast_ets(values, horizon_days)
    sarima_model = _forecast_sarimax(values, horizon_days)
    prophet_model = _forecast_prophet(values, dates, horizon_days)
    trend_model = _forecast_trend(values, horizon_days)

    all_models = [ets_model, sarima_model, prophet_model, trend_model]

    # --- Ensemble ---
    ensemble_values = _build_ensemble(all_models, horizon_days)

    # --- Konfidenzband ---
    forecast_points: list[ForecastPoint] = []
    for i, val in enumerate(ensemble_values):
        lower, upper = _confidence_band(val, cv, i, horizon_days)
        forecast_points.append(ForecastPoint(
            date=future_date_strs[i],
            value=val,
            lower=lower,
            upper=upper,
            is_forecast=True,
        ))

    # --- Historische Punkte (letzte 30 Tage für Chart) ---
    display_days = min(30, n)
    hist_values = values[-display_days:]
    hist_dates = dates[-display_days:] if dates and len(dates) >= display_days else None

    historical: list[ForecastPoint] = []
    for i, v in enumerate(hist_values):
        d_str = hist_dates[i].isoformat() if hist_dates else (today - timedelta(days=display_days - i)).isoformat()
        historical.append(ForecastPoint(
            date=d_str,
            value=round(v, 4),
            lower=round(v, 4),
            upper=round(v, 4),
            is_forecast=False,
        ))

    # --- Trend-Einschätzung ---
    if ensemble_values:
        slope_val = ensemble_values[-1] - ensemble_values[0] if len(ensemble_values) > 1 else 0.0
        trend = "up" if slope_val > mean_val * 0.03 else "down" if slope_val < -mean_val * 0.03 else "stable"
    else:
        trend = "stable"

    # Wachstum in 30 Tagen
    target_day = min(29, len(ensemble_values) - 1)
    growth_30d = ((ensemble_values[target_day] - values[-1]) / values[-1] * 100) if values[-1] > 0 and ensemble_values else 0.0

    # --- Tages-Vorhersage ---
    today_val = ensemble_values[0] if ensemble_values else mean_val
    today_lower, today_upper = _confidence_band(today_val, cv, 0, horizon_days)

    # Momentum 7d
    if n >= 14:
        recent = values[-7:]
        older = values[-14:-7]
        momentum_7d = (_mean(recent) - _mean(older)) / _mean(older) * 100 if _mean(older) > 0 else 0.0
    else:
        momentum_7d = 0.0

    # Wochentag-Durchschnitt für heute
    today_wd = today.strftime("%A")
    wd_map = {"Monday": "Montag", "Tuesday": "Dienstag", "Wednesday": "Mittwoch",
               "Thursday": "Donnerstag", "Friday": "Freitag", "Saturday": "Samstag", "Sunday": "Sonntag"}
    weekday_avg = weekday_profile.get(wd_map.get(today_wd, today_wd)) if weekday_profile else None

    today_explanation = _explain_today_forecast(today_val, mean_val, weekday_avg, momentum_7d, cv)

    # --- Konfidenz ---
    confidence = _confidence_from_volatility(values, horizon_days)

    # --- Monatsziel-Projektion ---
    month_proj = None
    if monthly_target and monthly_target > 0:
        # Bereits erreichter Monatsanteil
        month_to_date = 0.0
        if dates:
            month_to_date = sum(v for d, v in zip(dates, values) if d.month == today.month and d.year == today.year)
        else:
            # Schätzung: Tage im Monat bisher × Tagesdurchschnitt
            day_of_month = today.day
            month_to_date = mean_val * day_of_month

        import calendar
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        days_remaining = days_in_month - today.day

        month_proj = _project_month_goal(
            ensemble_values, future_date_strs,
            month_to_date, monthly_target, days_remaining,
        )

    # --- Zusammenfassung ---
    active_models = [m.model_name.upper() for m in all_models if m.available and m.points]
    summary = (
        f"Ensemble ({', '.join(active_models)}): "
        f"Heute {today_val:.0f} (±{(today_upper - today_lower) / 2:.0f}), "
        f"Trend {trend}, 30-Tage-Wachstum {growth_30d:+.1f}%, "
        f"Konfidenz {confidence}%"
    )

    return ForecastResult(
        metric=metric,
        horizon_days=horizon_days,
        historical=historical,
        forecast=forecast_points,
        models=all_models,
        trend=trend,
        trend_pct=round(growth_30d, 2),
        growth_pct_30d=round(growth_30d, 2),
        confidence=confidence,
        today_forecast=round(today_val, 2),
        today_range=(round(today_lower, 2), round(today_upper, 2)),
        today_explanation=today_explanation,
        month_projection=month_proj,
        summary=summary,
    )


def _empty_forecast(metric: str, horizon: int) -> ForecastResult:
    return ForecastResult(
        metric=metric,
        horizon_days=horizon,
        historical=[],
        forecast=[],
        models=[],
        trend="stable",
        trend_pct=0.0,
        growth_pct_30d=0.0,
        confidence=0,
        today_forecast=0.0,
        today_range=(0.0, 0.0),
        today_explanation="Keine Daten verfügbar",
        month_projection=None,
        summary="Keine Daten für Prognose",
    )


# ---------------------------------------------------------------------------
# Batch-Prognose aller Metriken
# ---------------------------------------------------------------------------

@dataclass
class ForecastBundle:
    """Prognosen für alle Kernmetriken."""

    revenue: ForecastResult
    traffic: ForecastResult
    conversion_rate: ForecastResult
    new_customers: ForecastResult


def forecast_all_metrics(
    revenue: list[float],
    traffic: list[float],
    conversion_rate: list[float],
    new_customers: list[float],
    dates: Optional[list[date]] = None,
    horizon_days: int = 30,
    monthly_revenue_target: Optional[float] = None,
    weekday_profile: Optional[dict[str, float]] = None,
) -> ForecastBundle:
    """
    Erstellt Prognosen für alle vier Kernmetriken.

    Conversion Rate wird in Prozent umgerechnet für die Prognose.
    """
    cr_pct = [v * 100 for v in conversion_rate]

    return ForecastBundle(
        revenue=forecast_metric(revenue, dates, "revenue", horizon_days, monthly_revenue_target, weekday_profile),
        traffic=forecast_metric(traffic, dates, "traffic", horizon_days),
        conversion_rate=forecast_metric(cr_pct, dates, "conversion_rate", horizon_days),
        new_customers=forecast_metric(new_customers, dates, "new_customers", horizon_days),
    )


# ---------------------------------------------------------------------------
# Kontext-Builder für KI und Briefing (Schicht 11)
# ---------------------------------------------------------------------------

def build_forecast_context(bundle: ForecastBundle) -> str:
    """
    Formatiert ForecastBundle als Kontext-String für Claude.
    """
    lines = ["PROGNOSE (Ensemble-Modell):"]

    def _metric_line(fr: ForecastResult, label: str, unit: str = "") -> list[str]:
        if fr.confidence == 0:
            return [f"  {label}: Keine Daten"]
        u = unit + " " if unit else ""
        block = [
            f"  {label}:",
            f"    Heute: {u}{fr.today_forecast:,.2f} ({fr.today_range[0]:,.0f}–{fr.today_range[1]:,.0f})",
            f"    {fr.today_explanation}",
            f"    Trend 30d: {fr.trend} ({fr.growth_pct_30d:+.1f}%) | Konfidenz: {fr.confidence}%",
        ]
        if fr.month_projection:
            mp = fr.month_projection
            block.append(
                f"    Monats-Projektion: {u}{mp.projected_month_end:,.0f} / Ziel {u}{mp.target:,.0f} "
                f"| Lücke {u}{mp.gap:,.0f} | {mp.status.upper()} ({mp.feasibility_pct:.0f}% Wahrscheinlichkeit)"
            )
            block.append(f"    Benötigt: {u}{mp.daily_needed:,.0f}/Tag in {mp.days_remaining} Tagen")
        return block

    lines.extend(_metric_line(bundle.revenue, "Umsatz", "EUR"))
    lines.extend(_metric_line(bundle.traffic, "Traffic", ""))
    lines.extend(_metric_line(bundle.conversion_rate, "Conversion Rate", "%"))
    lines.extend(_metric_line(bundle.new_customers, "Neue Kunden", ""))

    return "\n".join(lines)
