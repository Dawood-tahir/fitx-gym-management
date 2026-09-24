"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

  useEffect(() => {
    let active = true;
    void authService.current()
      .then((value) => { if (active) setSession(value); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { if (active) setReady(true); });
    const unsubscribe = authService.subscribe((value) => {
      if (active) { setSession(value); setReady(true); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const next = await authService.login(email, password, rememberMe);
    setSession(next);
    return next.user;
  }, []);
  const logout = useCallback(async () => {
    try { await authService.logout(); }
    finally { setSession(null); window.location.assign("/login"); }
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
