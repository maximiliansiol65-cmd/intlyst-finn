"""
Instagram + TikTok Social Media Routen
api/instagram_routes.py

Instagram Graph API:
  GET  /api/instagram/status          — Verbindungsstatus
  POST /api/instagram/connect         — Access-Token speichern
  DELETE /api/instagram/disconnect    — Verbindung trennen
  GET  /api/instagram/insights        — Profil-Insights (28 Tage)
  GET  /api/instagram/analyze         — Vollanalyse (Schicht 8)

TikTok Display API:
  GET  /api/tiktok/status
  POST /api/tiktok/connect
  DELETE /api/tiktok/disconnect
  GET  /api/tiktok/analyze

Graceful Degradation: Fehlende Tokens → leere Antwort, kein 500.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.auth_routes import User, get_current_user, get_current_workspace_id
from database import get_db
from models.social_account import SocialAccount

logger = logging.getLogger("intlyst.social")

router = APIRouter(tags=["social"])

_IG_BASE   = "https://graph.instagram.com/v17.0"
_TT_BASE   = "https://open.tiktokapis.com/v2"
_TIMEOUT   = 15.0   # Sekunden

# Maximale Anzahl Posts für Analyse
_MAX_IG_POSTS   = 50
_MAX_TT_VIDEOS  = 30


# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def _env(key: str) -> str:
    return os.getenv(key, "").strip()


def _get_social_account(
    db: Session,
    workspace_id: int,
    platform: str,
) -> Optional[SocialAccount]:
    return (
        db.query(SocialAccount)
        .filter(
            SocialAccount.workspace_id == workspace_id,
            SocialAccount.platform     == platform,
            SocialAccount.is_active    == True,
        )
        .first()
    )


def _ig_token(db: Session, workspace_id: int) -> Optional[str]:
    """Gibt Instagram-Token zurück: zuerst DB, dann Env-Var."""
    account = _get_social_account(db, workspace_id, "instagram")
    if account and account.access_token:
        return account.access_token
    return _env("INSTAGRAM_ACCESS_TOKEN") or None


def _tt_token(db: Session, workspace_id: int) -> Optional[str]:
    account = _get_social_account(db, workspace_id, "tiktok")
    if account and account.access_token:
        return account.access_token
    return _env("TIKTOK_ACCESS_TOKEN") or None


async def _ig_get(path: str, token: str, params: Optional[dict] = None) -> dict:
    """GET-Request an Instagram Graph API."""
    url = f"{_IG_BASE}/{path.lstrip('/')}"
    p = {"access_token": token, **(params or {})}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(url, params=p)
    resp.raise_for_status()
    return resp.json()


async def _ig_get_insights(media_id: str, token: str, metric: str) -> dict:
    return await _ig_get(
        f"{media_id}/insights",
        token,
        {"metric": metric, "period": "lifetime"},
    )


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class ConnectRequest(BaseModel):
    access_token: str = Field(..., min_length=10, max_length=512)
    account_id:   Optional[str] = None
    username:     Optional[str] = None


class ConnectResponse(BaseModel):
    platform:    str
    connected:   bool
    username:    Optional[str]
    account_id:  Optional[str]
    message:     str


class SocialStatusResponse(BaseModel):
    platform:      str
    connected:     bool
    source:        str              # "database" | "env" | "none"
    username:      Optional[str]
    account_id:    Optional[str]
    last_sync_at:  Optional[str]


class InstagramInsightsResponse(BaseModel):
    followers:       int
    follows:         int
    media_count:     int
    reach_28d:       int
    impressions_28d: int
    profile_visits:  int


class SocialAnalyzeResponse(BaseModel):
    platform:              str
    posts_analyzed:        int
    avg_engagement_rate:   float
    avg_reach:             float
    best_content_type:     str
    best_posting_slot:     str
    health_score:          Optional[float]
    health_rating:         Optional[str]
    social_revenue_sig:    bool
    social_revenue_lag:    Optional[int]
    top_hashtags:          list[dict]
    content_types:         list[dict]
    summary:               str
    full_analysis:         dict


# ---------------------------------------------------------------------------
# Instagram Endpoints
# ---------------------------------------------------------------------------

@router.get("/api/instagram/status", response_model=SocialStatusResponse, tags=["instagram"])
async def instagram_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace_id: int  = Depends(get_current_workspace_id),
):
    """Verbindungsstatus: Ist ein Instagram-Konto verknüpft?"""
    account = _get_social_account(db, workspace_id, "instagram")
    if account:
        return SocialStatusResponse(
            platform="instagram", connected=True, source="database",
            username=account.username, account_id=account.account_id,
            last_sync_at=account.last_sync_at.isoformat() if account.last_sync_at else None,
        )
    env_token = _env("INSTAGRAM_ACCESS_TOKEN")
    if env_token:
        return SocialStatusResponse(
            platform="instagram", connected=True, source="env",
            username=None, account_id=_env("INSTAGRAM_ACCOUNT_ID") or None,
            last_sync_at=None,
        )
    return SocialStatusResponse(
        platform="instagram", connected=False, source="none",
        username=None, account_id=None, last_sync_at=None,
    )


@router.post("/api/instagram/connect", response_model=ConnectResponse, tags=["instagram"])
async def instagram_connect(
    body: ConnectRequest,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    """Speichert Instagram-Access-Token in der DB."""
    existing = _get_social_account(db, workspace_id, "instagram")

    # Profil verifizieren und Username holen
    username   = body.username
    account_id = body.account_id
    try:
        data = await _ig_get("me", body.access_token, {"fields": "id,username"})
        username   = data.get("username", username)
        account_id = data.get("id", account_id)
    except Exception as exc:
        logger.warning("Instagram-Verbindungstest fehlgeschlagen: %s", exc)
        # Token könnte dennoch gültig sein — speichern und warnen

    if existing:
        existing.access_token = body.access_token
        existing.account_id   = account_id
        existing.username     = username
        existing.is_active    = True
        existing.updated_at   = datetime.utcnow()
    else:
        account = SocialAccount(
            workspace_id  = workspace_id,
            platform      = "instagram",
            account_id    = account_id,
            username      = username,
            access_token  = body.access_token,
            is_active     = True,
        )
        db.add(account)

    db.commit()
    logger.info("Instagram verbunden: workspace=%s user=%s", workspace_id, username)
    return ConnectResponse(
        platform="instagram", connected=True,
        username=username, account_id=account_id,
        message="Instagram erfolgreich verbunden",
    )


@router.delete("/api/instagram/disconnect", status_code=204, tags=["instagram"])
async def instagram_disconnect(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    """Trennt Instagram-Verbindung (deaktiviert Token in DB)."""
    account = _get_social_account(db, workspace_id, "instagram")
    if account:
        account.is_active    = False
        account.access_token = None
        account.updated_at   = datetime.utcnow()
        db.commit()


@router.get("/api/instagram/insights", response_model=InstagramInsightsResponse, tags=["instagram"])
async def instagram_insights(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    """Holt Instagram-Profil-Insights (28 Tage)."""
    token = _ig_token(db, workspace_id)
    if not token:
        raise HTTPException(status_code=404, detail="Kein Instagram-Token konfiguriert")

    try:
        profile = await _ig_get(
            "me", token,
            {"fields": "id,username,followers_count,follows_count,media_count"},
        )
        insights = await _ig_get(
            "me/insights", token,
            {
                "metric": "reach,impressions,profile_visits",
                "period": "days_28",
            },
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Instagram API Fehler: {exc.response.text[:200]}")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Instagram-Verbindung fehlgeschlagen: {str(exc)[:200]}")

    # Insights-Werte extrahieren
    metric_map: dict[str, int] = {}
    for item in insights.get("data", []):
        name = item.get("name", "")
        vals = item.get("values", [])
        if vals:
            metric_map[name] = int(vals[-1].get("value", 0) if isinstance(vals[-1], dict) else vals[-1])

    return InstagramInsightsResponse(
        followers=int(profile.get("followers_count", 0)),
        follows=int(profile.get("follows_count", 0)),
        media_count=int(profile.get("media_count", 0)),
        reach_28d=metric_map.get("reach", 0),
        impressions_28d=metric_map.get("impressions", 0),
        profile_visits=metric_map.get("profile_visits", 0),
    )


@router.get("/api/instagram/analyze", response_model=SocialAnalyzeResponse, tags=["instagram"])
async def instagram_analyze(
    limit: int     = Query(default=_MAX_IG_POSTS, ge=5, le=100),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    """
    Vollständige Instagram-Analyse (Schicht 8):
    Holt Posts + Insights von der API und führt analytics/social_analytics.py aus.
    """
    token = _ig_token(db, workspace_id)
    if not token:
        raise HTTPException(status_code=404, detail="Kein Instagram-Token konfiguriert")

    try:
        from analytics.social_analytics import (
            analyze_instagram_posts,
            build_social_analytics_bundle,
            build_social_context,
        )
    except ImportError:
        raise HTTPException(status_code=503, detail="analytics.social_analytics nicht verfügbar")

    # 1. Profil
    try:
        profile = await _ig_get(
            "me", token,
            {"fields": "id,username,followers_count,follows_count,media_count"},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Profil-Fetch fehlgeschlagen: {str(exc)[:200]}")

    # 2. Media-Liste
    media_fields = "id,timestamp,media_type,like_count,comments_count,caption"
    try:
        media_resp = await _ig_get("me/media", token, {"fields": media_fields, "limit": limit})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Media-Fetch fehlgeschlagen: {str(exc)[:200]}")

    raw_posts: list[dict] = media_resp.get("data", [])

    # 3. Insights pro Post (parallel via asyncio.gather)
    import asyncio

    async def _enrich_post(post: dict) -> dict:
        mid = post.get("id", "")
        if not mid:
            return post
        try:
            ig_metric = "reach,impressions,saved"
            if post.get("media_type") == "VIDEO":
                ig_metric += ",video_views"
            ins = await _ig_get_insights(mid, token, ig_metric)
            for item in ins.get("data", []):
                name = item.get("name", "")
                vals = item.get("values", [])
                if vals:
                    v = vals[-1]
                    post[name] = v.get("value", 0) if isinstance(v, dict) else v
        except Exception:
            pass  # Post ohne Insights → trotzdem verarbeiten
        return post

    enriched: list[dict] = await asyncio.gather(*[_enrich_post(p) for p in raw_posts])

    # 4. Stories (Best-effort)
    stories: list[dict] = []
    try:
        story_resp = await _ig_get("me/stories", token, {"fields": "id,timestamp,media_type"})
        raw_stories = story_resp.get("data", [])

        async def _enrich_story(s: dict) -> dict:
            sid = s.get("id", "")
            if not sid:
                return s
            try:
                ins = await _ig_get_insights(sid, token, "reach,impressions,exits,replies,taps_forward,taps_back")
                for item in ins.get("data", []):
                    name = item.get("name", "")
                    vals = item.get("values", [])
                    if vals:
                        v = vals[-1]
                        s[name] = v.get("value", 0) if isinstance(v, dict) else v
            except Exception:
                pass
            return s

        stories = list(await asyncio.gather(*[_enrich_story(s) for s in raw_stories]))
    except Exception:
        pass

    # 5. Analytics
    ig_analysis = analyze_instagram_posts(enriched, profile, stories if stories else None)

    # 6. Social → Revenue Attribution (Best-effort)
    from analytics.social_analytics import (
        compute_social_revenue_attribution,
        SocialRevenueAttribution,
    )
    attribution: Optional[SocialRevenueAttribution] = None
    try:
        from models.daily_metrics import DailyMetrics
        from datetime import date as _date
        rows = (
            db.query(DailyMetrics)
            .order_by(DailyMetrics.date.asc())
            .limit(90)
            .all()
        )
        if rows and len(rows) >= 20:
            def _to_float(v: Any) -> float:
                try: return float(v or 0)
                except: return 0.0

            rev_dates  = [r.date if isinstance(r.date, _date) else _date.fromisoformat(str(r.date)) for r in rows]
            rev_vals   = [_to_float(r.revenue) for r in rows]

            # Reach-Proxy: Ø Reach pro Tag aus analysierten Posts
            reach_by_date: dict[_date, list[float]] = {}
            for p in enriched:
                from analytics.social_analytics import _parse_ts
                dt = _parse_ts(p.get("timestamp", ""))
                if dt:
                    d = dt.date()
                    reach_by_date.setdefault(d, []).append(float(p.get("reach", 0) or 0))

            if reach_by_date:
                reach_dates = sorted(reach_by_date)
                reach_vals  = [sum(reach_by_date[d]) for d in reach_dates]
                attribution = compute_social_revenue_attribution(
                    reach_vals, reach_dates, rev_vals, rev_dates, platform="instagram"
                )
    except Exception:
        pass

    bundle = build_social_analytics_bundle(ig_analysis, None, attribution)

    # Last-sync aktualisieren
    account = _get_social_account(db, workspace_id, "instagram")
    if account:
        account.last_sync_at = datetime.utcnow()
        db.commit()

    # Response aufbauen
    content_types_out = [
        {
            "media_type": ct.media_type,
            "count": ct.count,
            "avg_reach": ct.avg_reach,
            "avg_engagement_rate": ct.avg_engagement_rate,
            "reach_multiplier": ct.reach_multiplier,
        }
        for ct in ig_analysis.content_types
    ]
    top_tags_out = [
        {
            "hashtag": h.hashtag,
            "post_count": h.post_count,
            "avg_reach": h.avg_reach,
            "reach_lift_pct": round((h.avg_reach_lift - 1) * 100, 1),
        }
        for h in ig_analysis.top_hashtags[:10]
    ]
    full: dict[str, Any] = {
        "followers":              ig_analysis.followers,
        "follows":                ig_analysis.follows,
        "avg_impressions":        ig_analysis.avg_impressions,
        "avg_reach_rate":         ig_analysis.avg_reach_rate,
        "avg_save_rate":          ig_analysis.avg_save_rate,
        "engagement_trend":       ig_analysis.engagement_trend,
        "reach_trend":            ig_analysis.reach_trend,
        "trend_change_pct":       ig_analysis.trend_change_pct,
        "posting_frequency_week": ig_analysis.posting_frequency_per_week,
        "consistency_score":      ig_analysis.consistency_score,
        "heatmap_best_slot":      ig_analysis.heatmap.best_slot_description,
        "heatmap_best_weekday":   ig_analysis.heatmap.best_weekday_name,
        "heatmap_best_hour":      ig_analysis.heatmap.best_hour,
        "stories": {
            "count":              ig_analysis.stories.count,
            "avg_reach":          ig_analysis.stories.avg_reach,
            "avg_exit_rate":      ig_analysis.stories.avg_exit_rate,
            "avg_reply_rate":     ig_analysis.stories.avg_reply_rate,
        } if ig_analysis.stories else None,
        "attribution": {
            "tested":           attribution.tested,
            "p_value":          attribution.p_value,
            "is_significant":   attribution.is_significant,
            "lag_days":         attribution.optimal_lag_days,
            "strength":         attribution.strength,
            "revenue_lift":     attribution.revenue_lift_estimate,
        } if attribution else None,
        "health": {
            "total":            bundle.health_score.total,
            "growth":           bundle.health_score.growth_score,
            "engagement":       bundle.health_score.engagement_score,
            "consistency":      bundle.health_score.consistency_score,
            "attribution":      bundle.health_score.attribution_score,
        } if bundle.health_score else None,
    }

    return SocialAnalyzeResponse(
        platform="instagram",
        posts_analyzed=ig_analysis.posts_analyzed,
        avg_engagement_rate=ig_analysis.avg_engagement_rate,
        avg_reach=ig_analysis.avg_reach,
        best_content_type=ig_analysis.best_content_type,
        best_posting_slot=ig_analysis.heatmap.best_slot_description,
        health_score=bundle.health_score.total if bundle.health_score else None,
        health_rating=bundle.health_score.rating if bundle.health_score else None,
        social_revenue_sig=attribution.is_significant if attribution else False,
        social_revenue_lag=attribution.optimal_lag_days if attribution else None,
        top_hashtags=top_tags_out,
        content_types=content_types_out,
        summary=bundle.summary,
        full_analysis=full,
    )


# ---------------------------------------------------------------------------
# TikTok Endpoints
# ---------------------------------------------------------------------------

@router.get("/api/tiktok/status", response_model=SocialStatusResponse, tags=["tiktok"])
async def tiktok_status(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    """Verbindungsstatus: Ist ein TikTok-Konto verknüpft?"""
    account = _get_social_account(db, workspace_id, "tiktok")
    if account:
        return SocialStatusResponse(
            platform="tiktok", connected=True, source="database",
            username=account.username, account_id=account.account_id,
            last_sync_at=account.last_sync_at.isoformat() if account.last_sync_at else None,
        )
    env_token = _env("TIKTOK_ACCESS_TOKEN")
    if env_token:
        return SocialStatusResponse(
            platform="tiktok", connected=True, source="env",
            username=None, account_id=None, last_sync_at=None,
        )
    return SocialStatusResponse(
        platform="tiktok", connected=False, source="none",
        username=None, account_id=None, last_sync_at=None,
    )


@router.post("/api/tiktok/connect", response_model=ConnectResponse, tags=["tiktok"])
async def tiktok_connect(
    body: ConnectRequest,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    """Speichert TikTok-Access-Token in der DB."""
    existing = _get_social_account(db, workspace_id, "tiktok")

    username   = body.username
    account_id = body.account_id

    # Profil verifizieren
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_TT_BASE}/user/info/",
                headers={"Authorization": f"Bearer {body.access_token}"},
                json={"fields": ["open_id", "display_name", "username"]},
            )
        if resp.status_code == 200:
            tt_data   = resp.json().get("data", {}).get("user", {})
            username  = tt_data.get("display_name", username)
            account_id = tt_data.get("open_id", account_id)
    except Exception as exc:
        logger.warning("TikTok-Verbindungstest fehlgeschlagen: %s", exc)

    if existing:
        existing.access_token = body.access_token
        existing.account_id   = account_id
        existing.username     = username
        existing.is_active    = True
        existing.updated_at   = datetime.utcnow()
    else:
        account = SocialAccount(
            workspace_id  = workspace_id,
            platform      = "tiktok",
            account_id    = account_id,
            username      = username,
            access_token  = body.access_token,
            is_active     = True,
        )
        db.add(account)

    db.commit()
    logger.info("TikTok verbunden: workspace=%s user=%s", workspace_id, username)
    return ConnectResponse(
        platform="tiktok", connected=True,
        username=username, account_id=account_id,
        message="TikTok erfolgreich verbunden",
    )


@router.delete("/api/tiktok/disconnect", status_code=204, tags=["tiktok"])
async def tiktok_disconnect(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    account = _get_social_account(db, workspace_id, "tiktok")
    if account:
        account.is_active    = False
        account.access_token = None
        account.updated_at   = datetime.utcnow()
        db.commit()


@router.get("/api/tiktok/analyze", response_model=SocialAnalyzeResponse, tags=["tiktok"])
async def tiktok_analyze(
    limit: int     = Query(default=_MAX_TT_VIDEOS, ge=5, le=50),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
    workspace_id: int     = Depends(get_current_workspace_id),
):
    """
    Vollständige TikTok-Analyse (Schicht 8):
    Holt Videos von der TikTok Display API und führt analytics/social_analytics.py aus.
    """
    token = _tt_token(db, workspace_id)
    if not token:
        raise HTTPException(status_code=404, detail="Kein TikTok-Token konfiguriert")

    try:
        from analytics.social_analytics import (
            analyze_tiktok_videos,
            build_social_analytics_bundle,
        )
    except ImportError:
        raise HTTPException(status_code=503, detail="analytics.social_analytics nicht verfügbar")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 1. Profil
    profile: dict[str, Any] = {}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_TT_BASE}/user/info/",
                headers=headers,
                json={"fields": ["open_id", "display_name", "follower_count", "following_count", "video_count"]},
            )
        resp.raise_for_status()
        profile = resp.json().get("data", {}).get("user", {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TikTok Profil-Fetch fehlgeschlagen: {str(exc)[:200]}")

    # 2. Video-Liste
    videos: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_TT_BASE}/video/list/",
                headers=headers,
                json={
                    "fields": [
                        "id", "create_time", "title",
                        "play_count", "like_count", "comment_count", "share_count",
                        "duration", "cover_image_url",
                    ],
                    "max_count": limit,
                },
            )
        resp.raise_for_status()
        videos = resp.json().get("data", {}).get("videos", [])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TikTok Video-Fetch fehlgeschlagen: {str(exc)[:200]}")

    # 3. Analytics
    tt_analysis = analyze_tiktok_videos(videos, profile)
    bundle      = build_social_analytics_bundle(None, tt_analysis, None)

    # Last-sync aktualisieren
    account = _get_social_account(db, workspace_id, "tiktok")
    if account:
        account.last_sync_at = datetime.utcnow()
        db.commit()

    seg_str = "  ".join(f"{k}:{v}" for k, v in tt_analysis.completion_segments.items())
    full: dict[str, Any] = {
        "followers":           tt_analysis.followers,
        "avg_play_count":      tt_analysis.avg_play_count,
        "avg_completion_rate": tt_analysis.avg_completion_rate,
        "avg_like_rate":       tt_analysis.avg_like_rate,
        "avg_share_rate":      tt_analysis.avg_share_rate,
        "avg_comment_rate":    tt_analysis.avg_comment_rate,
        "completion_segments": tt_analysis.completion_segments,
        "dominant_segment":    tt_analysis.dominant_segment,
        "avg_view_velocity":   tt_analysis.avg_view_velocity,
        "peak_view_velocity":  tt_analysis.peak_view_velocity,
    }

    return SocialAnalyzeResponse(
        platform="tiktok",
        posts_analyzed=tt_analysis.videos_analyzed,
        avg_engagement_rate=tt_analysis.avg_like_rate,
        avg_reach=tt_analysis.avg_play_count,
        best_content_type="Videos",
        best_posting_slot=seg_str or "N/A",
        health_score=bundle.health_score.total if bundle.health_score else None,
        health_rating=bundle.health_score.rating if bundle.health_score else None,
        social_revenue_sig=False,
        social_revenue_lag=None,
        top_hashtags=[],
        content_types=[],
        summary=bundle.summary,
        full_analysis=full,
    )
