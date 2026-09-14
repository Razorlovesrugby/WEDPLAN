import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";
import type { CookieToSet } from "./cookies";
import type { Database } from "@/lib/types/database";

/**
 * Supabase client for the signed-in collaborator.
 *
 * Carries the user's session, so every query runs as `authenticated` and RLS
 * decides what comes back. This is the client that almost everything should
 * use — if a query works here, tenancy is being enforced by the database.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. The session refresh that
            // matters happens in middleware, which can, so this is safe to
            // swallow rather than a failure to report.
          }
        },
      },
    },
  );
}
