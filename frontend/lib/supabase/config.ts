export interface SupabasePublicConfig {
  url: string;
  key: string;
}

export class SupabaseConfigurationError extends Error {
  constructor() {
    super("FITX is not connected to Supabase. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
    this.name = "SupabaseConfigurationError";
  }
}

export function getSupabaseConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  return url && key ? { url, key } : null;
}

export function requireSupabaseConfig(): SupabasePublicConfig {
  const config = getSupabaseConfig();
  if (!config) throw new SupabaseConfigurationError();
  return config;
}
