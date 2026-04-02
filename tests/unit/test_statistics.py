"""
Unit tests for analytics/statistics.py
Covers: compute_stats(), helper functions, edge cases.
"""
import math
import sys
import os
import pytest
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from analytics.statistics import (
    compute_stats,
    _mean,
    _median,
    _variance,
    _percentile,
    _trimmed_mean,
    _skewness,
    _linear_regression,
    _momentum,
    _z_scores,
    _pct_change,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def flat_series():
    """Constant series: all analytics should reflect zero variance."""
    return [100.0] * 30


@pytest.fixture
def uptrend_series():
    """Strictly increasing series."""
    return [float(i) for i in range(1, 31)]


@pytest.fixture
def dates_30():
    """30 consecutive dates."""
    base = date(2024, 1, 1)
    return [base + timedelta(days=i) for i in range(30)]


# ── _mean ─────────────────────────────────────────────────────────────────────

def test_mean_basic():
    assert _mean([1.0, 2.0, 3.0]) == pytest.approx(2.0)


def test_mean_single():
    assert _mean([42.0]) == 42.0


def test_mean_empty():
    assert _mean([]) == 0.0


# ── _median ───────────────────────────────────────────────────────────────────

def test_median_odd():
    assert _median([3.0, 1.0, 2.0]) == 2.0


def test_median_even():
    assert _median([1.0, 2.0, 3.0, 4.0]) == pytest.approx(2.5)


def test_median_empty():
    assert _median([]) == 0.0


# ── _variance ─────────────────────────────────────────────────────────────────

def test_variance_known():
    values = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
    mean = _mean(values)
    var = _variance(values, mean)
    assert var == pytest.approx(4.571, rel=1e-2)


def test_variance_single():
    assert _variance([5.0], 5.0) == 0.0


def test_variance_constant(flat_series):
    mean = _mean(flat_series)
    assert _variance(flat_series, mean) == 0.0


# ── _percentile ───────────────────────────────────────────────────────────────

def test_percentile_p50():
    vals = list(range(1, 101))
    assert _percentile(vals, 50) == pytest.approx(50.5, abs=0.5)


def test_percentile_p0():
    assert _percentile([1.0, 5.0, 10.0], 0) == pytest.approx(1.0)


def test_percentile_p100():
    assert _percentile([1.0, 5.0, 10.0], 100) == pytest.approx(10.0)


def test_percentile_empty():
    assert _percentile([], 50) == 0.0


# ── _trimmed_mean ─────────────────────────────────────────────────────────────

def test_trimmed_mean_removes_extremes():
    values = [0.0] + list(range(1, 10)) + [1000.0]
    full_mean = _mean(values)
    trimmed = _trimmed_mean(values, trim=0.1)
    assert trimmed < full_mean


def test_trimmed_mean_empty():
    assert _trimmed_mean([]) == 0.0


# ── _skewness ─────────────────────────────────────────────────────────────────

def test_skewness_symmetric():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    mean = _mean(values)
    std = math.sqrt(_variance(values, mean))
    skew = _skewness(values, mean, std)
    assert abs(skew) < 0.1  # near-zero for symmetric data


def test_skewness_zero_std():
    values = [5.0, 5.0, 5.0]
    assert _skewness(values, 5.0, 0.0) == 0.0


# ── _linear_regression ────────────────────────────────────────────────────────

def test_linear_regression_perfect_fit():
    x = [0.0, 1.0, 2.0, 3.0, 4.0]
    y = [1.0, 3.0, 5.0, 7.0, 9.0]  # y = 2x + 1
    slope, intercept, r2 = _linear_regression(x, y)
    assert slope == pytest.approx(2.0, rel=1e-4)
    assert intercept == pytest.approx(1.0, rel=1e-4)
    assert r2 == pytest.approx(1.0, rel=1e-4)


def test_linear_regression_flat():
    x = [0.0, 1.0, 2.0]
    y = [5.0, 5.0, 5.0]
    slope, intercept, r2 = _linear_regression(x, y)
    assert slope == pytest.approx(0.0, abs=1e-9)
    assert r2 == 0.0


def test_linear_regression_insufficient_data():
    slope, intercept, r2 = _linear_regression([1.0], [1.0])
    assert slope == 0.0
    assert r2 == 0.0


# ── _momentum ─────────────────────────────────────────────────────────────────

def test_momentum_positive(uptrend_series):
    m = _momentum(uptrend_series, window=7)
    assert m > 0


def test_momentum_insufficient_data():
    assert _momentum([1.0, 2.0], window=7) == 0.0


def test_momentum_flat(flat_series):
    assert _momentum(flat_series, window=7) == 0.0


# ── _z_scores ─────────────────────────────────────────────────────────────────

def test_z_scores_known():
    values = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
    mean = _mean(values)
    std = math.sqrt(_variance(values, mean))
    zs = _z_scores(values, mean, std)
    assert len(zs) == len(values)
    assert abs(_mean(zs)) < 1e-6  # mean of z-scores ≈ 0


def test_z_scores_zero_std():
    values = [5.0, 5.0, 5.0]
    zs = _z_scores(values, 5.0, 0.0)
    assert all(z == 0.0 for z in zs)


# ── _pct_change ───────────────────────────────────────────────────────────────

def test_pct_change_increase():
    assert _pct_change(110.0, 100.0) == pytest.approx(10.0)


def test_pct_change_decrease():
    assert _pct_change(90.0, 100.0) == pytest.approx(-10.0)


def test_pct_change_zero_previous():
    assert _pct_change(50.0, 0.0) == 0.0


# ── compute_stats integration ─────────────────────────────────────────────────

def test_compute_stats_empty():
    stats = compute_stats([])
    assert stats.n == 0
    assert stats.mean == 0.0


def test_compute_stats_basic(uptrend_series, dates_30):
    stats = compute_stats(uptrend_series, dates=dates_30, metric_name="revenue")
    assert stats.n == 30
    assert stats.mean == pytest.approx(15.5, rel=1e-3)
    assert stats.minimum == 1.0
    assert stats.maximum == 30.0
    assert stats.linear_slope > 0
    assert stats.linear_r2 == pytest.approx(1.0, rel=1e-3)


def test_compute_stats_outlier_detection():
    values = [10.0] * 28 + [10.0, 100.0]  # last value is outlier
    stats = compute_stats(values)
    assert len(stats.outlier_indices) >= 1
    assert stats.latest_z_score > 2.0


def test_compute_stats_momentum_positive(uptrend_series):
    stats = compute_stats(uptrend_series)
    assert stats.momentum_7d > 0
    assert stats.momentum_30d > 0


def test_compute_stats_constant_series(flat_series):
    stats = compute_stats(flat_series)
    assert stats.std_dev == 0.0
    assert stats.cv == 0.0
    assert stats.skewness == 0.0
    assert stats.linear_slope == pytest.approx(0.0, abs=1e-6)


def test_compute_stats_weekday_profile(uptrend_series, dates_30):
    stats = compute_stats(uptrend_series, dates=dates_30)
    assert isinstance(stats.weekday_profile, dict)
    assert stats.best_weekday != ""
    assert stats.worst_weekday != ""


def test_compute_stats_percentiles(uptrend_series):
    stats = compute_stats(uptrend_series)
    assert stats.p10 < stats.p25 < stats.p50 < stats.p75 < stats.p90


def test_compute_stats_wow_change():
    # First 7 days = 100, last 7 days = 200 → WoW ≈ +100%
    values = [100.0] * 23 + [200.0] * 7
    stats = compute_stats(values)
    assert stats.wow_change > 0
