"""
Marketing-Strategie-KI für die Intlyst-App
Automatische Erkennung von Veränderungen, Strategie-Generierung und 1-Klick-Aktivierung
"""

from typing import List, Dict, Any
import datetime

class GrowthAI:
    """
    Wachstums-KI für die Intlyst-App: Erkennt automatisch die größte Wachstumschance,
    priorisiert Maßnahmen nach Wirkung, erstellt klare Handlungsschritte und zeigt den Umsatz-Impact.
    """
    def __init__(self, data: Dict[str, Any]):
        self.data = data
        self.created_at = datetime.datetime.now()
        self.opportunities = self.analyze_opportunities()
        self.prioritized = self.prioritize_opportunities()
        self.selected = self.prioritized[0] if self.prioritized else None
        self.tasks = self.create_action_steps(self.selected) if self.selected else []
        self.progress = 0.0

    def analyze_opportunities(self) -> List[Dict[str, Any]]:
        """
        Analysiert die Daten und findet alle relevanten Wachstumschancen mit Impact-Schätzung.
        Erstellt je nach Veränderung automatisch die passende Strategie.
        """
        opportunities = []
        # Umsatz fällt → Strategie zur Umsatzstabilisierung
        if self.data.get('revenue_drop', False):
            opportunities.append({
                "name": "Umsatz-Stabilisierung",
                "impact": 0.9,
                "expected_revenue": "+15% in 4 Wochen",
                "description": "Sofortmaßnahmen zur Rückgewinnung von Umsatz: Retargeting, Reaktivierung, Angebotskampagnen."
            })
        # Wachstum kommt → Skalierungsstrategie
        if self.data.get('growth', False):
            opportunities.append({
                "name": "Skalierungsstrategie",
                "impact": 0.85,
                "expected_revenue": "+20% in 8 Wochen",
                "description": "Wachstum beschleunigen: Neue Kanäle, Budget erhöhen, Prozesse automatisieren."
            })
        # Traffic steigt → Conversion-Optimierung
        if self.data.get('traffic_increase', False):
            opportunities.append({
                "name": "Conversion-Optimierung",
                "impact": 0.8,
                "expected_revenue": "+12% in 6 Wochen",
                "description": "Mehr Besucher in Kunden verwandeln: Funnel-Tests, Landingpage-Optimierung, A/B-Tests."
            })
        # Weitere klassische Chancen
        if self.data.get('low_conversion', False):
            opportunities.append({
                "name": "Onboarding-Funnel optimieren",
                "impact": 0.7,
                "expected_revenue": "+10% in 6 Wochen",
                "description": "Conversion-Rate im Onboarding-Prozess steigern."
            })
        if self.data.get('high_churn', False):
            opportunities.append({
                "name": "Churn-Reduktion",
                "impact": 0.6,
                "expected_revenue": "+8% in 8 Wochen",
                "description": "Abwanderung durch bessere Bindung senken."
            })
        # Fallback
        if not opportunities:
            opportunities.append({
                "name": "Upselling an Bestandskunden",
                "impact": 0.5,
                "expected_revenue": "+5% in 4 Wochen",
                "description": "Mehrwert-Angebote für bestehende Kunden."
            })
        return opportunities

    def prioritize_opportunities(self) -> List[Dict[str, Any]]:
        """
        Sortiert Chancen nach Impact (Wirkung auf Umsatz).
        """
        return sorted(self.opportunities, key=lambda x: x["impact"], reverse=True)

    def create_action_steps(self, opportunity: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Erstellt klare Handlungsschritte für die gewählte Chance, inkl. Zeitaufwand und Wirkung.
        """
        steps = []
        if opportunity["name"] == "Umsatz-Stabilisierung":
            steps = [
                {"title": "Analysiere Umsatzrückgang", "impact": "High", "expected_revenue": "+5%", "time_required": "1h", "status": "not-started"},
                {"title": "Starte Retargeting-Kampagne", "impact": "High", "expected_revenue": "+6%", "time_required": "2h", "status": "not-started"},
                {"title": "Sonderangebot für Bestandskunden", "impact": "Medium", "expected_revenue": "+4%", "time_required": "1h", "status": "not-started"}
            ]
        elif opportunity["name"] == "Skalierungsstrategie":
            steps = [
                {"title": "Identifiziere skalierbare Kanäle", "impact": "High", "expected_revenue": "+8%", "time_required": "1h", "status": "not-started"},
                {"title": "Budget für Top-Kanäle erhöhen", "impact": "High", "expected_revenue": "+7%", "time_required": "1h", "status": "not-started"},
                {"title": "Automatisierung einführen", "impact": "Medium", "expected_revenue": "+5%", "time_required": "2h", "status": "not-started"}
            ]
        elif opportunity["name"] == "Conversion-Optimierung":
            steps = [
                {"title": "Analysiere Traffic-Quellen", "impact": "High", "expected_revenue": "+4%", "time_required": "1h", "status": "not-started"},
                {"title": "Optimiere Landingpage", "impact": "High", "expected_revenue": "+5%", "time_required": "2h", "status": "not-started"},
                {"title": "Starte A/B-Test", "impact": "Medium", "expected_revenue": "+3%", "time_required": "1h", "status": "not-started"}
            ]
        elif opportunity["name"] == "Onboarding-Funnel optimieren":
            steps = [
                {"title": "Analysiere Drop-Offs", "impact": "High", "expected_revenue": "+4%", "time_required": "1h", "status": "not-started"},
                {"title": "Teste neue Onboarding-Variante", "impact": "Medium", "expected_revenue": "+3%", "time_required": "2h", "status": "not-started"},
                {"title": "Implementiere Verbesserungen", "impact": "High", "expected_revenue": "+3%", "time_required": "2h", "status": "not-started"}
            ]
        elif opportunity["name"] == "Churn-Reduktion":
            steps = [
                {"title": "Identifiziere Churn-Gründe", "impact": "High", "expected_revenue": "+3%", "time_required": "1h", "status": "not-started"},
                {"title": "Starte Bindungs-Kampagne", "impact": "Medium", "expected_revenue": "+3%", "time_required": "1.5h", "status": "not-started"},
                {"title": "Führe Feedback-Umfrage durch", "impact": "Low", "expected_revenue": "+2%", "time_required": "1h", "status": "not-started"}
            ]
        else:
            steps = [
                {"title": "Identifiziere Upsell-Potenziale", "impact": "Medium", "expected_revenue": "+2%", "time_required": "1h", "status": "not-started"},
                {"title": "Erstelle Upsell-Angebot", "impact": "Medium", "expected_revenue": "+2%", "time_required": "1.5h", "status": "not-started"},
                {"title": "Kommuniziere Angebot", "impact": "Low", "expected_revenue": "+1%", "time_required": "0.5h", "status": "not-started"}
            ]
        return steps

    def forecast_revenue_impact(self, action_steps: List[Dict[str, Any]], days: int = 30) -> float:
        """
        Prognostiziert den Umsatz-Impact der Maßnahmen für die nächsten X Tage.
        Dummy-Logik: Addiert erwartete Einzel-Impacts, gewichtet nach Zeitraum.
        """
        impact_sum = 0.0
        for step in action_steps:
            try:
                percent = float(step["expected_revenue"].replace("+", "").replace("%", ""))
            except Exception:
                percent = 0.0
            # Gewichtung: 30 Tage = voller Wert, 60 = 0.7, 90 = 0.5
            if days <= 30:
                weight = 1.0
            elif days <= 60:
                weight = 0.7
            else:
                weight = 0.5
            impact_sum += percent * weight
        return round(impact_sum, 2)

    def calculate_roi(self, action_steps: List[Dict[str, Any]], cost_estimate: float) -> float:
        """
        Berechnet den ROI der Maßnahmen vor Umsetzung.
        Dummy-Logik: Umsatzwirkung (in EUR) / Kosten.
        """
        revenue_per_percent = 1000
        total_impact = sum([
            float(step["expected_revenue"].replace("+", "").replace("%", ""))
            for step in action_steps
            if "expected_revenue" in step
        ])
        revenue_gain = total_impact * revenue_per_percent
        if cost_estimate == 0:
            return float('inf')
        return round((revenue_gain - cost_estimate) / cost_estimate, 2)

    def learn_from_past_actions(self, past_actions: List[Dict[str, Any]]):
        """
        Analysiert vergangene Aktionen und passt Prognosen an (Dummy: erhöht Impact, wenn Maßnahmen erfolgreich waren).
        """
        for action in past_actions:
            if action.get("success", False):
                for step in self.tasks:
                    if action["title"].lower() in step["title"].lower():
                        try:
                            percent = float(step["expected_revenue"].replace("+", "").replace("%", ""))
                            percent = min(percent * 1.1, 100)
                            step["expected_revenue"] = f"+{round(percent,1)}%"
                        except Exception:
                            pass

    def scenario_analysis(self, scenario: str) -> Dict[str, Any]:
        """
        Analysiert ein Szenario (z.B. Budget +20%) und gibt Prognose für Umsatz, Kosten, Kundenbindung.
        """
        result = {}
        if "budget" in scenario and "+20%" in scenario:
            modified_tasks = []
            for step in self.tasks:
                try:
                    percent = float(step["expected_revenue"].replace("+", "").replace("%", ""))
                    percent = round(percent * 1.2, 2)
                    new_step = step.copy()
                    new_step["expected_revenue"] = f"+{percent}%"
                    modified_tasks.append(new_step)
                except Exception:
                    modified_tasks.append(step)
            result["modified_tasks"] = modified_tasks
            result["forecast_30"] = self.forecast_revenue_impact(modified_tasks, 30)
            result["forecast_60"] = self.forecast_revenue_impact(modified_tasks, 60)
            result["forecast_90"] = self.forecast_revenue_impact(modified_tasks, 90)
        else:
            result["info"] = "Szenario nicht implementiert."
        return result

    def top_strategies(self, goal: str = "growth") -> List[Dict[str, Any]]:
        """
        Gibt die Top 3 Strategien für Wachstum, Kostenreduktion oder Kundenbindung zurück.
        """
        if goal == "growth":
            return self.prioritized[:3]
        elif goal == "cost":
            return sorted(self.opportunities, key=lambda x: x.get("impact", 0)/2, reverse=True)[:3]
        elif goal == "retention":
            return [s for s in self.opportunities if "bindung" in s["description"].lower() or "churn" in s["name"].lower()][:3]
        else:
            return self.prioritized[:3]

    def assign_responsibilities(self, action_steps: List[Dict[str, Any]], team: List[str]) -> List[Dict[str, Any]]:
        """
        Verknüpft Aufgaben mit Verantwortlichen (rundlaufend verteilt).
        """
        assigned = []
        for idx, step in enumerate(action_steps):
            responsible = team[idx % len(team)] if team else "Unassigned"
            new_step = step.copy()
            new_step["responsible"] = responsible
            assigned.append(new_step)
        return assigned

    def preview(self) -> Dict[str, Any]:
        """
        Gibt die Top-Wachstumschance, priorisierte Maßnahmen, Handlungsschritte und Umsatzwirkung zurück.
        """
        return {
            "top_opportunity": self.selected,
            "prioritized_opportunities": self.prioritized,
            "action_steps": self.tasks,
            "progress": self.progress
        }

    def activate(self):
        """
        Setzt alle Tasks auf 'in-progress' und startet Fortschrittsmessung.
        """
        for task in self.tasks:
            task["status"] = "in-progress"
        self.progress = 0.1

    def update_progress(self, value: float):
        self.progress = min(max(value, 0.0), 1.0)
