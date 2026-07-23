import { useState, useEffect, useCallback } from "react";
import * as api from "./api.js";
import { AuthCtx } from "./useAuth.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    () =>
      api
        .fetchMe()
        .then(({ user }) => setUser(user || null))
        .catch(() => setUser(null))
        .finally(() => setLoading(false)),
    []
  );

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

  return (
    <AuthCtx.Provider value={{ user, loading, login, signup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}
