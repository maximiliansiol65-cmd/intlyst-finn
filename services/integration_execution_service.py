from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from models.user_integration import UserIntegration


def _get_integration(db: Session, user_id: int, integration_type: str) -> Optional[UserIntegration]:
    return (
        db.query(UserIntegration)
        .filter(
            UserIntegration.user_id == user_id,
            UserIntegration.integration_type == integration_type,
            UserIntegration.is_active == True,  # noqa: E712
        )
        .first()
    )


def _store_integration_error(row: UserIntegration, db: Session, message: str) -> None:
    row.error_message = message[:250]
    db.flush()


async def deliver_webhook_action(
    db: Session,
    user_id: int,
    payload: dict[str, Any],
) -> Optional[dict[str, Any]]:
    row = _get_integration(db, user_id, "webhook")
    if not row:
        return None

    creds = row.get_credentials()
    url = creds.get("url")
    secret = creds.get("secret")
    if not url:
        return None

    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Intlyst-Webhook-Secret"] = str(secret)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(url, headers=headers, content=json.dumps(payload))
    except httpx.HTTPError as exc:
        _store_integration_error(row, db, str(exc))
        return None

    row.last_synced_at = datetime.utcnow()
    row.error_message = None if res.status_code < 400 else res.text[:250]
    db.flush()

    return {
        "url": url,
        "status_code": res.status_code,
    }


async def create_mailchimp_campaign_draft(
    db: Session,
    user_id: int,
    subject: str,
    html: str,
) -> Optional[dict[str, Any]]:
    row = _get_integration(db, user_id, "mailchimp")
    if not row:
        return None

    creds = row.get_credentials()
    api_key = creds.get("api_key")
    server_prefix = creds.get("server_prefix")
    list_id = creds.get("list_id")
    from_name = creds.get("from_name", "INTLYST")
    reply_to = creds.get("reply_to", "noreply@intlyst.local")
    if not api_key or not server_prefix or not list_id:
        return None

    base_url = f"https://{server_prefix}.api.mailchimp.com/3.0"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            create_res = await client.post(
                f"{base_url}/campaigns",
                auth=("anystring", api_key),
                json={
                    "type": "regular",
                    "recipients": {"list_id": list_id},
                    "settings": {
                        "subject_line": subject,
                        "title": subject,
                        "from_name": from_name,
                        "reply_to": reply_to,
                    },
                },
            )
            if create_res.status_code >= 400:
                row.error_message = create_res.text[:250]
                db.flush()
                return None

            campaign = create_res.json()
            campaign_id = campaign.get("id")
            if not campaign_id:
                return None

            content_res = await client.put(
                f"{base_url}/campaigns/{campaign_id}/content",
                auth=("anystring", api_key),
                json={"html": html},
            )
            row.last_synced_at = datetime.utcnow()
            row.error_message = None if content_res.status_code < 400 else content_res.text[:250]
            db.flush()
    except httpx.HTTPError as exc:
        _store_integration_error(row, db, str(exc))
        return None

    return {
        "campaign_id": campaign_id,
        "web_id": campaign.get("web_id"),
        "emails_sent": campaign.get("emails_sent", 0),
        "status": campaign.get("status", "save"),
    }


async def create_hubspot_task(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    due_in_days: int = 3,
) -> Optional[dict[str, Any]]:
    row = _get_integration(db, user_id, "hubspot")
    if not row:
        return None

    creds = row.get_credentials()
    token = creds.get("api_key") or creds.get("access_token")
    owner_id = creds.get("owner_id")
    if not token:
        return None

    due_ts = int((datetime.utcnow().timestamp() + due_in_days * 86400) * 1000)
    payload = {
        "properties": {
            "hs_task_subject": title,
            "hs_task_body": body,
            "hs_timestamp": due_ts,
            "hs_task_status": "NOT_STARTED",
            "hs_task_priority": "HIGH",
        }
    }
    if owner_id:
        payload["properties"]["hubspot_owner_id"] = str(owner_id)

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                "https://api.hubapi.com/crm/v3/objects/tasks",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        _store_integration_error(row, db, str(exc))
        return None
    if res.status_code >= 400:
        row.error_message = res.text[:250]
        db.flush()
        return None

    row.last_synced_at = datetime.utcnow()
    row.error_message = None
    db.flush()
    data = res.json()
    return {
        "task_id": data.get("id"),
        "url": f"https://app.hubspot.com/contacts/{creds.get('portal_id', 'unknown')}/tasks/list/view/all/",
    }


async def post_slack_strategy_message(
    db: Session,
    user_id: int,
    title: str,
    summary: str,
    details: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    row = _get_integration(db, user_id, "slack")
    if not row:
        return None

    creds = row.get_credentials()
    webhook_url = creds.get("webhook_url")
    channel = creds.get("channel")
    if not webhook_url:
        return None

    metrics = details or {}
    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": title[:150]}},
        {"type": "section", "text": {"type": "mrkdwn", "text": summary[:2800]}},
    ]
    if metrics:
        fields = []
        for key, value in list(metrics.items())[:6]:
            fields.append({"type": "mrkdwn", "text": f"*{str(key).replace('_', ' ').title()}*\n{value}"})
        if fields:
            blocks.append({"type": "section", "fields": fields})

    payload = {"text": title, "blocks": blocks}
    if channel:
        payload["channel"] = channel

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(webhook_url, json=payload)
    except httpx.HTTPError as exc:
        _store_integration_error(row, db, str(exc))
        return None

    row.last_synced_at = datetime.utcnow()
    row.error_message = None if res.status_code < 400 else res.text[:250]
    db.flush()

    return {
        "channel": channel or "default",
        "status_code": res.status_code,
    }


async def create_notion_strategy_page(
    db: Session,
    user_id: int,
    title: str,
    summary: str,
    details: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    row = _get_integration(db, user_id, "notion")
    if not row:
        return None

    creds = row.get_credentials()
    token = creds.get("access_token")
    database_id = creds.get("database_id")
    parent_page_id = creds.get("parent_page_id")
    title_property = creds.get("title_property", "Name")
    if not token or not (database_id or parent_page_id):
        return None

    parent = {"database_id": database_id} if database_id else {"page_id": parent_page_id}
    properties = {}
    if database_id:
        properties[title_property] = {
            "title": [{"text": {"content": title[:180]}}],
        }

    children = [
        {
            "object": "block",
            "type": "heading_2",
            "heading_2": {"rich_text": [{"type": "text", "text": {"content": title[:180]}}]},
        },
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": [{"type": "text", "text": {"content": summary[:1800]}}]},
        },
    ]
    for key, value in list((details or {}).items())[:8]:
        children.append({
            "object": "block",
            "type": "bulleted_list_item",
            "bulleted_list_item": {
                "rich_text": [{"type": "text", "text": {"content": f"{str(key).replace('_', ' ').title()}: {value}"[:1900]}}],
            },
        })

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                "https://api.notion.com/v1/pages",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Notion-Version": "2022-06-28",
                    "Content-Type": "application/json",
                },
                json={
                    "parent": parent,
                    "properties": properties,
                    "children": children,
                },
            )
    except httpx.HTTPError as exc:
        _store_integration_error(row, db, str(exc))
        return None
    if res.status_code >= 400:
        row.error_message = res.text[:250]
        db.flush()
        return None

    row.last_synced_at = datetime.utcnow()
    row.error_message = None
    db.flush()
    data = res.json()
    return {
        "page_id": data.get("id"),
        "url": data.get("url"),
    }


async def create_trello_card(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    due_in_days: int = 3,
) -> Optional[dict[str, Any]]:
    row = _get_integration(db, user_id, "trello")
    if not row:
        return None

    creds = row.get_credentials()
    api_key = creds.get("api_key")
    token = creds.get("token")
    list_id = creds.get("list_id")
    if not api_key or not token or not list_id:
        return None

    due_at = datetime.utcnow().replace(microsecond=0)
    due_at = due_at.timestamp() + due_in_days * 86400
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                "https://api.trello.com/1/cards",
                params={
                    "key": api_key,
                    "token": token,
                    "idList": list_id,
                    "name": title,
                    "desc": body,
                    "due": datetime.utcfromtimestamp(due_at).isoformat() + "Z",
                },
            )
    except httpx.HTTPError as exc:
        _store_integration_error(row, db, str(exc))
        return None
    if res.status_code >= 400:
        row.error_message = res.text[:250]
        db.flush()
        return None

    row.last_synced_at = datetime.utcnow()
    row.error_message = None
    db.flush()
    data = res.json()
    return {
        "card_id": data.get("id"),
        "url": data.get("shortUrl"),
    }


async def fetch_mailchimp_campaign_feedback(
    db: Session,
    user_id: int,
    campaign_id: str,
) -> Optional[dict[str, Any]]:
    row = _get_integration(db, user_id, "mailchimp")
    if not row:
        return None

    creds = row.get_credentials()
    api_key = creds.get("api_key")
    server_prefix = creds.get("server_prefix")
    if not api_key or not server_prefix or not campaign_id:
        return None

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.get(
                f"https://{server_prefix}.api.mailchimp.com/3.0/reports/{campaign_id}",
                auth=("anystring", api_key),
            )
    except httpx.HTTPError as exc:
        _store_integration_error(row, db, str(exc))
        return None
    if res.status_code >= 400:
        row.error_message = res.text[:250]
        db.flush()
        return None

    row.last_synced_at = datetime.utcnow()
    row.error_message = None
    db.flush()
    data = res.json()
    return {
        "campaign_id": campaign_id,
        "emails_sent": data.get("emails_sent", 0),
        "open_rate": round(float(data.get("open_rate") or 0.0), 2),
        "click_rate": round(float(data.get("click_rate") or 0.0), 2),
        "open_count": data.get("opens", {}).get("opens_total", 0),
        "click_count": data.get("clicks", {}).get("clicks_total", 0),
        "unsubscribed": data.get("unsubscribed", 0),
    }


def create_social_campaign_drafts(
    db: Session,
    user_id: int,
    posts: list[dict[str, Any]],
) -> dict[str, Any]:
    instagram = _get_integration(db, user_id, "instagram")
    meta_ads = _get_integration(db, user_id, "meta_ads")

    drafts = []
    for post in posts:
        channel = post.get("channel", "social")
        provider = "internal"
        status = "draft_ready"
        if channel == "instagram" and instagram:
            provider = "instagram"
            status = "connector_ready"
            instagram.last_synced_at = datetime.utcnow()
            instagram.error_message = None
        elif channel in {"facebook", "linkedin", "meta"} and meta_ads:
            provider = "meta_ads"
            status = "connector_ready"
            meta_ads.last_synced_at = datetime.utcnow()
            meta_ads.error_message = None

        drafts.append({
            "channel": channel,
            "provider": provider,
            "status": status,
            "headline": post.get("headline"),
            "body": post.get("body"),
        })

    db.flush()
    return {"drafts": drafts, "count": len(drafts)}
