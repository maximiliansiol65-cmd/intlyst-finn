import os


_INSECURE_EXACT_VALUES = {
    "dein-secret",
    "bizlytics-super-secret-key-change-in-production",
    "change-this-in-production",
    "change-me",
    "changeme",
    "replace-me",
    "replace-with-secure-value",
    "sk_live_...",
    "sk_test_...",
    "whsec_...",
    "price_...",
}

_PLACEHOLDER_MARKERS = (
    "[",
    "]",
    "your-key",
    "your-secret",
    "generate-from",
    "paste-output",
    "change-in-production",
    "placeholder",
)


def is_production_environment() -> bool:
    return os.getenv("APP_ENV", "development").strip().lower() == "production"


def is_placeholder_secret(value: str) -> bool:
    stripped = (value or "").strip()
    if not stripped:
        return True

    lowered = stripped.lower()
    if lowered in _INSECURE_EXACT_VALUES:
        return True
    if stripped.endswith("..."):
        return True
    return any(marker in lowered for marker in _PLACEHOLDER_MARKERS)


def is_configured_secret(value: str, prefixes: tuple[str, ...] = (), min_length: int = 1) -> bool:
    stripped = (value or "").strip()
    if len(stripped) < min_length or is_placeholder_secret(stripped):
        return False
    if prefixes and not any(stripped.startswith(prefix) for prefix in prefixes):
        return False
    return True


def get_runtime_secret_issues() -> list[str]:
    issues: list[str] = []

    jwt_secret = os.getenv("JWT_SECRET", "")
    if not is_configured_secret(jwt_secret, min_length=32):
        issues.append("JWT_SECRET fehlt, ist zu kurz oder nutzt einen unsicheren Standardwert.")

    webhook_secret = os.getenv("WEBHOOK_SECRET", "")
    if is_production_environment() and not is_configured_secret(webhook_secret, min_length=24):
        issues.append("WEBHOOK_SECRET fehlt oder ist fuer Produktion unsicher konfiguriert.")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if anthropic_key and not is_configured_secret(anthropic_key, prefixes=("sk-ant-",), min_length=20):
        issues.append("ANTHROPIC_API_KEY ist gesetzt, aber offensichtlich ein Platzhalter oder ungueltig.")

    google_maps_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if google_maps_key and not is_configured_secret(google_maps_key, prefixes=("AIza",), min_length=20):
        issues.append("GOOGLE_MAPS_API_KEY ist gesetzt, aber offensichtlich ein Platzhalter oder ungueltig.")

    stripe_secret_key = os.getenv("STRIPE_SECRET_KEY", "")
    if stripe_secret_key and not is_configured_secret(stripe_secret_key, prefixes=("sk_",), min_length=12):
        issues.append("STRIPE_SECRET_KEY ist gesetzt, aber offensichtlich ein Platzhalter oder ungueltig.")

    stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if stripe_webhook_secret and not is_configured_secret(stripe_webhook_secret, prefixes=("whsec_",), min_length=12):
        issues.append("STRIPE_WEBHOOK_SECRET ist gesetzt, aber offensichtlich ein Platzhalter oder ungueltig.")

    return issues