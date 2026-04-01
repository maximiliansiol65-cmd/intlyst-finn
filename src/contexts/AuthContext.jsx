import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("biz_token") || "");
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem("biz_refresh_token") || "");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    Number(localStorage.getItem("biz_workspace_id") || 0) || null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!token) {
        setLoading(false);
        return;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (!alive) return;
          setUser(data);
          if (data.active_workspace_id) {
            setActiveWorkspaceId(Number(data.active_workspace_id));
            localStorage.setItem("biz_workspace_id", String(data.active_workspace_id));
          }
        } else {
          const refreshed = await refreshSessionInternal();
          if (!refreshed && alive) {
            setToken("");
            setRefreshToken("");
            setUser(null);
            localStorage.removeItem("biz_token");
            localStorage.removeItem("biz_refresh_token");
          }
        }
      } catch {
        const refreshed = await refreshSessionInternal();
        if (!refreshed && alive) {
          setToken("");
          setRefreshToken("");
          setUser(null);
          localStorage.removeItem("biz_token");
          localStorage.removeItem("biz_refresh_token");
        }
      } finally {
        clearTimeout(timeoutId);
        if (alive) setLoading(false);
      }
    }
    boot();
    return () => { alive = false; };
  }, []);

  function login(tokenStr, userData, refreshTokenStr) {
    setToken(tokenStr);
    if (refreshTokenStr) {
      setRefreshToken(refreshTokenStr);
      localStorage.setItem("biz_refresh_token", refreshTokenStr);
    }
    setUser(userData);
    localStorage.setItem("biz_token", tokenStr);
    if (userData?.active_workspace_id) {
      const ws = Number(userData.active_workspace_id);
      setActiveWorkspaceId(ws);
      localStorage.setItem("biz_workspace_id", String(ws));
    }
  }

  function logout() {
    setToken("");
    setUser(null);
    localStorage.removeItem("biz_token");
    setRefreshToken("");
    localStorage.removeItem("biz_refresh_token");
    setActiveWorkspaceId(null);
    localStorage.removeItem("biz_workspace_id");
  }

  function authHeader() {
    const stored = token || localStorage.getItem("biz_token") || "";
    if (!stored) return {};
    const headers = { Authorization: `Bearer ${stored}` };
    if (activeWorkspaceId) {
      headers["X-Workspace-ID"] = String(activeWorkspaceId);
    }
    return headers;
  }

  function setActiveWorkspace(workspaceId) {
    const ws = Number(workspaceId) || null;
    setActiveWorkspaceId(ws);
    if (ws) {
      localStorage.setItem("biz_workspace_id", String(ws));
    } else {
      localStorage.removeItem("biz_workspace_id");
    }
  }

  async function refreshSessionInternal() {
    if (!refreshToken) return false;
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.access_token) return false;
      setToken(data.access_token);
      localStorage.setItem("biz_token", data.access_token);
      if (data.refresh_token) {
        setRefreshToken(data.refresh_token);
        localStorage.setItem("biz_refresh_token", data.refresh_token);
      }
      setUser({
        id: data.user_id,
        email: data.email,
        name: data.name,
        onboarding_done: data.onboarding_done,
        active_workspace_id: data.active_workspace_id,
        role: data.role,
      });
      if (data.active_workspace_id) {
        setActiveWorkspaceId(Number(data.active_workspace_id));
        localStorage.setItem("biz_workspace_id", String(data.active_workspace_id));
      }
      return true;
    } catch {
      return false;
    }
  }

  async function refreshSession() {
    return refreshSessionInternal();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        refreshToken,
        loading,
        login,
        logout,
        authHeader,
        activeWorkspaceId,
        setActiveWorkspace,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden.");
  }
  return ctx;
}
