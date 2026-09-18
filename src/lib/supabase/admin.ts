import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Every call site is responsible for its own scoping, because the database
 * will not do it here. There are exactly four legitimate reasons to reach
 * for this:
 *
 *   1. The public RSVP flow. A household arrives holding a token and must
 *      read and write its own rows. Scoping comes from resolving the token to
 *      one household_id and constraining every query to it.
 *
 *   2. The cron sender, which has no user at all.
 *
 *   3. Moodboard storage — src/lib/supabase/storage.ts. The bucket is
 *      private and carries NO policies on storage.objects at all (spec 9,
 *      section 3), which is what keeps storage out of every migration and
 *      keeps verify-migrations.sh working against bare PostgreSQL. So every
 *      object is signed, uploaded and deleted by this client. Its scoping is
 *      that object paths are DERIVED from ids the server has already checked
 *      — storageObjectPath() in src/lib/moodboards.ts takes uuids and
 *      nothing else, and no action anywhere accepts a path from a client.
 *
 *   4. The moodboard share and clip-token paths —
 *      src/server/moodboards/resolve.ts and /api/clip. Same shape as (1): an
 *      unauthenticated caller arrives holding a token, and scoping comes from
 *      resolving that token to exactly one board or one wedding and
 *      constraining every subsequent query to it.
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
