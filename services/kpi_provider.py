class KPIProvider:
    """
    Liefert interne KPIs aus der Datenbank oder Analytics-Schicht.
    """
    def __init__(self, db_session, workspace_id: int):
        self.db = db_session
        self.workspace_id = workspace_id

    def get_kpis(self):
        # Beispiel: Umsatz, Traffic, Conversion, Engagement
        from models.daily_metrics import DailyMetrics
        from sqlalchemy import func
        today = func.current_date()
        kpis = self.db.query(
            func.sum(DailyMetrics.revenue).label("revenue"),
            func.sum(DailyMetrics.traffic).label("traffic"),
            func.avg(DailyMetrics.conversion_rate).label("conversion_rate"),
            func.sum(DailyMetrics.new_customers).label("new_customers")
        ).filter(DailyMetrics.workspace_id == self.workspace_id).first()
        return {
            "revenue": kpis.revenue or 0,
            "traffic": kpis.traffic or 0,
            "conversion_rate": kpis.conversion_rate or 0,
            "new_customers": kpis.new_customers or 0,
        }
