"""
One-time historical GA4 import for the last N months.
Run with: python scripts/ga4_backfill.py
"""

import asyncio
import importlib
import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv

# Ensure project root is on sys.path when script is run directly.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

load_dotenv()

from database import SessionLocal


def _load_ga4_dependencies():
    """Load GA4 router symbols lazily so missing modules produce a clear message."""
    try:
        ga4_module = importlib.import_module("routers.ga4")
    except Exception as exc:
        raise RuntimeError(
            "GA4 router module is missing. Expected module: routers.ga4"
        ) from exc

    import_ga4_data = getattr(ga4_module, "import_ga4_data", None)
    ga4_config_model = getattr(ga4_module, "GA4Config", None)

    if import_ga4_data is None or ga4_config_model is None:
        raise RuntimeError(
            "routers.ga4 found but required symbols are missing: import_ga4_data and GA4Config"
        )

    return import_ga4_data, ga4_config_model


async def backfill(months: int = 12):
    db = SessionLocal()

    try:
        import_ga4_data, ga4_config_model = _load_ga4_dependencies()

        config = db.query(ga4_config_model).first()
        if not config:
            print("[ERROR] GA4 is not configured.")
            print("Start the API and call:")
            print("POST /api/ga4/configure")
            print('{"property_id": "YOUR_PROPERTY_ID"}')
            return

        end_date = date.today() - timedelta(days=1)
        start_date = date.today() - timedelta(days=months * 30)

        print(f"GA4 Backfill: {start_date} to {end_date}")
        print(f"Property: {config.property_id}")
        print(f"Range: {(end_date - start_date).days} days")
        print("Starting import...")

        # Import in 30-day chunks.
        current = start_date
        total_imported = 0
        total_updated = 0
        block = 0

        while current < end_date:
            block_end = min(current + timedelta(days=29), end_date)
            block += 1
            print(f"\nBlock {block}: {current} to {block_end}")

            result = await import_ga4_data(
                property_id=config.property_id,
                start_date=current,
                end_date=block_end,
                db=db,
            )

            total_imported += int(getattr(result, "rows_imported", 0) or 0)
            total_updated += int(getattr(result, "rows_updated", 0) or 0)

            success = bool(getattr(result, "success", False))
            duration_ms = int(getattr(result, "duration_ms", 0) or 0)
            status = "[OK]" if success else "[WARN]"
            print(
                f"  {status} {getattr(result, 'rows_imported', 0)} new, "
                f"{getattr(result, 'rows_updated', 0)} updated ({duration_ms}ms)"
            )

            errors = list(getattr(result, "errors", []) or [])
            if errors:
                for err in errors[:2]:
                    print(f"  [WARN] {err}")

            current = block_end + timedelta(days=1)
            await asyncio.sleep(1)

        print("\n" + "=" * 50)
        print("[OK] Backfill complete")
        print(f"  {total_imported} new records")
        print(f"  {total_updated} updated records")
        print(f"  {months} months of historical data imported")

    finally:
        db.close()


if __name__ == "__main__":
    months = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    asyncio.run(backfill(months))
