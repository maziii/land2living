import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiRefresh } from "../api/auth.js";
import { setTokenProvider } from "../api/client.js";

interface AuthState {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string;
  role: string;
  userId: string;
  exp: number;
}

interface AuthContextValue {
  auth: AuthState | null;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
  getToken: () => string | null;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "l2l_field_auth";

function parseJwt(token: string): { userId: string; tenantSlug: string; role: string; exp: number } {
  const parts = token.split(".");
  if (!parts[1]) throw new Error("Invalid JWT");
  const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  return payload as { userId: string; tenantSlug: string; role: string; exp: number };
}

function buildState(access: string, refresh: string): AuthState {
  const { userId, tenantSlug, role, exp } = parseJwt(access);
  return { accessToken: access, refreshToken: refresh, tenantSlug, role, userId, exp };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const { access, refresh } = JSON.parse(raw) as { access: string; refresh: string };
      const state = buildState(access, refresh);
      if (state.exp * 1000 <= Date.now()) return null;
      return state;
    } catch {
      return null;
    }
  });

  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  const logout = useCallback(() => {
    setAuth(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const setTokens = useCallback((access: string, refresh: string) => {
    const state = buildState(access, refresh);
    setAuth(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ access, refresh }));
  }, []);

  const getToken = useCallback(() => authRef.current?.accessToken ?? null, []);

  // Wire API client
  useEffect(() => {
    setTokenProvider(getToken);
  }, [getToken]);

  // Logout on 401
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("l2l:unauthorized", handler);
    return () => window.removeEventListener("l2l:unauthorized", handler);
  }, [logout]);

  // Silent refresh 60 s before expiry
  useEffect(() => {
    if (!auth) return;
    const msUntilRefresh = auth.exp * 1000 - Date.now() - 60_000;
    if (msUntilRefresh <= 0) {
      logout();
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { accessToken, refreshToken } = await apiRefresh(
          authRef.current!.refreshToken,
          authRef.current!.tenantSlug,
        );
        setTokens(accessToken, refreshToken);
      } catch {
        logout();
      }
    }, msUntilRefresh);
    return () => clearTimeout(timer);
  }, [auth, logout, setTokens]);

  return (
    <AuthCtx.Provider value={{ auth, setTokens, logout, getToken }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
