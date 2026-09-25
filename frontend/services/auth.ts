import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { AuthSession, UserRole } from "@/types/api";
import type { ProfileRow } from "@/types/database";
import { ApiError, throwIfError, toApiError } from "./errors";

function roleFor(profile: ProfileRow): UserRole {
  if (profile.role === "owner") return "OWNER";
  if (profile.role === "admin") return "ADMIN";
  return "STAFF";
}

async function appSession(session: Session | null): Promise<AuthSession | null> {
  if (!session?.user) return null;
  const { data, error } = await createClient().from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  throwIfError(error, "Your FITX profile could not be loaded.");
  if (!data) throw new ApiError("Your account has no FITX profile.", 403);
  if (!data.is_active) throw new ApiError("Your FITX account is awaiting activation.", 403);
  return {
    user: {
      id: data.id,
      name: data.full_name,
      email: data.email,
      phone: data.phone ?? undefined,
      role: roleFor(data),
      status: "Active",
      lastLoginAt: data.last_login_at ?? undefined,
    },
  };
}

export const authService = {
  async current() {
    const { data, error } = await createClient().auth.getSession();
    throwIfError(error, "Your session could not be restored.");
    return appSession(data.session);
  },
  async login(email: string, password: string, rememberMe = true) {
    void rememberMe;
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw toApiError(error, "The email or password is incorrect.");
    try {
      const result = await appSession(data.session);
      if (!result) throw new ApiError("Supabase did not create a session.", 401);
      return result;
    } catch (profileError) {
      await supabase.auth.signOut();
      throw profileError;
    }
  },
  async logout() {
    const { error } = await createClient().auth.signOut();
    throwIfError(error, "You could not be signed out.");
  },
  async requestPasswordReset(email: string) {
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    throwIfError(error, "Password reset instructions could not be sent.");
  },
  async updatePassword(password: string) {
    const { error } = await createClient().auth.updateUser({ password });
    throwIfError(error, "Your password could not be updated.");
  },
  subscribe(listener: (session: AuthSession | null) => void) {
    const { data } = createClient().auth.onAuthStateChange((_event: AuthChangeEvent, session) => {
      window.setTimeout(() => { void appSession(session).then(listener).catch(() => listener(null)); }, 0);
    });
    return () => data.subscription.unsubscribe();
  },
};
