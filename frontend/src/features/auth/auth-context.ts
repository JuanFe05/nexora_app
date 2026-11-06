import { createContext } from "react";
import type { AuthState, LoginInput } from "./types";

export type AuthContextValue = AuthState & {
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  reloadPrincipal: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
