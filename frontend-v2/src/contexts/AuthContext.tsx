import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { authApi, type User, type ProfileUpdate } from '@/lib/api/authApi';
import { setTokenGetter, ApiError } from '@/lib/api/client';

const STORAGE_KEY = 'auth_session';

interface StoredSession {
  token: string;
  user: User;
  expiresAt: number; // unix ms
}

function saveSession(token: string, user: User, expiresIn: number) {
  const session: StoredSession = { token, user, expiresAt: Date.now() + expiresIn * 1000 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    // Treat as expired if less than 60s remaining
    if (session.expiresAt - Date.now() < 60_000) return null;
    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginAsAdmin: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setAuth = useCallback((token: string, user: User, expiresIn: number) => {
    saveSession(token, user, expiresIn);
    setState({ user, accessToken: token, isAuthenticated: true, isAdmin: user.role === 'admin', isLoading: false });
    setTokenGetter(() => token);
    scheduleRefresh(expiresIn);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleRefresh(expiresIn: number, attempt = 0) {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max((expiresIn - 60) * 1000, 0);
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const res = await authApi.refresh();
        setTokenGetter(() => res.access_token);
        const user = await authApi.getMe();
        setAuth(res.access_token, user, res.expires_in);
      } catch (err) {
        // Only a definitive rejection kills the session. Network errors and
        // 5xx get retried with backoff — the refresh cookie may still be good.
        const isAuthFailure = err instanceof ApiError && (err.status === 401 || err.status === 403);
        if (isAuthFailure || attempt >= 3) {
          clearAuth();
        } else {
          const backoff = Math.min(5 * 2 ** attempt, 30); // 5s, 10s, 20s
          scheduleRefresh(backoff + 60, attempt + 1);
        }
      }
    }, delay);
  }

  function clearAuth() {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    clearSession();
    setTokenGetter(() => null);
    setState({ user: null, accessToken: null, isAuthenticated: false, isAdmin: false, isLoading: false });
  }

  // On mount: restore from localStorage first, fall back to refresh endpoint
  useEffect(() => {
    (async () => {
      const stored = loadSession();
      if (stored) {
        setTokenGetter(() => stored.token);
        const remainingMs = stored.expiresAt - Date.now();
        setState({ user: stored.user, accessToken: stored.token, isAuthenticated: true, isAdmin: stored.user.role === 'admin', isLoading: false });
        scheduleRefresh(Math.floor(remainingMs / 1000));
        return;
      }

      // No valid stored session — try refresh cookie
      try {
        const res = await authApi.refresh();
        setTokenGetter(() => res.access_token);
        const user = await authApi.getMe();
        setAuth(res.access_token, user, res.expires_in);
      } catch {
        clearAuth();
      }
    })();
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const res = await authApi.googleLogin(idToken);
    setAuth(res.access_token, res.user, res.expires_in);
  }, [setAuth]);

  const loginAsAdmin = useCallback(async (username: string, password: string) => {
    const res = await authApi.adminLogin(username, password);
    setAuth(res.access_token, res.user, res.expires_in);
  }, [setAuth]);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* best-effort */ }
    clearAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateProfile = useCallback(async (data: ProfileUpdate) => {
    const updated = await authApi.updateProfile(data);
    setState((s) => {
      // Update stored session with new user data, preserving existing token/expiry
      const stored = loadSession();
      if (stored) saveSession(stored.token, updated, Math.floor((stored.expiresAt - Date.now()) / 1000));
      return { ...s, user: updated };
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, loginWithGoogle, loginAsAdmin, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
