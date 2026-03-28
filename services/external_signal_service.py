from __future__ import annotations

import os
from datetime import date
from typing import Any
from xml.etree import ElementTree

import httpx


def _fallback_signals(industry: str = "ecommerce") -> list[dict[str, Any]]:
    month = date.today().month
    seasonal_pressure = "high" if month in {11, 12, 1} else "medium" if month in {6, 7, 8} else "normal"

    industry_map = {
        "ecommerce": [
            {
                "source": "market_trend",
                "title": "Paid CPM steigt kurzfristig",
                "impact_window_days": 14,
                "direction": "negative",
                "confidence": 72,
                "description": "Akquisitionskosten könnten in den nächsten 2 Wochen auf Marge und Neukunden drücken.",
            },
            {
                "source": "competitor_watch",
                "title": "Wettbewerber erhöhen Promo-Druck",
                "impact_window_days": 21,
                "direction": "negative",
                "confidence": 64,
                "description": "Mehr Rabattaktionen im Markt erhöhen den Preisvergleichsdruck.",
            },
        ],
        "saas": [
            {
                "source": "market_trend",
                "title": "Längere Sales-Zyklen im Mid-Market",
                "impact_window_days": 30,
                "direction": "negative",
                "confidence": 68,
                "description": "Entscheidungen werden langsamer, was Pipeline-Conversion verzögern kann.",
            }
        ],
    }

    base = list(industry_map.get(industry, industry_map["ecommerce"]))
    base.append({
        "source": "seasonality",
        "title": f"Saisonale Marktdynamik: {seasonal_pressure}",
        "impact_window_days": 21,
        "direction": "neutral",
        "confidence": 58,
        "description": "Saisonale Nachfrage und Wettbewerbsintensität sollten in Forecasts berücksichtigt werden.",
    })
    return base


def _newsapi_signals(industry: str) -> list[dict[str, Any]]:
    api_key = os.getenv("NEWSAPI_KEY", "").strip()
    if not api_key:
        return []
    query = f"{industry} market OR competitor OR pricing"
    with httpx.Client(timeout=8) as client:
        res = client.get(
            "https://newsapi.org/v2/everything",
            params={"q": query, "language": "en", "sortBy": "publishedAt", "pageSize": 3},
            headers={"X-Api-Key": api_key},
        )
    if res.status_code >= 400:
        return []
    data = res.json()
    items = []
    for article in data.get("articles", [])[:3]:
        title = article.get("title") or "Market signal"
        items.append({
            "source": article.get("source", {}).get("name", "newsapi"),
            "title": title,
            "impact_window_days": 14,
            "direction": "neutral",
            "confidence": 67,
            "description": article.get("description") or title,
            "url": article.get("url"),
        })
    return items


def _rss_signals(industry: str) -> list[dict[str, Any]]:
    query = f"{industry} market competitor pricing"
    url = f"https://news.google.com/rss/search?q={query.replace(' ', '+')}&hl=en-US&gl=US&ceid=US:en"
    with httpx.Client(timeout=8, follow_redirects=True) as client:
        res = client.get(url)
    if res.status_code >= 400:
        return []
    root = ElementTree.fromstring(res.text)
    items = []
    for item in root.findall(".//item")[:3]:
        title = item.findtext("title") or "External signal"
        link = item.findtext("link")
        items.append({
            "source": "google_news_rss",
            "title": title,
            "impact_window_days": 10,
            "direction": "neutral",
            "confidence": 61,
            "description": title,
            "url": link,
        })
    return items


def get_external_signals(industry: str = "ecommerce") -> list[dict[str, Any]]:
    base = _fallback_signals(industry)
    try:
        live = _newsapi_signals(industry) or _rss_signals(industry)
        if live:
            return live + base
    except Exception:
        pass
    return base
