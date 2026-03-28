import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("biz_token") || "");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    Number(localStorage.getItem("biz_workspace_id") || 0) || null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (data) {
            setUser(data);
            if (data.active_workspace_id) {
              setActiveWorkspaceId(Number(data.active_workspace_id));
              localStorage.setItem("biz_workspace_id", String(data.active_workspace_id));
            }
          } else {
            setToken("");
            localStorage.removeItem("biz_token");
          }
        })
        .catch(() => {
          setToken("");
          localStorage.removeItem("biz_token");
        })
        .finally(() => {
          clearTimeout(timeoutId);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  function login(tokenStr, userData) {
    setToken(tokenStr);
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
    setActiveWorkspaceId(null);
    localStorage.removeItem("biz_workspace_id");
  }

  function authHeader() {
    if (!token) return {};
    const headers = { Authorization: `Bearer ${token}` };
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

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        authHeader,
        activeWorkspaceId,
        setActiveWorkspace,
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