import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AuthContext } from "./auth-context";
import { authSession } from "./session/session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(authSession.subscribe, authSession.getSnapshot);

  useEffect(() => {
    void authSession.restore();
  }, []);

  return (
    <AuthContext value={{ ...state, login: authSession.login, logout: authSession.logout, hasPermission: authSession.hasPermission }}>
      {children}
    </AuthContext>
  );
}
