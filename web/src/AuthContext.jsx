import { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as api from "./api.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.fetchMe();
      setUser(user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (fields) => {
    const { user } = await api.login(fields);
    setUser(user);
    return user;
  }, []);

  const signup = useCallback(async (fields) => {
    const { user } = await api.signup(fields);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
  }, []);

  // The role has ridden on publicUser since auth landed (server/src/auth/store.js stamps it and
  // keeps it in step with the ADMIN_EMAILS allowlist); the admin template screens are its first
  // reader. Derived here rather than compared in three screens so there is ONE spelling of
  // "admin" in the client.
  //
  // THIS VALUE DECIDES WHAT IS SHOWN, NEVER WHAT IS ALLOWED. Every admin route is behind
  // requireAdmin on the server. A user who flips this in a devtools console sees the screens
  // and gets a 403 from every call they make.
  const isAdmin = user?.role === "admin";

  return (
    <AuthCtx.Provider value={{ user, isAdmin, loading, login, signup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
