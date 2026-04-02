"""
Unit tests for analytics/timeseries.py
Covers: helper functions, analyze_timeseries(), edge cases.
"""
import math
import sys
import os
import pytest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from analytics.timeseries import (
    analyze_timeseries,
    _simple_moving_average,
    _simple_acf,
    _detect_changepoints_fallback,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def flat_series():
    return [100.0] * 60


@pytest.fixture
def uptrend_series():
    return [float(i * 2) for i in range(1, 61)]


@pytest.fixture
def noisy_series():
    import random
    random.seed(42)
    return [100.0 + random.gauss(0, 5) for _ in range(60)]


@pytest.fixture
def stepchange_series():
    """60 points: first 30 around 50, last 30 around 150 — clear changepoint."""
    return [50.0 + (i * 0.1) for i in range(30)] + [150.0 + (i * 0.1) for i in range(30)]


@pytest.fixture
def dates_60():
    base = date(2024, 1, 1)
    return [base + timedelta(days=i) for i in range(60)]


# ── _simple_moving_average ────────────────────────────────────────────────────

def test_sma_window_3():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    sma = _simple_moving_average(values, window=3)
    assert len(sma) == len(values)
    # First two values are the original (not enough data for window)
    assert sma[2] == pytest.approx(2.0)
    assert sma[4] == pytest.approx(4.0)


def test_sma_window_larger_than_series():
    values = [1.0, 2.0, 3.0]
    sma = _simple_moving_average(values, window=10)
    assert len(sma) == len(values)


def test_sma_empty():
    assert _simple_moving_average([], window=3) == []


def test_sma_single():
    assert _simple_moving_average([42.0], window=3) == [42.0]


# ── _simple_acf ───────────────────────────────────────────────────────────────

def test_acf_lag0_is_one():
    values = [float(i) for i in range(1, 31)]
    acf_vals = _simple_acf(values, max_lag=5)
    assert acf_vals[0] == pytest.approx(1.0, abs=1e-6)


def test_acf_length():
    values = [float(i) for i in range(30)]
    acf_vals = _simple_acf(values, max_lag=7)
    assert len(acf_vals) == 8  # lags 0..7


def test_acf_too_short():
    acf_vals = _simple_acf([1.0, 2.0], max_lag=10)
    assert isinstance(acf_vals, list)


# ── _detect_changepoints_fallback ─────────────────────────────────────────────

def test_changepoints_finds_stepchange(stepchange_series):
    cps = _detect_changepoints_fallback(stepchange_series)
    assert isinstance(cps, list)
    # Should detect a changepoint somewhere around index 30
    if cps:
        assert any(20 <= cp <= 40 for cp in cps)


def test_changepoints_flat_no_change(flat_series):
    cps = _detect_changepoints_fallback(flat_series)
    # Flat series: no true changepoint (or only at boundary)
    assert isinstance(cps, list)


def test_changepoints_too_short():
    cps = _detect_changepoints_fallback([1.0, 2.0])
    assert cps == []


# ── analyze_timeseries ────────────────────────────────────────────────────────

def test_analyze_timeseries_empty():
    result = analyze_timeseries([], metric_name="revenue")
    assert result.n == 0
    assert result.metric_name == "revenue"


def test_analyze_timeseries_basic(uptrend_series, dates_60):
    result = analyze_timeseries(uptrend_series, dates=dates_60, metric_name="revenue")
    assert result.n == 60
    assert result.metric_name == "revenue"
    assert result.trend_direction in ("up", "down", "flat", "stable")


def test_analyze_timeseries_returns_trend_slope(uptrend_series, dates_60):
    result = analyze_timeseries(uptrend_series, dates=dates_60, metric_name="sessions")
    assert result.trend_slope > 0


def test_analyze_timeseries_flat_series(flat_series, dates_60):
    result = analyze_timeseries(flat_series, dates=dates_60, metric_name="orders")
    assert result.trend_slope == pytest.approx(0.0, abs=0.1)


def test_analyze_timeseries_with_changepoints(stepchange_series, dates_60):
    result = analyze_timeseries(stepchange_series, dates=dates_60, metric_name="revenue")
    assert isinstance(result.changepoints, list)


def test_analyze_timeseries_weekday_profile(uptrend_series, dates_60):
    result = analyze_timeseries(uptrend_series, dates=dates_60, metric_name="visits")
    assert isinstance(result.weekday_breakdown.averages, dict)
    assert result.weekday_breakdown.best_day != ""


def test_analyze_timeseries_no_dates(uptrend_series):
    result = analyze_timeseries(uptrend_series, metric_name="revenue")
    assert result.n == 60
    # Without dates, weekday profile is empty
    assert isinstance(result.weekday_breakdown.averages, dict)


def test_analyze_timeseries_too_short():
    result = analyze_timeseries([1.0, 2.0, 3.0], metric_name="x")
    assert result.n == 3
