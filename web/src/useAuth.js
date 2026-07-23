import { createContext, useContext } from "react";

// Context + hook live apart from the provider component so files exporting
// components stay fast-refresh friendly (react-refresh/only-export-components).
export const AuthCtx = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
