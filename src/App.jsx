/* eslint-disable */
// @ts-nocheck
import { useState, useEffect, Component, lazy, Suspense } from "react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", background: "#fff", minHeight: "100vh" }}>
          <h2 style={{ color: "#e00" }}>App Fehler</h2>
          <pre style={{ color: "#333", whiteSpace: "pre-wrap", fontSize: 13 }}>{this.state.error?.message}{"\n\n"}{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import TopNav from "./components/layout/TopNav";
import BottomTabBar from "./components/layout/BottomTabBar";
import ChatPanel from "./components/ChatPanel";
import ProductTour from "./components/onboarding/ProductTour";
import { useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { PlanProvider } from "./contexts/PlanContext";
import { CompanyProfileProvider } from "./contexts/CompanyProfileContext";
const Login = lazy(() => import("./pages/Login"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analyse = lazy(() => import("./pages/Analyse"));
const Wachstum = lazy(() => import("./pages/Wachstum"));
const Kunden = lazy(() => import("./pages/Kunden"));
const Standort = lazy(() => import("./pages/Standort"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Settings = lazy(() => import("./pages/Settings"));
const Market = lazy(() => import("./pages/Market"));
const Mehr = lazy(() => import("./pages/Mehr"));
const ReportsHub = lazy(() => import("./pages/ReportsHub"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Ceo = lazy(() => import("./pages/Ceo"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
const ReviewAudit = lazy(() => import("./pages/ReviewAudit"));
const Social = lazy(() => import("./pages/Social"));
const Planner = lazy(() => import("./pages/Planner"));
const TeamCenter = lazy(() => import("./pages/TeamCenter"));
const Szenarien = lazy(() => import("./pages/Szenarien"));
const Forecast  = lazy(() => import("./pages/Forecast"));

// ── Loader ────────────────────────────────────────────────────────────────────
function Gear({ size, duration, direction = 1, style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        animation: `gear-spin ${duration}s linear infinite`,
        animationDirection: direction === -1 ? "reverse" : "normal",
        ...style,
      }}
    >
      <path
        fill="#000000"
        d="M43.3 5.2l-2.6 9.7a36.2 36.2 0 0 0-8.5 3.5l-9-5.2-9.2 9.2 5.2 9a36.2 36.2 0 0 0-3.5 8.5l-9.7 2.6v13l9.7 2.6a36.2 36.2 0 0 0 3.5 8.5l-5.2 9 9.2 9.2 9-5.2a36.2 36.2 0 0 0 8.5 3.5l2.6 9.7h13l2.6-9.7a36.2 36.2 0 0 0 8.5-3.5l9 5.2 9.2-9.2-5.2-9a36.2 36.2 0 0 0 3.5-8.5l9.7-2.6v-13l-9.7-2.6a36.2 36.2 0 0 0-3.5-8.5l5.2-9-9.2-9.2-9 5.2a36.2 36.2 0 0 0-8.5-3.5l-2.6-9.7h-13zM50 33a17 17 0 1 1 0 34 17 17 0 0 1 0-34z"
      />
      <circle cx="50" cy="50" r="10" fill="#ffffff" />
    </svg>
  );
}

function FullScreenLoader() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#ffffff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
    }}>
      <style>{`
        @keyframes gear-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Gear size={64} duration={2.4} direction={1} />
        <Gear size={44} duration={1.6} direction={-1} style={{ marginTop: 20 }} />
        <Gear size={56} duration={2.0} direction={1} style={{ marginTop: -8 }} />
      </div>

      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: "#86868b",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}>
        INTLYST lädt...
      </div>
    </div>
  );
}

// ── Route Guards ──────────────────────────────────────────────────────────────
function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function PublicLoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to={user.onboarding_done ? (localStorage.getItem("intlyst-start-page") || "/") : "/onboarding"} replace />;
  return <Login />;
}

function OnboardingRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboarding_done) return <Navigate to="/" replace />;
  return <Onboarding />;
}

function OnboardedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.onboarding_done) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

// ── Plan Gate — zeigt Upgrade-Screen für gesperrte Routen ─────────────────────
import { usePlan } from "./contexts/PlanContext";
import { useLocation as _useLocation } from "react-router-dom";

function PlanGate({ children }) {
  const { canAccess, plan, loading } = usePlan();
  const location = _useLocation();
  if (loading) return null;
  if (canAccess(location.pathname)) return children;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60dvh", padding: "var(--s-8)", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: "var(--s-4)" }}>🔒</div>
      <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: "var(--c-text)", marginBottom: "var(--s-2)" }}>Upgrade erforderlich</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-3)", maxWidth: 320, marginBottom: "var(--s-6)" }}>
        Diese Funktion ist in deinem aktuellen Plan (<strong>{plan}</strong>) nicht verfügbar.
        Wechsle dein Abonnement um Zugriff zu erhalten.
      </div>
      <a href="/settings" style={{ padding: "10px 24px", background: "#000", color: "#fff", borderRadius: "var(--r-md)", fontWeight: 600, fontSize: "var(--text-sm)", textDecoration: "none" }}>
        Zu den Abonnements →
      </a>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);
  const [tourEnabled, setTourEnabled] = useState(false);

  useEffect(() => {
    const enableTours = localStorage.getItem("intlyst_enable_tours") === "1";
    const forced = new URLSearchParams(location.search).get("tour") === "1";
    setTourEnabled(enableTours || forced);
  }, [location.search]);

  return (
    <div className="app-shell">
      <TopNav onAiClick={() => setChatOpen(true)} />
      <main key={location.pathname} className="page-enter">
        <PlanGate><Outlet /></PlanGate>
      </main>
      <BottomTabBar />
      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      {tourEnabled && <ProductTour onComplete={() => setTourEnabled(false)} />}
    </div>
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"      element={<PublicLoginRoute />} />
      <Route path="/onboarding" element={<OnboardingRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<OnboardedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/analyse"   element={<Analyse />} />
            <Route path="/wachstum"  element={<Wachstum />} />
            <Route path="/kunden"    element={<Kunden />} />
            <Route path="/standort"  element={<Standort />} />
            <Route path="/tasks"     element={<Tasks />} />
            <Route path="/alerts"    element={<Alerts />} />
            <Route path="/reports"   element={<ReportsHub />} />
            <Route path="/settings"  element={<Settings />} />
            <Route path="/market"    element={<Market />} />
            <Route path="/mehr"         element={<Mehr />} />
            <Route path="/planner"      element={<Planner />} />
            <Route path="/team"         element={<TeamCenter />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/social"      element={<Social />} />
            <Route path="/command"     element={<CommandCenter />} />
            <Route path="/ceo"         element={<Ceo />} />
            <Route path="/review-audit" element={<ReviewAudit />} />
            <Route path="/szenarien"   element={<Szenarien />} />
            <Route path="/forecast"    element={<Forecast />} />

            {/* Legacy redirects */}
            <Route path="/insights"        element={<Navigate to="/analyse" replace />} />
            <Route path="/recommendations" element={<Navigate to="/analyse" replace />} />
            <Route path="/growth"          element={<Navigate to="/wachstum" replace />} />
            <Route path="/customers"       element={<Navigate to="/kunden" replace />} />
            <Route path="/location"        element={<Navigate to="/standort" replace />} />
            <Route path="/benchmark"       element={<Navigate to="/analyse" replace />} />
            <Route path="/ga4"             element={<Navigate to="/settings" replace />} />
            <Route path="/data"            element={<Navigate to="/settings" replace />} />
            <Route path="/pricing"         element={<Navigate to="/settings" replace />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ThemeProvider>
        <CompanyProfileProvider>
          <LanguageProvider>
            <ToastProvider>
              <PlanProvider>
                <Suspense fallback={<FullScreenLoader />}>
                  <AppRoutes />
                </Suspense>
              </PlanProvider>
            </ToastProvider>
          </LanguageProvider>
        </CompanyProfileProvider>
      </ThemeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
