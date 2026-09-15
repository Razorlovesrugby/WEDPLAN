import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Every call site is responsible for its own scoping, because the database
 * will not do it here. There are exactly three legitimate reasons to reach
 * for this:
 *
 *   1. The public RSVP flow. A household arrives holding a token and must
 *      read and write its own rows. Scoping comes from resolving the token to
 *      one household_id and constraining every query to it.
 *
 *   2. The cron sender, which has no user at all.
 *
 *   3. src/server/queries/fx.ts's getFxRate(), writing a live-fetched rate
 *      back into fx_rates on a cache miss. Unlike the other two, this runs
 *      inside a signed-in collaborator's own request — but fx_rates is
 *      global reference data (spec 6, section 3), and a tenant's own client
 *      has no write grant on it at all (0010_budget.sql's RLS), the same
 *      "writable by nobody through the API but the lookup path itself" shape
 *      list_templates already uses.
 *
 * Anything a logged-in collaborator does must go through
 * lib/supabase/server.ts instead, so that RLS remains the thing enforcing
 * tenancy rather than the correctness of whatever query was written that day.
 *
 * The composite foreign keys in the schema are the backstop for mistakes
 * here: even this client cannot attach a guest to another wedding's
 * household.
 */
export function createAdminClient() {
  return createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { headers: { "x-application-name": "wedplan-service" } },
    },
  );
}
