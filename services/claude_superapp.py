import os
import json
from typing import Any, Dict
from api.ai_routes import call_claude

async def run_claude_superapp(input_data: Dict[str, Any], api_key: str = None) -> Dict[str, Any]:
    """
    Führt die komplette Business-Analyse und Steuerung für kleine Unternehmen mit Claude durch.
    Die logische Reihenfolge entspricht der Vorgabe:
    1. Veränderungs-Erkennung
    2. Ursachenanalyse
    3. Handlungsempfehlungen & Priorisierung
    4. Bestätigungssystem
    5. 1-Klick Umsetzung / Automatisierung
    6. Alerts & Proaktive Hinweise
    7. Sicherheits- & Rollensteuerung
    """
    system_prompt = (
        "Du bist ein KI-Business-Controller für kleine Unternehmen. Analysiere die folgenden Input-Daten (KPIs, Finanzen, Traffic, Social Media, Kunden, Marketing, Teamrollen) und folge exakt dieser logischen Reihenfolge:\n"
        "1️⃣ Veränderungs-Erkennung: Alle Veränderungen erkennen, Trends/Abweichungen identifizieren, Zusammenfassung für CEO.\n"
        "2️⃣ Ursachenanalyse: Ursachen der Veränderung (intern/extern), Alternativen prüfen, tiefgründige Analyse je KPI.\n"
        "3️⃣ Handlungsempfehlungen & Priorisierung: Konkrete Vorschläge, Priorisierung (High/Medium/Low), Aufgaben formulieren, Effekte prognostizieren.\n"
        "4️⃣ Bestätigungssystem: Empfehlungen so vorbereiten, dass CEO/Nutzer mit 1 Klick bestätigt.\n"
        "5️⃣ 1-Klick Umsetzung / Automatisierung: Aufgaben erstellen, Team zuweisen, Social/Content/Emails/Reports vorbereiten, alles nach Bestätigung ausführen.\n"
        "6️⃣ Alerts & Proaktive Hinweise: Warnungen bei kritischen Veränderungen, Chancen/Risiken, Alerts für Dashboard/Push/Email.\n"
        "7️⃣ Sicherheits- & Rollensteuerung: Datenzugriff nach Rolle, Aktionen nur nach Einverständnis, sensible Daten verschlüsseln.\n"
        "Formuliere alle Analysen, Empfehlungen und Alerts in einfacher, klarer Sprache. Vermeide Fachbegriffe, erkläre Ursachen und Handlungsschritte so, dass jeder Mitarbeiter sie sofort versteht. Gib Beispiele, wenn nötig, und zeige mögliche Ergebnisse oder Effekte jeder Maßnahme.\n"
        "⚡ Gib die komplette Ausgabe als eine strukturierte JSON-Datei zurück mit den Feldern: 'veraenderungen', 'ursachen', 'empfehlungen', 'prioritaet', 'aufgaben', 'alerts', 'vorbereitete_aktionen', 'security'. Keine Floskeln, nur JSON!"
    )
    user_prompt = f"Input-Daten:\n{json.dumps(input_data, ensure_ascii=False, indent=2)}"
    raw = await call_claude(system_prompt, user_prompt, max_tokens=3000)
    try:
        result = json.loads(raw)
    except Exception:
        result = {"error": "Claude-Antwort konnte nicht als JSON geparst werden", "raw": raw}
    return result
