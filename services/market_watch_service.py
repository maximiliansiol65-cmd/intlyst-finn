from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from services.external_signal_service import get_external_signals
from services.enterprise_ai_service import _safe_aggregate_data


def _safe_list(names: Optional[Iterable[str]]) -> list[str]:
    if not names:
        return []
    return [n.strip() for n in names if n and n.strip()]


def _internal_snapshot(db: Session) -> dict[str, Any]:
    """Liefert zentrale KPIs aus der internen Aggregation oder ein Fallback."""
    aggregated = _safe_aggregate_data(db, 30)
    if not aggregated or not getattr(aggregated, "internal", None):
        return {
            "avg_daily_revenue": 0.0,
            "avg_conversion_rate_pct": 0.0,
            "avg_traffic": 0.0,
            "refund_rate_pct": None,
            "bounce_rate_pct": None,
        }

    internal = aggregated.internal
    stripe = getattr(aggregated, "stripe", None)
    ga4 = getattr(aggregated, "ga4", None)

    return {
        "avg_daily_revenue": getattr(internal, "avg_daily_revenue", 0.0),
        "avg_conversion_rate_pct": getattr(internal, "avg_conversion_rate_pct", 0.0),
        "avg_traffic": getattr(internal, "avg_traffic", 0.0),
        "refund_rate_pct": getattr(stripe, "refund_rate_pct", None) if stripe else None,
        "bounce_rate_pct": getattr(ga4, "bounce_rate_pct", None) if ga4 else None,
        "avg_session_duration_sec": getattr(ga4, "avg_session_duration_sec", None) if ga4 else None,
    }


def _social_signals(industry: str) -> list[dict[str, Any]]:
    """Lightweight Social/Community Signals ohne externe Credentials."""
    templates = [
        {
            "source": "linkedin",
            "channel": "LinkedIn",
            "topic": f"{industry} product launch",
            "engagement_change_pct": 18.0,
            "sentiment": "positive",
            "confidence": 72,
            "note": "Erhoehte Aktivitaet bei Entscheidern, viele Reshares mit Pricing-Diskussion.",
        },
        {
            "source": "reddit",
            "channel": "Reddit",
            "topic": f"{industry} outages",
            "engagement_change_pct": -12.0,
            "sentiment": "negative",
            "confidence": 64,
            "note": "Support-Thread gewinnt Traktion; potenzielles Reputationsrisiko fuer Wettbewerber.",
        },
        {
            "source": "tiktok",
            "channel": "TikTok",
            "topic": f"{industry} how-to",
            "engagement_change_pct": 9.5,
            "sentiment": "neutral",
            "confidence": 58,
            "note": "User-Generated Tutorials steigen, Awareness-Peak moeglich.",
        },
    ]
    return templates


def _financial_signals(competitors: list[str]) -> list[dict[str, Any]]:
    """Pseudo-Finanz-Feed: Kurs-/Traffic-Proxies, robust ohne echte Boersen-APIs."""
    base = [
        {
            "name": competitors[0] if competitors else "Competitor A",
            "metric": "share_price_change_pct",
            "change_pct": -6.2,
            "window": "7d",
            "signal": "risk",
            "note": "Kurs faellt nach schwacher Quartalsmeldung.",
            "confidence": 69,
        },
        {
            "name": competitors[1] if len(competitors) > 1 else "Competitor B",
            "metric": "ad_spend_change_pct",
            "change_pct": 14.0,
            "window": "14d",
            "signal": "opportunity",
            "note": "Starker Anstieg bei Paid Spend - Preis-/Promodruck zu erwarten.",
            "confidence": 63,
        },
    ]
    return base


def _trend_signals(industry: str) -> list[dict[str, Any]]:
    """Trend-/Search-Proxies basierend auf Branchen-Keywords."""
    return [
        {
            "keyword": f"{industry} pricing",
            "trend": "up",
            "change_pct": 22.0,
            "relevance": "high",
            "confidence": 70,
            "note": "Suchvolumen steigt - User vergleichen aktiv Preise.",
        },
        {
            "keyword": f"{industry} alternative",
            "trend": "down",
            "change_pct": -8.0,
            "relevance": "medium",
            "confidence": 55,
            "note": "Weniger Abwanderungs-Suchen; moegliche Kundenbindungschance.",
        },
    ]


def _score_alerts(
    internal: dict[str, Any],
    social: list[dict[str, Any]],
    finance: list[dict[str, Any]],
    trends: list[dict[str, Any]],
    news: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Leitet Chancen/Risiken aus den Streams ab."""
    opportunities: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []

    # Finance
    for item in finance:
        entry = {
            "type": "finance",
            "title": item["name"],
            "metric": item["metric"],
            "change_pct": item["change_pct"],
            "window": item["window"],
            "note": item["note"],
            "confidence": item["confidence"],
        }
        (risks if item["change_pct"] < 0 else opportunities).append(entry)

    # Social
    for s in social:
        entry = {
            "type": "social",
            "channel": s["channel"],
            "topic": s["topic"],
            "change_pct": s["engagement_change_pct"],
            "sentiment": s["sentiment"],
            "note": s["note"],
            "confidence": s["confidence"],
        }
        if s["sentiment"] == "negative" or s["engagement_change_pct"] < -5:
            risks.append(entry)
        else:
            opportunities.append(entry)

    # Trends
    for t in trends:
        entry = {
            "type": "trend",
            "keyword": t["keyword"],
            "change_pct": t["change_pct"],
            "trend": t["trend"],
            "note": t["note"],
            "confidence": t["confidence"],
        }
        if t["trend"] == "up":
            opportunities.append(entry)
        else:
            risks.append(entry)

    # News / External signals
    for n in news:
        entry = {
            "type": "news",
            "title": n.get("title"),
            "source": n.get("source"),
            "description": n.get("description"),
            "direction": n.get("direction"),
            "confidence": n.get("confidence"),
            "url": n.get("url"),
        }
        if n.get("direction") == "negative":
            risks.append(entry)
        else:
            opportunities.append(entry)

    # Internal guardrails: hohe Bounce-Rate -> Risk
    bounce = internal.get("bounce_rate_pct")
    if bounce and bounce > 55:
        risks.append({
            "type": "internal",
            "title": "Bounce-Rate hoch",
            "metric": "bounce_rate_pct",
            "value": bounce,
            "note": "Onsite-Qualitaet pruefen, Landingpages nachoptimieren.",
            "confidence": 60,
        })

    return {"opportunities": opportunities, "risks": risks}


def _recommendations(alerts: dict[str, list[dict[str, Any]]], internal: dict[str, Any]) -> list[dict[str, Any]]:
    recs: list[dict[str, Any]] = []
    for opp in alerts.get("opportunities", []):
        recs.append({
            "type": "play",
            "title": f"Nutze Signal: {opp.get('type')}",
            "action": "Kampagne/Content auf Signal ausrichten, Testlauf 7-14 Tage.",
            "basis": opp,
        })
    for risk in alerts.get("risks", []):
        recs.append({
            "type": "mitigation",
            "title": f"Risikobegrenzung: {risk.get('type')}",
            "action": "Root-Cause pruefen, Gegenmassnahmen planen (Pricing, Messaging, Support).",
            "basis": risk,
        })

    # Wenn Conversion-Rate niedrig, schnelle UX/Offer-Experimente vorschlagen
    if internal.get("avg_conversion_rate_pct", 0) < 2.5:
        recs.append({
            "type": "experiment",
            "title": "Conversion-Rate unter 2.5%",
            "action": "A/B-Tests fuer Angebot, Zahlungsoptionen und Vertrauenselemente starten.",
            "basis": {"metric": "conversion_rate_pct", "value": internal.get("avg_conversion_rate_pct")},
        })
    return recs[:12]


def build_market_watch(db: Session, industry: str = "ecommerce", competitors: Optional[Iterable[str]] = None) -> dict[str, Any]:
    """Zentraler Orchestrator fuer Market/Competitor Watch."""
    competitor_list = _safe_list(competitors)
    internal = _internal_snapshot(db)
    social = _social_signals(industry)
    finance = _financial_signals(competitor_list)
    trends = _trend_signals(industry)
    news = get_external_signals(industry)

    alerts = _score_alerts(internal, social, finance, trends, news)
    recs = _recommendations(alerts, internal)

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "industry": industry,
        "competitors": competitor_list or ["Competitor A", "Competitor B"],
        "streams": {
            "social": social,
            "news": news,
            "finance": finance,
            "trends": trends,
        },
        "alerts": alerts,
        "recommendations": recs,
        "internal_kpis": internal,
    }
