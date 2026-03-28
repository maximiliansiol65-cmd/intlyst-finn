"""
API-Routen für die Multi-Level Automatisierungs-Engine
- Vorschläge abrufen (Level 1)
- 1-Klick-Umsetzung (Level 2)
- Vollautonom starten (Level 3)
"""

from fastapi import APIRouter, Depends, HTTPException
from analytics.automation_engine import AutomationEngine
# Platzhalter für echte Provider und UserSettings

router = APIRouter()


from fastapi import Request
from fastapi import Depends

def get_deps(request: Request):
    # Wird von main.py als Dependency bereitgestellt
    return getattr(request, "state", {})


@router.get("/automation/suggest")
def get_automation_suggestions(deps=Depends(get_deps)):
    """Level 1: Maßnahmenvorschläge abrufen"""
    engine = AutomationEngine(
        deps["user_settings"],
        deps["kpi_provider"],
        deps["project_status_provider"],
        deps["external_data_provider"]
    )
    result = engine.run()
    return result


@router.post("/automation/execute")
def execute_automation(deps=Depends(get_deps)):
    """Level 2: 1-Klick-Umsetzung ausführen"""
    deps["user_settings"].set_automation_level(2)
    engine = AutomationEngine(
        deps["user_settings"],
        deps["kpi_provider"],
        deps["project_status_provider"],
        deps["external_data_provider"]
    )
    result = engine.run()
    return result


@router.post("/automation/autonomous")
def run_autonomous_automation(deps=Depends(get_deps)):
    """Level 3: Vollautonom starten"""
    deps["user_settings"].set_automation_level(3)
    engine = AutomationEngine(
        deps["user_settings"],
        deps["kpi_provider"],
        deps["project_status_provider"],
        deps["external_data_provider"]
    )
    result = engine.run()
    return result

# Integration in main.py oder FastAPI-Setup nicht vergessen!