import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date, timedelta
import random

from database import SessionLocal, engine
from models.daily_metrics import Base, DailyMetrics

Base.metadata.create_all(bind=engine)


def seed_timeseries() -> int:
    db = SessionLocal()
    inserted_rows = 0

    # Base values with a slight growth trend.
    base_revenue = 900.0
    base_traffic = 8
    base_new_customers = 1

    today = date.today()

    for i in range(30):
        day = today - timedelta(days=(29 - i))

        # Growth trend: ~0.5% per day + noise.
        growth_factor = 1 + (i * 0.005)
        noise = random.uniform(0.88, 1.12)

        revenue = round(base_revenue * growth_factor * noise, 2)
        traffic = max(1, int(base_traffic * growth_factor * random.uniform(0.85, 1.15)))
        conversions = max(0, int(traffic * random.uniform(0.4, 0.75)))
        conversion_rate = round(conversions / traffic, 4) if traffic > 0 else 0.0
        new_customers = max(0, int(base_new_customers * growth_factor * random.uniform(0.5, 1.5)))

        existing = db.query(DailyMetrics).filter_by(date=day, period="daily").first()
        if existing:
            continue

        entry = DailyMetrics(
            date=day,
            period="daily",
            revenue=revenue,
            traffic=traffic,
            conversions=conversions,
            conversion_rate=conversion_rate,
            new_customers=new_customers,
        )
        db.add(entry)
        inserted_rows += 1

    db.commit()
    db.close()
    print(f"Timeseries seed completed. Inserted rows: {inserted_rows}")
    return inserted_rows


if __name__ == "__main__":
    seed_timeseries()
