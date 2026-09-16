import { api, SESSION_KEY } from "@/lib/api";
import type { AuthSession } from "@/types/api";

function clearStoredSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  try {
    const value = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;

    const session = JSON.parse(value) as Partial<AuthSession>;
    if (!session.accessToken || !session.user?.id || !session.user.role) {
      clearStoredSession();
      return null;
    }
    return session as AuthSession;
  } catch {
    clearStoredSession();
    return null;
  }
}

function storeSession(session: AuthSession, rememberMe: boolean) {
  clearStoredSession();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export const authService = {
  async current(): Promise<AuthSession | null> {
    return readStoredSession();
  },

  async login(email: string, password: string, rememberMe = true): Promise<AuthSession> {
    const session = await api.auth.login(email.trim().toLowerCase(), password, rememberMe);
    storeSession(session, rememberMe);
    return session;
  },

  async logout() {
    const refreshToken = readStoredSession()?.refreshToken;
    try {
      if (refreshToken) await api.auth.logout(refreshToken);
    } finally {
      clearStoredSession();
    }
  },
};
