import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock lazy-loaded pages to avoid chunking in tests
vi.mock("../pages/Login", () => ({ default: () => <div>login-page</div> }));
vi.mock("../pages/Dashboard", () => ({ default: () => <div>dashboard-page</div> }));
vi.mock("../pages/Onboarding", () => ({ default: () => <div>onboarding-page</div> }));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }) => children,
}));
vi.mock("../contexts/ToastContext", () => ({
  ToastProvider: ({ children }) => children,
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock("../contexts/LanguageContext", () => ({
  LanguageProvider: ({ children }) => children,
  useLanguage: () => ({ language: "de", setLanguage: vi.fn() }),
}));

import { useAuth } from "../contexts/AuthContext";
import App from "../App";

describe("App routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated user to /login", async () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText("login-page")).toBeInTheDocument();
    });
  });

  it("shows loader while auth is loading", () => {
    useAuth.mockReturnValue({ user: null, loading: true });
    render(<App />);
    expect(screen.getByText(/INTLYST lädt/i)).toBeInTheDocument();
  });

  it("redirects authenticated+onboarded user to /", async () => {
    useAuth.mockReturnValue({
      user: { email: "x@y.com", onboarding_done: true },
      loading: false,
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText("dashboard-page")).toBeInTheDocument();
    });
  });

  it("redirects authenticated user without onboarding to /onboarding", async () => {
    useAuth.mockReturnValue({
      user: { email: "x@y.com", onboarding_done: false },
      loading: false,
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.queryByText("onboarding-page")).toBeInTheDocument();
    });
  });
});
