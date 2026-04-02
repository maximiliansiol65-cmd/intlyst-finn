class ExternalDataProvider:
    """
    Liefert externe Faktoren wie Markttrends, News, Wettbewerber, saisonale Effekte.
    """
    def __init__(self, country_code: str = "DE"):
        self.country_code = country_code

    def get_factors(self):
        # Platzhalter: Integriere externe APIs/Analytics
        # Beispiel: Feiertage, Google Trends, Wettbewerberdaten
        return {
            "holidays": [],
            "market_trends": {},
            "competitors": {},
            "seasonal_effects": {},
        }
