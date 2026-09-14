import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Supabase client for the browser. Used only for auth (sending the magic
 * link) and, later, realtime. All data access happens on the server, so the
 * anon key in the bundle has no table privileges at all — see the RLS
 * migration, which revokes them outright.
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
