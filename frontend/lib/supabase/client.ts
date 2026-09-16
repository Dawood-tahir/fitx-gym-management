import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseConfig } from "./config";
import type { Database } from "@/types/database";

let browserClient: SupabaseClient<Database> | undefined;

export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;
  const { url, key } = requireSupabaseConfig();
  browserClient = createBrowserClient<Database>(url, key);
  return browserClient;
}
