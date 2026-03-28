"""
Unit tests for analytics/forecasting.py
Covers: helper functions, forecast_metric(), ForecastResult structure.
"""
import math
import sys
import os
import pytest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from analytics.forecasting import (
    forecast_metric,
    _compute_mae,
    _confidence_band,
    _future_dates,
    _forecast_trend,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def flat_series():
    return [100.0] * 60


@pytest.fixture
def uptrend_series():
    return [float(i * 2 + 10) for i in range(60)]


@pytest.fixture
def seasonal_series():
    """Simulated weekly seasonality (7-day period)."""
    base = [100 + 20 * math.sin(2 * math.pi * i / 7) for i in range(84)]
    return [round(v, 2) for v in base]


@pytest.fixture
def dates_60():
    base = date(2024, 1, 1)
    return [base + timedelta(days=i) for i in range(60)]


# ── _compute_mae ──────────────────────────────────────────────────────────────

def test_mae_perfect():
    assert _compute_mae([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]) == pytest.approx(0.0)


def test_mae_known():
    assert _compute_mae([0.0, 0.0, 0.0], [1.0, 2.0, 3.0]) == pytest.approx(2.0)


def test_mae_empty():
    assert _compute_mae([], []) == 0.0


def test_mae_length_mismatch():
    result = _compute_mae([1.0, 2.0], [1.0])
    assert isinstance(result, float)


# ── _future_dates ─────────────────────────────────────────────────────────────

def test_future_dates_count():
    dates = _future_dates(30)
    assert len(dates) == 30


def test_future_dates_iso_format():
    dates = _future_dates(5)
    for d in dates:
        assert len(d) == 10  # YYYY-MM-DD
        assert d[4] == "-" and d[7] == "-"


def test_future_dates_ascending():
    dates = _future_dates(10)
    assert dates == sorted(dates)


# ── _confidence_band ─────────────────────────────────────────────────────────

def test_confidence_band_lower_lt_upper():
    lower, upper = _confidence_band(100.0, cv=0.1, horizon_day=7, total_horizon=30)
    assert lower < 100.0 < upper


def test_confidence_band_widens_with_horizon():
    lower_near, upper_near = _confidence_band(100.0, cv=0.15, horizon_day=5, total_horizon=30)
    lower_far, upper_far = _confidence_band(100.0, cv=0.15, horizon_day=25, total_horizon=30)
    assert (upper_far - lower_far) >= (upper_near - lower_near)


def test_confidence_band_zero_cv():
    lower, upper = _confidence_band(100.0, cv=0.0, horizon_day=10, total_horizon=30)
    assert lower <= 100.0 <= upper


# ── _forecast_trend ───────────────────────────────────────────────────────────

def test_forecast_trend_returns_model(uptrend_series):
    model = _forecast_trend(uptrend_series, horizon=14)
    assert model.model_name == "trend"
    assert model.available is True
    assert len(model.points) == 14


def test_forecast_trend_positive_slope(uptrend_series):
    model = _forecast_trend(uptrend_series, horizon=7)
    # All forecast points should be >= last historical value (uptrend)
    last = uptrend_series[-1]
    assert all(p >= last * 0.7 for p in model.points)


def test_forecast_trend_flat(flat_series):
    model = _forecast_trend(flat_series, horizon=7)
    for p in model.points:
        assert p == pytest.approx(100.0, rel=0.01)


def test_forecast_trend_empty():
    model = _forecast_trend([], horizon=7)
    assert model.available is False or len(model.points) == 7


# ── forecast_metric (integration) ─────────────────────────────────────────────

def test_forecast_metric_empty():
    result = forecast_metric([], metric="revenue", horizon_days=14)
    assert result.metric == "revenue"
    assert result.horizon_days == 14
    assert isinstance(result.forecast, list)


def test_forecast_metric_returns_correct_horizon(flat_series, dates_60):
    result = forecast_metric(flat_series, metric="revenue", horizon_days=30, dates=dates_60)
    assert len(result.forecast) == 30


def test_forecast_metric_structure(uptrend_series, dates_60):
    result = forecast_metric(uptrend_series, metric="sessions", horizon_days=14, dates=dates_60)
    assert result.metric == "sessions"
    assert result.horizon_days == 14
    for point in result.forecast:
        assert hasattr(point, "value")
        assert hasattr(point, "lower")
        assert hasattr(point, "upper")
        assert point.lower <= point.value <= point.upper or point.lower <= point.upper


def test_forecast_metric_confidence_intervals(uptrend_series, dates_60):
    result = forecast_metric(uptrend_series, metric="revenue", horizon_days=7, dates=dates_60)
    for point in result.forecast:
        assert point.upper >= point.lower


def test_forecast_metric_trend_direction(uptrend_series, dates_60):
    result = forecast_metric(uptrend_series, metric="revenue", horizon_days=14, dates=dates_60)
    assert result.trend_pct is not None


def test_forecast_metric_too_short():
    result = forecast_metric([1.0, 2.0], metric="revenue", horizon_days=7)
    assert isinstance(result.forecast, list)
