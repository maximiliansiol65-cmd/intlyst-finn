import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

function AuthConsumer() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  if (!user) return <div>not-logged-in</div>;
  return <div>logged-in:{user.email}</div>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("shows loading state initially", () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    localStorage.setItem("biz_token", "sometoken");
    render(<AuthProvider><AuthConsumer /></AuthProvider>);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("shows not-logged-in when no token in localStorage", async () => {
    render(<AuthProvider><AuthConsumer /></AuthProvider>);
    await waitFor(() => {
      expect(screen.getByText("not-logged-in")).toBeInTheDocument();
    });
  });

  it("shows not-logged-in when /api/auth/me returns 401", async () => {
    localStorage.setItem("biz_token", "expired_token");
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => null });
    render(<AuthProvider><AuthConsumer /></AuthProvider>);
    await waitFor(() => {
      expect(screen.getByText("not-logged-in")).toBeInTheDocument();
    });
    expect(localStorage.getItem("biz_token")).toBeNull();
  });

  it("shows logged-in when /api/auth/me returns user", async () => {
    localStorage.setItem("biz_token", "valid_token");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ email: "user@test.com", active_workspace_id: 1 }),
    });
    render(<AuthProvider><AuthConsumer /></AuthProvider>);
    await waitFor(() => {
      expect(screen.getByText("logged-in:user@test.com")).toBeInTheDocument();
    });
  });
});
