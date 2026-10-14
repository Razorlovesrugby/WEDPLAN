import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

/**
 * Retention for the audit log (spec 32 §4.5, Q3): keep a year, drop the rest.
 *
 * The log is append-only for everyone, including its owner; the only way a row
 * leaves is `prune_audit_log()`, which this calls. Runs as the service role
 * because there is no user, and is gated by the same bearer secret as the
 * reminders cron. Idempotent — running it twice in a row deletes nothing new.
 */

export const dynamic = "force-dynamic";

const KEEP_DAYS = 365;

async function run(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("prune_audit_log", { p_keep_days: KEEP_DAYS });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ pruned: data ?? 0, keepDays: KEEP_DAYS });
}

export const GET = run;
export const POST = run;
