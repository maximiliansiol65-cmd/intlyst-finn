from __future__ import annotations

from typing import Any
import os

from load_env import DEFAULT_CLAUDE_MODEL, load_environment
from security_config import is_configured_secret

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_API_VERSION = "2023-06-01"


def get_claude_runtime_config() -> tuple[str, str]:
    """Reload environment-backed Claude config so key/model rotations apply immediately."""
    load_environment()
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    model = os.getenv("CLAUDE_MODEL", DEFAULT_CLAUDE_MODEL).strip() or DEFAULT_CLAUDE_MODEL
    return api_key, model


def has_valid_claude_key() -> bool:
    api_key, _ = get_claude_runtime_config()
    return is_configured_secret(api_key, prefixes=("sk-ant-",), min_length=20)


def build_claude_headers(api_key: str) -> dict[str, str]:
    return {
        "x-api-key": api_key,
        "anthropic-version": CLAUDE_API_VERSION,
        "content-type": "application/json",
    }


def build_claude_payload(
    user_prompt: str,
    *,
    model: str,
    max_tokens: int,
    system_prompt: str | None = None,
    messages: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages if messages is not None else [{"role": "user", "content": user_prompt}],
    }
    if system_prompt:
        payload["system"] = system_prompt
    return payload
