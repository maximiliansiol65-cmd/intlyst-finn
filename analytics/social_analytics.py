"""
Schicht 8 — Social Media Analyse
analytics/social_analytics.py

Analysiert Instagram und TikTok Performance und verbindet Social Media
mit Business-Metriken (Revenue Attribution).

1. Instagram: Engagement Rate, Reach Rate, Save Rate, Profile Visit Rate
2. Content-Type Analyse: Reels vs Fotos vs Carousels vs Stories (Reels: 4.2× mehr Reach)
3. Posting-Zeit Optimierung: bester Wochentag + Stunden-Heatmap
4. Hashtag Analyse: Korrelation mit höherer Reichweite
5. TikTok: Completion Rate (<25/25-50/50-75/>75%), View Velocity
6. Social → Revenue Attribution: Granger-Test (Lag 1–3 Tage)
7. Social Health Score: Wachstum(30%) + Engagement(30%) + Konsistenz(20%) + Attribution(20%)

Installationsempfehlung:
    pip install numpy statsmodels (bereits in requirements.txt)
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Optional

# Optionale Abhängigkeiten
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from statsmodels.tsa.stattools import grangercausalitytests
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _f(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _mean(vals: list[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    return a / b if b else default


def _parse_ts(ts: str) -> Optional[datetime]:
    """Parst ISO-8601-Timestamp (Instagram/TikTok-Format)."""
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _engagement_rate(likes: float, comments: float, saves: float, reach: float) -> float:
    """(likes + comments + saves) / reach × 100"""
    return _safe_div(likes + comments + saves, reach) * 100


# Mapping Instagram API → lesbarer Label
_MEDIA_LABELS: dict[str, str] = {
    "VIDEO":           "Reels",
    "IMAGE":           "Fotos",
    "CAROUSEL_ALBUM":  "Carousels",
    "STORY":           "Stories",
}

_WEEKDAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]


# ---------------------------------------------------------------------------
# Datastrukturen
# ---------------------------------------------------------------------------

@dataclass
class ContentTypeStats:
    """Performance-Metriken für einen Content-Typ."""
    media_type: str             # Reels | Fotos | Carousels | Stories
    count: int
    avg_reach: float
    avg_impressions: float
    avg_engagement_rate: float  # (likes + comments + saves) / reach × 100
    avg_save_rate: float        # saves / reach × 100
    avg_like_rate: float        # likes / reach × 100
    reach_multiplier: float     # relativ zum Ø aller Posts


@dataclass
class PostingHeatmap:
    """7 × 24 Engagement-Rate-Matrix nach Wochentag und Stunde."""
    matrix: list[list[float]]   # [weekday_0_Mon][hour_0_23] → avg ER
    best_weekday: int           # 0 = Mo … 6 = So
    best_hour: int              # 0 – 23
    best_weekday_name: str
    best_slot_description: str  # z. B. "Dienstag 19:00–20:00"


@dataclass
class HashtagStat:
    """Reach-Lift eines einzelnen Hashtags."""
    hashtag: str
    post_count: int
    avg_reach: float
    avg_reach_lift: float       # 1.0 = kein Effekt; 1.5 = +50 % mehr Reach
    is_positive: bool           # lift > 1.05


@dataclass
class StoryMetrics:
    """Aggregierte Story-Performance."""
    count: int
    avg_reach: float
    avg_exit_rate: float        # exits / impressions × 100
    avg_view_through_rate: float
    avg_reply_rate: float       # replies / reach × 100


@dataclass
class InstagramMetricsAnalysis:
    """Vollständige Instagram-Analyse (Schicht 8)."""
    # Profil
    followers: int
    follows: int
    media_count: int

    # Globale Performance
    posts_analyzed: int
    avg_reach: float
    avg_impressions: float
    avg_engagement_rate: float   # %
    avg_reach_rate: float        # reach / followers × 100
    avg_save_rate: float         # saves / reach × 100

    # Content-Mix
    content_types: list[ContentTypeStats]
    best_content_type: str
    best_content_type_multiplier: float

    # Timing
    heatmap: PostingHeatmap

    # Hashtags (Top 10 nach Lift)
    top_hashtags: list[HashtagStat]

    # Stories (optional)
    stories: Optional[StoryMetrics]

    # Trends (erste vs. letzte Hälfte der Posts)
    engagement_trend: str       # "steigend" | "fallend" | "stabil"
    reach_trend: str
    trend_change_pct: float

    # Konsistenz
    posting_frequency_per_week: float
    consistency_score: float    # 0 – 100

    # Wachstum (benötigt historische Follower-Daten)
    follower_growth_rate_30d: Optional[float]  # % im Monat

    has_sufficient_data: bool   # mind. 10 Posts


@dataclass
class TikTokMetricsAnalysis:
    """TikTok-Performance-Analyse (Schicht 8)."""
    followers: int
    videos_analyzed: int
    avg_play_count: float
    avg_completion_rate: float  # 0 – 100 %
    avg_like_rate: float        # likes / plays × 100
    avg_share_rate: float       # shares / plays × 100
    avg_comment_rate: float

    # Completion-Segmente
    completion_segments: dict[str, int]   # {"<25%": N, "25-50%": N, …}
    dominant_segment: str

    # View-Velocity (Aufrufe / Tag)
    avg_view_velocity: float
    peak_view_velocity: float

    follower_growth_rate_30d: Optional[float]
    has_sufficient_data: bool


@dataclass
class SocialRevenueAttribution:
    """Granger-Kausalitätstest: Social Reach → Revenue."""
    tested: bool
    platform: str               # "instagram" | "tiktok"
    optimal_lag_days: int
    p_value: float
    f_statistic: float
    is_significant: bool        # p < 0.05
    strength: str               # "sehr stark" / "stark" / "moderat" / "kein Effekt"
    description: str
    revenue_lift_estimate: float  # Geschätzter €-Lift pro 1 000 Reach (0 wenn nicht signifikant)


@dataclass
class SocialHealthScore:
    """Composite Social Media Health Score 0 – 100."""
    total: float

    # Komponenten
    growth_score: float      # Gewichtung 30 %
    engagement_score: float  # 30 %
    consistency_score: float # 20 %
    attribution_score: float # 20 %

    rating: str              # "Sehr gut" | "Gut" | "Mittel" | "Schwach"
    primary_weakness: str
    primary_strength: str


@dataclass
class SocialAnalyticsBundle:
    """Vollständiges Social-Analyse-Paket (Schicht 8)."""
    instagram:    Optional[InstagramMetricsAnalysis]
    tiktok:       Optional[TikTokMetricsAnalysis]
    attribution:  Optional[SocialRevenueAttribution]
    health_score: Optional[SocialHealthScore]
    summary:      str


# ---------------------------------------------------------------------------
# Analyse: Instagram Posts
# ---------------------------------------------------------------------------

def _analyze_content_types(
    posts: list[dict],
    overall_avg_reach: float,
) -> list[ContentTypeStats]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for p in posts:
        label = _MEDIA_LABELS.get(p.get("media_type", "IMAGE"), "Fotos")
        groups[label].append(p)

    result: list[ContentTypeStats] = []
    for label, group in groups.items():
        n = len(group)
        reaches     = [_f(p.get("reach"))          for p in group]
        impressions = [_f(p.get("impressions"))     for p in group]
        saves       = [_f(p.get("saved"))           for p in group]
        likes       = [_f(p.get("like_count"))      for p in group]
        comments    = [_f(p.get("comments_count"))  for p in group]

        avg_r   = _mean(reaches)
        avg_imp = _mean(impressions)
        er_list = [_engagement_rate(likes[i], comments[i], saves[i], reaches[i]) for i in range(n)]
        sr_list = [_safe_div(saves[i], reaches[i]) * 100 for i in range(n)]
        lr_list = [_safe_div(likes[i], reaches[i]) * 100 for i in range(n)]

        result.append(ContentTypeStats(
            media_type=label,
            count=n,
            avg_reach=round(avg_r, 1),
            avg_impressions=round(avg_imp, 1),
            avg_engagement_rate=round(_mean(er_list), 2),
            avg_save_rate=round(_mean(sr_list), 3),
            avg_like_rate=round(_mean(lr_list), 3),
            reach_multiplier=round(_safe_div(avg_r, overall_avg_reach, 1.0), 2),
        ))

    return sorted(result, key=lambda x: x.avg_reach, reverse=True)


def _build_posting_heatmap(posts: list[dict]) -> PostingHeatmap:
    raw: list[list[list[float]]] = [[[] for _ in range(24)] for _ in range(7)]

    for post in posts:
        dt = _parse_ts(post.get("timestamp", ""))
        if dt is None:
            continue
        wd = dt.weekday()
        hr = dt.hour
        reach    = _f(post.get("reach"))
        likes    = _f(post.get("like_count"))
        comments = _f(post.get("comments_count"))
        saves    = _f(post.get("saved"))
        er = _engagement_rate(likes, comments, saves, reach)
        raw[wd][hr].append(er)

    matrix = [[_mean(raw[wd][hr]) for hr in range(24)] for wd in range(7)]

    best_wd, best_hr, best_val = 0, 12, -1.0
    for wd in range(7):
        for hr in range(24):
            if matrix[wd][hr] > best_val:
                best_val = matrix[wd][hr]
                best_wd  = wd
                best_hr  = hr

    slot = f"{_WEEKDAY_NAMES[best_wd]} {best_hr:02d}:00–{(best_hr + 1) % 24:02d}:00"
    return PostingHeatmap(
        matrix=matrix,
        best_weekday=best_wd,
        best_hour=best_hr,
        best_weekday_name=_WEEKDAY_NAMES[best_wd],
        best_slot_description=slot,
    )


def _analyze_hashtags(posts: list[dict]) -> list[HashtagStat]:
    global_avg = _mean([_f(p.get("reach")) for p in posts])
    if global_avg == 0:
        return []

    tag_reaches: dict[str, list[float]] = defaultdict(list)
    for post in posts:
        caption = str(post.get("caption") or "")
        tags = {w.strip("#.,!?").lower() for w in caption.split() if w.startswith("#")}
        reach = _f(post.get("reach"))
        for tag in tags:
            tag_reaches[tag].append(reach)

    stats: list[HashtagStat] = []
    for tag, reaches in tag_reaches.items():
        if len(reaches) < 2:
            continue
        avg_r = _mean(reaches)
        lift  = _safe_div(avg_r, global_avg, 1.0)
        stats.append(HashtagStat(
            hashtag=tag,
            post_count=len(reaches),
            avg_reach=round(avg_r, 1),
            avg_reach_lift=round(lift, 3),
            is_positive=lift > 1.05,
        ))

    return sorted(stats, key=lambda x: x.avg_reach_lift, reverse=True)[:10]


def analyze_instagram_posts(
    posts: list[dict],
    profile: dict,
    stories: Optional[list[dict]] = None,
) -> InstagramMetricsAnalysis:
    """
    Analysiert Instagram-Posts und berechnet alle Schicht-8-Metriken.

    Args:
        posts:   Liste von Post-Dicts aus Instagram Graph API (inkl. Insights-Felder)
        profile: Profil-Dict (followers_count, follows_count, media_count)
        stories: Optionale Liste von Story-Dicts
    """
    followers  = int(_f(profile.get("followers_count")))
    follows    = int(_f(profile.get("follows_count")))
    media_count = int(_f(profile.get("media_count")))

    _empty_heatmap = PostingHeatmap([[0.0] * 24 for _ in range(7)], 0, 12, "Montag", "N/A")

    if not posts:
        return InstagramMetricsAnalysis(
            followers=followers, follows=follows, media_count=media_count,
            posts_analyzed=0, avg_reach=0.0, avg_impressions=0.0,
            avg_engagement_rate=0.0, avg_reach_rate=0.0, avg_save_rate=0.0,
            content_types=[], best_content_type="N/A", best_content_type_multiplier=1.0,
            heatmap=_empty_heatmap, top_hashtags=[], stories=None,
            engagement_trend="stabil", reach_trend="stabil", trend_change_pct=0.0,
            posting_frequency_per_week=0.0, consistency_score=0.0,
            follower_growth_rate_30d=None, has_sufficient_data=False,
        )

    reaches     = [_f(p.get("reach"))          for p in posts]
    impressions = [_f(p.get("impressions"))     for p in posts]
    saves       = [_f(p.get("saved"))           for p in posts]
    likes       = [_f(p.get("like_count"))      for p in posts]
    comments    = [_f(p.get("comments_count"))  for p in posts]
    n           = len(posts)

    avg_r   = _mean(reaches)
    avg_imp = _mean(impressions)
    er_list = [_engagement_rate(likes[i], comments[i], saves[i], reaches[i]) for i in range(n)]
    sr_list = [_safe_div(saves[i], reaches[i]) * 100 for i in range(n)]

    avg_er = _mean(er_list)
    avg_sr = _mean(sr_list)
    avg_rr = _safe_div(avg_r, followers) * 100 if followers else 0.0

    content_types = _analyze_content_types(posts, avg_r)
    best_ct       = content_types[0] if content_types else None
    heatmap       = _build_posting_heatmap(posts)
    top_hashtags  = _analyze_hashtags(posts)

    # Stories
    story_metrics: Optional[StoryMetrics] = None
    if stories:
        s_reach = [_f(s.get("reach"))       for s in stories]
        s_imp   = [_f(s.get("impressions")) for s in stories]
        s_exits = [_f(s.get("exits"))       for s in stories]
        s_rep   = [_f(s.get("replies"))     for s in stories]
        s_fwd   = [_f(s.get("taps_forward")) for s in stories]
        ns = len(stories)
        story_metrics = StoryMetrics(
            count=ns,
            avg_reach=round(_mean(s_reach), 1),
            avg_exit_rate=round(_mean([_safe_div(s_exits[i], s_imp[i]) * 100 for i in range(ns)]), 2),
            avg_view_through_rate=round(_mean([
                max(0.0, 1.0 - _safe_div(s_fwd[i], s_imp[i])) * 100 for i in range(ns)
            ]), 2),
            avg_reply_rate=round(_mean([_safe_div(s_rep[i], s_reach[i]) * 100 for i in range(ns)]), 3),
        )

    # Trend: erste vs. letzte Hälfte
    mid = n // 2
    if mid > 0:
        er_change  = _safe_div(_mean(er_list[mid:]) - _mean(er_list[:mid]), _mean(er_list[:mid])) * 100
        r_change   = _safe_div(_mean(reaches[mid:]) - _mean(reaches[:mid]), _mean(reaches[:mid])) * 100
        eng_trend  = "steigend" if er_change > 5 else ("fallend" if er_change < -5 else "stabil")
        re_trend   = "steigend" if r_change  > 5 else ("fallend" if r_change  < -5 else "stabil")
        trend_pct  = round(er_change, 1)
    else:
        eng_trend = re_trend = "stabil"
        trend_pct = 0.0

    # Posting-Frequenz und Konsistenz
    post_dates = []
    for post in posts:
        dt = _parse_ts(post.get("timestamp", ""))
        if dt:
            post_dates.append(dt.date())

    if len(post_dates) >= 2:
        sorted_dates  = sorted(post_dates)
        span_days     = max(1, (sorted_dates[-1] - sorted_dates[0]).days + 1)
        post_freq     = n / span_days * 7
        unique_days   = len(set(post_dates))
        consistency   = min(100.0, _safe_div(unique_days, min(span_days, 30)) * 100)
    else:
        post_freq   = 0.0
        consistency = 0.0

    return InstagramMetricsAnalysis(
        followers=followers,
        follows=follows,
        media_count=media_count,
        posts_analyzed=n,
        avg_reach=round(avg_r, 1),
        avg_impressions=round(avg_imp, 1),
        avg_engagement_rate=round(avg_er, 2),
        avg_reach_rate=round(avg_rr, 3),
        avg_save_rate=round(avg_sr, 3),
        content_types=content_types,
        best_content_type=best_ct.media_type if best_ct else "N/A",
        best_content_type_multiplier=best_ct.reach_multiplier if best_ct else 1.0,
        heatmap=heatmap,
        top_hashtags=top_hashtags,
        stories=story_metrics,
        engagement_trend=eng_trend,
        reach_trend=re_trend,
        trend_change_pct=trend_pct,
        posting_frequency_per_week=round(post_freq, 2),
        consistency_score=round(consistency, 1),
        follower_growth_rate_30d=None,
        has_sufficient_data=n >= 10,
    )


# ---------------------------------------------------------------------------
# Analyse: TikTok Videos
# ---------------------------------------------------------------------------

def analyze_tiktok_videos(
    videos: list[dict],
    profile: dict,
) -> TikTokMetricsAnalysis:
    """
    Analysiert TikTok-Videos.

    Args:
        videos:  Liste von Video-Dicts (play_count, like_count, comment_count,
                 share_count, create_time, completion_rate/video_completion_count)
        profile: {'follower_count': int} oder {'followers_count': int}
    """
    followers = int(_f(profile.get("follower_count", profile.get("followers_count", 0))))

    _empty = TikTokMetricsAnalysis(
        followers=followers, videos_analyzed=0,
        avg_play_count=0.0, avg_completion_rate=0.0, avg_like_rate=0.0,
        avg_share_rate=0.0, avg_comment_rate=0.0,
        completion_segments={"<25%": 0, "25-50%": 0, "50-75%": 0, ">75%": 0},
        dominant_segment="N/A", avg_view_velocity=0.0, peak_view_velocity=0.0,
        follower_growth_rate_30d=None, has_sufficient_data=False,
    )

    if not videos:
        return _empty

    plays    = [_f(v.get("play_count",    v.get("view_count",   0))) for v in videos]
    likes    = [_f(v.get("like_count",    v.get("digg_count",   0))) for v in videos]
    comments = [_f(v.get("comment_count", 0))                        for v in videos]
    shares   = [_f(v.get("share_count",   0))                        for v in videos]

    # Completion Rate
    completion_rates: list[float] = []
    for i, v in enumerate(videos):
        if "completion_rate" in v:
            cr = _f(v["completion_rate"])
        elif "video_completion_count" in v and plays[i] > 0:
            cr = _safe_div(_f(v["video_completion_count"]), plays[i]) * 100
        else:
            # Heuristik: höhere Like-Rate → höhere Completion
            lr = _safe_div(likes[i], plays[i]) * 100 if plays[i] > 0 else 0.0
            cr = min(70.0, lr * 8)
        completion_rates.append(max(0.0, min(100.0, cr)))

    # Segmente
    segments: dict[str, int] = {"<25%": 0, "25-50%": 0, "50-75%": 0, ">75%": 0}
    for cr in completion_rates:
        if cr < 25:
            segments["<25%"] += 1
        elif cr < 50:
            segments["25-50%"] += 1
        elif cr < 75:
            segments["50-75%"] += 1
        else:
            segments[">75%"] += 1

    dominant = max(segments, key=lambda k: segments[k])

    # View Velocity
    today = date.today()
    velocities: list[float] = []
    for i, v in enumerate(videos):
        ct = v.get("create_time")
        if ct is None:
            continue
        try:
            if isinstance(ct, (int, float)):
                post_date = datetime.fromtimestamp(float(ct)).date()
            else:
                post_date = datetime.fromisoformat(str(ct).replace("Z", "+00:00")).date()
            days_old = max(1, (today - post_date).days)
            velocities.append(_safe_div(plays[i], days_old))
        except Exception:
            pass

    n = len(videos)
    avg_plays = _mean(plays)
    avg_cr    = _mean(completion_rates)
    avg_lr    = _mean([_safe_div(likes[i],    plays[i]) * 100 for i in range(n)])
    avg_sr    = _mean([_safe_div(shares[i],   plays[i]) * 100 for i in range(n)])
    avg_cmr   = _mean([_safe_div(comments[i], plays[i]) * 100 for i in range(n)])

    return TikTokMetricsAnalysis(
        followers=followers,
        videos_analyzed=n,
        avg_play_count=round(avg_plays, 1),
        avg_completion_rate=round(avg_cr, 1),
        avg_like_rate=round(avg_lr, 2),
        avg_share_rate=round(avg_sr, 3),
        avg_comment_rate=round(avg_cmr, 3),
        completion_segments=segments,
        dominant_segment=dominant,
        avg_view_velocity=round(_mean(velocities), 1),
        peak_view_velocity=round(max(velocities) if velocities else 0.0, 1),
        follower_growth_rate_30d=None,
        has_sufficient_data=n >= 5,
    )


# ---------------------------------------------------------------------------
# Social → Revenue Attribution (Granger)
# ---------------------------------------------------------------------------

def compute_social_revenue_attribution(
    reach_series: list[float],
    reach_dates:  list[date],
    revenue_series: list[float],
    revenue_dates:  list[date],
    platform: str = "instagram",
) -> SocialRevenueAttribution:
    """
    Granger-Kausalitätstest: Social Reach → Revenue (Lag 1–3 Tage).

    Benötigt numpy + statsmodels; gibt "nicht getestet"-Ergebnis zurück,
    wenn eine Abhängigkeit fehlt oder zu wenig Daten vorliegen.
    """
    _no_test = lambda reason: SocialRevenueAttribution(  # noqa: E731
        tested=False, platform=platform,
        optimal_lag_days=0, p_value=1.0, f_statistic=0.0,
        is_significant=False, strength="kein Effekt",
        description=reason, revenue_lift_estimate=0.0,
    )

    if not (HAS_NUMPY and HAS_STATSMODELS):
        return _no_test("Granger-Test erfordert numpy + statsmodels")

    reach_map = dict(zip(reach_dates, reach_series))
    rev_map   = dict(zip(revenue_dates, revenue_series))
    common    = sorted(set(reach_map) & set(rev_map))

    if len(common) < 20:
        return _no_test(
            f"Zu wenig gemeinsame Datenpunkte ({len(common)}) für Granger-Test (min. 20)"
        )

    x_orig = np.array([reach_map[d]  for d in common], dtype=float)
    y_orig = np.array([rev_map[d]    for d in common], dtype=float)

    # Normalisieren
    x = (x_orig - x_orig.mean()) / x_orig.std() if x_orig.std() > 0 else x_orig
    y = (y_orig - y_orig.mean()) / y_orig.std() if y_orig.std() > 0 else y_orig

    try:
        import warnings
        data = np.column_stack([y, x])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            results = grangercausalitytests(data, maxlag=3, verbose=False)

        best_lag, best_p, best_f = 1, 1.0, 0.0
        for lag in range(1, 4):
            res = results.get(lag)
            if res is None:
                continue
            ssr = res[0].get("ssr_ftest")
            if ssr and ssr[1] < best_p:
                best_p   = ssr[1]
                best_f   = ssr[0]
                best_lag = lag

        is_sig = best_p < 0.05

        if   best_p < 0.01: strength = "sehr stark"
        elif best_p < 0.05: strength = "stark"
        elif best_p < 0.10: strength = "moderat"
        else:               strength = "kein Effekt"

        # Revenue-Lift-Schätzung: €-Effekt pro 1 000 Reach bei Signifikanz
        lift = 0.0
        if is_sig and best_lag < len(x_orig):
            x_shifted = x_orig[:-best_lag]
            y_aligned = y_orig[best_lag:]
            if x_shifted.std() > 0 and len(x_shifted) > 2:
                corr = float(np.corrcoef(x_shifted, y_aligned)[0, 1])
                lift = max(0.0, round(corr * (y_aligned.std() / (x_shifted.std() / 1000)), 2))

        desc = (
            f"{platform.capitalize()} Reach → Revenue: "
            f"{'signifikant' if is_sig else 'nicht signifikant'} bei Lag {best_lag}d "
            f"(p={best_p:.3f}, F={best_f:.2f})"
        )

        return SocialRevenueAttribution(
            tested=True, platform=platform,
            optimal_lag_days=best_lag,
            p_value=round(best_p, 4),
            f_statistic=round(best_f, 3),
            is_significant=is_sig,
            strength=strength,
            description=desc,
            revenue_lift_estimate=lift,
        )

    except Exception as exc:
        return _no_test(f"Granger-Test fehlgeschlagen: {str(exc)[:100]}")


# ---------------------------------------------------------------------------
# Social Health Score
# ---------------------------------------------------------------------------

_IG_BENCHMARK_ER  = 3.5   # Branchen-Durchschnitt Engagement Rate %
_IG_GOOD_ER       = 6.0   # Gut
_IG_EXCELLENT_ER  = 10.0  # Exzellent
_REELS_MULTIPLIER = 4.2   # Reels: 4.2× mehr Reach (Branchenreferenz)


def compute_social_health_score(
    ig:          Optional[InstagramMetricsAnalysis],
    tt:          Optional[TikTokMetricsAnalysis],
    attribution: Optional[SocialRevenueAttribution],
) -> Optional[SocialHealthScore]:
    """Berechnet Social Media Health Score 0–100."""
    if ig is None and tt is None:
        return None

    # 1. Wachstum 30 %
    growth_score = 50.0   # Neutral-Fallback wenn keine Daten
    for src in (ig, tt):
        if src and getattr(src, "follower_growth_rate_30d", None) is not None:
            gr = src.follower_growth_rate_30d  # type: ignore[union-attr]
            growth_score = min(100.0, max(0.0, gr / 5.0 * 100))
            break

    # 2. Engagement 30 %
    engagement_score = 0.0
    if ig and ig.avg_engagement_rate > 0:
        er = ig.avg_engagement_rate
        if   er >= _IG_EXCELLENT_ER: engagement_score = 100.0
        elif er >= _IG_GOOD_ER:      engagement_score = 50 + (er - _IG_GOOD_ER)      / (_IG_EXCELLENT_ER - _IG_GOOD_ER) * 50
        elif er >= _IG_BENCHMARK_ER: engagement_score = 30 + (er - _IG_BENCHMARK_ER) / (_IG_GOOD_ER - _IG_BENCHMARK_ER) * 20
        else:                        engagement_score = max(0.0, er / _IG_BENCHMARK_ER * 30)
    elif tt and tt.avg_completion_rate > 0:
        engagement_score = min(100.0, tt.avg_completion_rate / 75.0 * 100)

    # 3. Konsistenz 20 %
    consistency_score = 0.0
    if ig and ig.has_sufficient_data:
        consistency_score = ig.consistency_score
    elif tt and tt.has_sufficient_data:
        consistency_score = min(100.0, tt.videos_analyzed / 20.0 * 100)

    # 4. Attribution 20 %
    attribution_score = 0.0
    if attribution and attribution.tested:
        if   attribution.is_significant and attribution.p_value < 0.01: attribution_score = 100.0
        elif attribution.is_significant:                                  attribution_score = 75.0
        elif attribution.p_value < 0.10:                                  attribution_score = 40.0
        else:                                                             attribution_score = 10.0

    total = (
        growth_score      * 0.30 +
        engagement_score  * 0.30 +
        consistency_score * 0.20 +
        attribution_score * 0.20
    )

    if   total >= 80: rating = "Sehr gut"
    elif total >= 60: rating = "Gut"
    elif total >= 40: rating = "Mittel"
    else:             rating = "Schwach"

    scores = {
        "Wachstum":    growth_score,
        "Engagement":  engagement_score,
        "Konsistenz":  consistency_score,
        "Attribution": attribution_score,
    }

    return SocialHealthScore(
        total=round(total, 1),
        growth_score=round(growth_score, 1),
        engagement_score=round(engagement_score, 1),
        consistency_score=round(consistency_score, 1),
        attribution_score=round(attribution_score, 1),
        rating=rating,
        primary_weakness=min(scores, key=lambda k: scores[k]),
        primary_strength=max(scores, key=lambda k: scores[k]),
    )


# ---------------------------------------------------------------------------
# Bundle + Context
# ---------------------------------------------------------------------------

def build_social_analytics_bundle(
    ig:          Optional[InstagramMetricsAnalysis],
    tt:          Optional[TikTokMetricsAnalysis],
    attribution: Optional[SocialRevenueAttribution],
) -> SocialAnalyticsBundle:
    health = compute_social_health_score(ig, tt, attribution)

    parts: list[str] = []
    if ig and ig.has_sufficient_data:
        parts.append(
            f"Instagram: {ig.followers:,} Follower, {ig.avg_engagement_rate:.1f}% ER, "
            f"bester Content-Typ: {ig.best_content_type} ({ig.best_content_type_multiplier:.1f}×)"
        )
    if tt and tt.has_sufficient_data:
        parts.append(
            f"TikTok: {tt.followers:,} Follower, {tt.avg_completion_rate:.0f}% Completion Rate"
        )
    if attribution and attribution.is_significant:
        parts.append(
            f"Social→Revenue signifikant (p={attribution.p_value:.3f}, Lag {attribution.optimal_lag_days}d)"
        )

    summary = " | ".join(parts) if parts else "Keine ausreichenden Social-Media-Daten"

    return SocialAnalyticsBundle(
        instagram=ig, tiktok=tt,
        attribution=attribution, health_score=health,
        summary=summary,
    )


def build_social_context(bundle: SocialAnalyticsBundle) -> str:
    """Formatiert Social-Analytics als KI-lesbaren Kontext-Block."""
    lines = ["=== SCHICHT 8: SOCIAL MEDIA ANALYSE ==="]

    ig = bundle.instagram
    if ig and ig.posts_analyzed > 0:
        lines.append("\n--- INSTAGRAM ---")
        lines.append(
            f"Follower: {ig.followers:,} | ER: {ig.avg_engagement_rate:.2f}% | "
            f"Reach Rate: {ig.avg_reach_rate:.2f}% | Save Rate: {ig.avg_save_rate:.2f}%"
        )
        lines.append(
            f"Ø Reach: {ig.avg_reach:,.0f} | Ø Impressions: {ig.avg_impressions:,.0f} | "
            f"Posts analysiert: {ig.posts_analyzed}"
        )

        if ig.content_types:
            lines.append("\nContent-Mix:")
            for ct in ig.content_types:
                lines.append(
                    f"  {ct.media_type}: {ct.count} Posts | Ø Reach: {ct.avg_reach:,.0f} "
                    f"({ct.reach_multiplier:.2f}×) | ER: {ct.avg_engagement_rate:.2f}%"
                )

        lines.append(f"\nBester Posting-Zeitpunkt: {ig.heatmap.best_slot_description}")
        lines.append(
            f"Posting-Frequenz: {ig.posting_frequency_per_week:.1f}×/Woche | "
            f"Konsistenz: {ig.consistency_score:.0f}/100"
        )
        lines.append(
            f"Engagement-Trend: {ig.engagement_trend} | "
            f"Reach-Trend: {ig.reach_trend} ({ig.trend_change_pct:+.1f}%)"
        )

        positive_tags = [h for h in ig.top_hashtags if h.is_positive][:5]
        if positive_tags:
            tag_str = "  ".join(
                f"#{h.hashtag}(+{(h.avg_reach_lift - 1) * 100:.0f}%)" for h in positive_tags
            )
            lines.append(f"Top-Hashtags (Reach-Lift): {tag_str}")

        if ig.stories:
            s = ig.stories
            lines.append(
                f"\nStories: {s.count} | Ø Reach: {s.avg_reach:,.0f} | "
                f"Exit Rate: {s.avg_exit_rate:.1f}% | Reply Rate: {s.avg_reply_rate:.2f}%"
            )

    tt = bundle.tiktok
    if tt and tt.videos_analyzed > 0:
        lines.append("\n--- TIKTOK ---")
        lines.append(
            f"Follower: {tt.followers:,} | Completion Rate: {tt.avg_completion_rate:.1f}% | "
            f"Like Rate: {tt.avg_like_rate:.2f}% | Share Rate: {tt.avg_share_rate:.3f}%"
        )
        lines.append(
            f"Ø Aufrufe: {tt.avg_play_count:,.0f} | Videos analysiert: {tt.videos_analyzed}"
        )
        seg_str = "  ".join(f"{k}: {v}" for k, v in tt.completion_segments.items())
        lines.append(f"Completion-Segmente: {seg_str} | Dominant: {tt.dominant_segment}")
        lines.append(
            f"View-Velocity: Ø {tt.avg_view_velocity:.0f}/Tag | Peak: {tt.peak_view_velocity:.0f}/Tag"
        )

    att = bundle.attribution
    if att and att.tested:
        lines.append("\n--- SOCIAL → REVENUE ATTRIBUTION ---")
        lines.append(att.description)
        if att.is_significant and att.revenue_lift_estimate > 0:
            lines.append(f"Geschätzter Umsatz-Lift: +{att.revenue_lift_estimate:.2f} € pro 1 000 Reach")

    hs = bundle.health_score
    if hs:
        lines.append(f"\n--- SOCIAL HEALTH SCORE: {hs.total:.0f}/100 ({hs.rating}) ---")
        lines.append(
            f"Wachstum: {hs.growth_score:.0f} | Engagement: {hs.engagement_score:.0f} | "
            f"Konsistenz: {hs.consistency_score:.0f} | Attribution: {hs.attribution_score:.0f}"
        )
        lines.append(f"Stärke: {hs.primary_strength} | Schwäche: {hs.primary_weakness}")
        lines.append(f"Referenzwert: Reels liefern im Schnitt {_REELS_MULTIPLIER}× mehr Reach")

    lines.append(f"\nZusammenfassung: {bundle.summary}")
    return "\n".join(lines)
