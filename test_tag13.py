from pathlib import Path


ROOT = Path(__file__).resolve().parent


def check(condition: bool, label: str) -> bool:
    status = "[OK]" if condition else "[FAIL]"
    print(f"{status}  {label}")
    return condition


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    print("\n" + "-" * 50)
    print("  Tag 13 Check")
    print("-" * 50)

    checks = []

    env_path = ROOT / ".env"
    router_path = ROOT / "routers" / "ai.py"
    main_path = ROOT / "main.py"
    req_path = ROOT / "requirements.txt"
    insights_component = ROOT / "src" / "components" / "AiInsights.jsx"
    recommendations_component = ROOT / "src" / "components" / "AiRecommendations.jsx"
    recommendations_impl = ROOT / "src" / "components" / "ai" / "AiRecommendations.jsx"
    chat_widget_component = ROOT / "src" / "components" / "ChatWidget.jsx"
    insights_page = ROOT / "src" / "pages" / "Insights.jsx"
    dashboard_page = ROOT / "src" / "pages" / "Dashboard.jsx"
    app_page = ROOT / "src" / "App.jsx"
    ai_routes_path = ROOT / "api" / "ai_routes.py"

    checks.append(check(env_path.exists(), ".env vorhanden"))
    if env_path.exists():
        checks.append(check("ANTHROPIC_API_KEY=dein-key" in read(env_path), ".env enthaelt ANTHROPIC_API_KEY Platzhalter"))

    checks.append(check(router_path.exists(), "routers/ai.py vorhanden"))
    if router_path.exists():
        checks.append(check('from api.ai_routes import router' in read(router_path), "routers/ai.py exportiert AI router"))

    checks.append(check(main_path.exists(), "main.py vorhanden"))
    if main_path.exists():
        main_text = read(main_path)
        checks.append(check('from dotenv import load_dotenv' in main_text, "main.py laedt dotenv"))
        checks.append(check('app.include_router(ai.router)' in main_text, "main.py bindet AI router ein"))
        checks.append(check('version="0.13.0"' in main_text or 'version = "0.13.0"' in main_text, "main.py Version 0.13.0"))

    checks.append(check(req_path.exists(), "requirements.txt vorhanden"))
    if req_path.exists():
        req_text = read(req_path)
        checks.append(check('httpx' in req_text, "requirements enthaelt httpx"))
        checks.append(check('python-dotenv' in req_text, "requirements enthaelt python-dotenv"))

    checks.append(check(insights_component.exists(), "components/AiInsights.jsx vorhanden"))
    checks.append(check(recommendations_component.exists(), "components/AiRecommendations.jsx vorhanden"))
    checks.append(check(chat_widget_component.exists(), "components/ChatWidget.jsx vorhanden"))
    if recommendations_impl.exists():
        recommendations_text = read(recommendations_impl)
        checks.append(check("const FILTERS =" in recommendations_text, "AiRecommendations hat Priority-Filter"))

    checks.append(check(ai_routes_path.exists(), "api/ai_routes.py vorhanden"))
    if ai_routes_path.exists():
        ai_routes_text = read(ai_routes_path)
        checks.append(check('@router.get("/status"' in ai_routes_text, "AI Status-Endpunkt vorhanden"))
        checks.append(check('ANTHROPIC_API_KEY ist noch ein Platzhalter.' in ai_routes_text, "AI erkennt Platzhalter-Key"))

    checks.append(check(insights_page.exists(), "pages/Insights.jsx vorhanden"))
    if insights_page.exists():
        insights_text = read(insights_page)
        checks.append(check('import AiInsights from "../components/AiInsights";' in insights_text, "Insights.jsx nutzt gewuenschten AiInsights Importpfad"))

    checks.append(check(dashboard_page.exists(), "pages/Dashboard.jsx vorhanden"))
    if dashboard_page.exists():
        dashboard_text = read(dashboard_page)
        checks.append(check('fetch("/api/ai/chat"' in dashboard_text, "Dashboard-Chat ruft AI-Endpunkt auf"))
        checks.append(check('const [chatReply, setChatReply]' in dashboard_text, "Dashboard zeigt KI-Antwort an"))

    checks.append(check(app_page.exists(), "App.jsx vorhanden"))
    if app_page.exists():
        app_text = read(app_page)
        checks.append(check('import ChatWidget from "./components/ChatWidget";' in app_text, "App.jsx nutzt gewuenschten ChatWidget Importpfad"))
        checks.append(check('<ChatWidget />' in app_text, "App.jsx rendert ChatWidget global"))

    passed = sum(1 for item in checks if item)
    total = len(checks)

    print("\n" + "=" * 50)
    print(f"  Ergebnis: {passed}/{total} Checks bestanden")
    print("=" * 50)

    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())