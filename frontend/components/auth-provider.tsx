"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SESSION_KEY } from "@/lib/api";
import { authService } from "@/services/auth";
import type { AuthSession, User } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  session: AuthSession | null;
  ready: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<User>;
  logout: () => Promise<void>;
  can: (...roles: User["role"][]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(async () => {
    try {
      setSession(await authService.current());
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("FITX auth initialization failed", error);
      setSession(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void hydrate();

    const syncStoredSession = (event: StorageEvent) => {
      if (event.key === null || event.key === SESSION_KEY) void hydrate();
    };
    const useRefreshedSession = (event: Event) => {
      if (!active) return;
      const refreshed = (event as CustomEvent<AuthSession>).detail;
      if (refreshed) setSession(refreshed);
    };

    window.addEventListener("storage", syncStoredSession);
    window.addEventListener("fitx-session-refreshed", useRefreshedSession);

    return () => {
      active = false;
      window.removeEventListener("storage", syncStoredSession);
      window.removeEventListener("fitx-session-refreshed", useRefreshedSession);
    };
  }, [hydrate]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const next = await authService.login(email, password, rememberMe);
    setSession(next);
    return next.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("FITX sign out failed", error);
    } finally {
      setSession(null);
      window.location.assign("/login");
    }
  }, []);

  const can = useCallback((...roles: User["role"][]) => Boolean(session?.user && roles.includes(session.user.role)), [session]);
  const value = useMemo(() => ({ user: session?.user ?? null, session, ready, login, logout, can }), [session, ready, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
