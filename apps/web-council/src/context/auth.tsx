import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { parseJwt } from "../lib/jwt.js";
import type { JwtClaims } from "../lib/jwt.js";
import { apiLogin, apiLogout, apiMfaChallenge, apiRefresh } from "../api/auth.js";

const TENANT_SLUG =
  (import.meta.env["VITE_TENANT_SLUG"] as string | undefined) ?? "ndebele";
const LS_KEY = "l2l_auth";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthState {
  accessToken: string;
  refreshToken: string;
  claims: JwtClaims;
}

interface AuthContextValue {
  auth: AuthState | null;
  tenantSlug: string;
  login: (email: string, password: string) => Promise<{ challengeToken: string } | null>;
  loginWithTokens: (accessToken: string, refreshToken: string) => void;
  completeMfa: (challengeToken: string, code: string) => Promise<void>;
  logout: () => void;
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStorage(): AuthState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredTokens;
    const claims = parseJwt(stored.accessToken);
    if (claims.exp * 1000 < Date.now()) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return { ...stored, claims };
  } catch {
    return null;
  }
}

function writeStorage(tokens: StoredTokens | null): void {
  if (tokens) {
    localStorage.setItem(LS_KEY, JSON.stringify(tokens));
  } else {
    localStorage.removeItem(LS_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(readStorage);
  const authRef = useRef(auth);
  authRef.current = auth;
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (refreshTimer.current !== null) clearTimeout(refreshTimer.current);
  }

  const logout = useCallback(() => {
    clearTimer();
    const token = authRef.current?.refreshToken;
    if (token) void apiLogout(token);
    setAuth(null);
    writeStorage(null);
  }, []);

  const setTokens = useCallback((tokens: StoredTokens) => {
    const claims = parseJwt(tokens.accessToken);
    setAuth({ ...tokens, claims });
    writeStorage(tokens);
  }, []);

  // Re-schedule silent refresh timer whenever auth changes.
  useEffect(() => {
    if (!auth) return;
    clearTimer();
    const msUntilRefresh = auth.claims.exp * 1000 - Date.now() - 60_000;
    if (msUntilRefresh > 0) {
      refreshTimer.current = setTimeout(() => {
        apiRefresh(auth.refreshToken, TENANT_SLUG)
          .then(setTokens)
          .catch(logout);
      }, msUntilRefresh);
    }
    return clearTimer;
  }, [auth, logout, setTokens]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiLogin(email, password, TENANT_SLUG);
      if ("mfaRequired" in result) {
        return { challengeToken: result.challengeToken };
      }
      setTokens(result);
      return null;
    },
    [setTokens],
  );

  const completeMfa = useCallback(
    async (challengeToken: string, code: string) => {
      const tokens = await apiMfaChallenge(challengeToken, code);
      setTokens(tokens);
    },
    [setTokens],
  );

  const apiFetch = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const token = authRef.current?.accessToken;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const res = await fetch(input, { ...init, headers });
      if (res.status === 401) logout();
      return res;
    },
    [logout],
  );

  const loginWithTokens = useCallback(
    (accessToken: string, refreshToken: string) => {
      setTokens({ accessToken, refreshToken });
    },
    [setTokens],
  );

  return (
    <AuthContext.Provider
      value={{ auth, tenantSlug: TENANT_SLUG, login, loginWithTokens, completeMfa, logout, apiFetch }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
