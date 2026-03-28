"""
Intlyst Analyse-Engine — 12-Schichten-Architektur

Schicht 1:  data_aggregator   — Rohdaten aus allen Quellen
Schicht 2:  statistics        — Statistische Grundanalyse
Schicht 3:  timeseries        — Zeitreihenanalyse
Schicht 4:  causality         — Kausalitätsanalyse
Schicht 5:  segmentation      — Segmentierungsanalyse
Schicht 6:  forecasting       — Prognosemodelle
Schicht 7:  benchmarking      — Benchmarking
Schicht 8:  social_analytics  — Social Media Analyse
Schicht 9:  competitor_intel  — Wettbewerber-Intelligenz
Schicht 10: proactive_engine  — Proaktive Erkennung
Schicht 11: ai_synthesis      — KI-Synthese
Schicht 12: action_engine     — Aktions-Generierung
"""

from analytics.data_aggregator import AggregatedData, aggregate_all_data
from analytics.statistics import MetricStats, compute_stats
from analytics.timeseries import TimeSeriesAnalysis, analyze_timeseries
from analytics.causality import CausalityBundle, analyze_all_causality
from analytics.forecasting import ForecastResult, forecast_metric, ForecastBundle, forecast_all_metrics
from analytics.social_analytics import (
    InstagramMetricsAnalysis,
    TikTokMetricsAnalysis,
    SocialRevenueAttribution,
    SocialHealthScore,
    SocialAnalyticsBundle,
    analyze_instagram_posts,
    analyze_tiktok_videos,
    compute_social_revenue_attribution,
    compute_social_health_score,
    build_social_analytics_bundle,
    build_social_context,
)

__all__ = [
    "AggregatedData",
    "aggregate_all_data",
    "MetricStats",
    "compute_stats",
    "TimeSeriesAnalysis",
    "analyze_timeseries",
    "CausalityBundle",
    "analyze_all_causality",
    "ForecastResult",
    "forecast_metric",
    "ForecastBundle",
    "forecast_all_metrics",
    # Schicht 8
    "InstagramMetricsAnalysis",
    "TikTokMetricsAnalysis",
    "SocialRevenueAttribution",
    "SocialHealthScore",
    "SocialAnalyticsBundle",
    "analyze_instagram_posts",
    "analyze_tiktok_videos",
    "compute_social_revenue_attribution",
    "compute_social_health_score",
    "build_social_analytics_bundle",
    "build_social_context",
]
