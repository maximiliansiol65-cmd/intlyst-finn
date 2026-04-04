from __future__ import annotations

import os
from pathlib import Path

from dotenv import dotenv_values

DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-20250514"


def _normalize_env_value(value: str) -> str:
    cleaned = (value or "").strip().strip('"').strip("'")
    if cleaned.startswith("sk-ant-") and cleaned.endswith("#"):
        cleaned = cleaned[:-1].rstrip()
    return cleaned


def load_environment() -> None:
    root = Path(__file__).resolve().parent

    merged_defaults: dict[str, str] = {}
    for path in (root / ".env", root / ".env.local"):
        for key, value in dotenv_values(path).items():
            if value is not None:
                merged_defaults[key] = str(value)

    # Process-level environment variables always win. `.env.local` still overrides
    # `.env` within the fallback set because it is merged last above.
    for key, value in merged_defaults.items():
        os.environ.setdefault(key, value)

    anthropic_key = _normalize_env_value(os.getenv("ANTHROPIC_API_KEY", ""))
    if anthropic_key:
        os.environ["ANTHROPIC_API_KEY"] = anthropic_key

    claude_model = _normalize_env_value(os.getenv("CLAUDE_MODEL", ""))
    os.environ["CLAUDE_MODEL"] = claude_model or DEFAULT_CLAUDE_MODEL


load_environment()
