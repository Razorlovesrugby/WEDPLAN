import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSchemaMissing } from "@/lib/db-errors";

/**
 * GET /api/health — why is the site broken?
 *
 * "Application error: a server-side exception has occurred (see the server
 * logs)" is what Next.js shows when a Server Component or middleware throws,
 * and the logs it points at are not always reachable by the person looking at
 * the screen. This endpoint turns the three realistic causes into one URL:
 *
 *   1. Environment variables missing or placeholder. A build SUCCEEDS with
 *      either, because it only validates their shape — so a deploy can go
 *      green and every request still fail.
 *   2. The database is unreachable: wrong project, paused project, bad key.
 *   3. Migrations behind. A page querying a table that does not exist throws,
 *      and the message never reaches the browser.
 *
 * DELIBERATELY LEAKS NOTHING. Booleans for whether a variable is set, never
 * its value; no host names, no keys, no connection strings. The table probe
 * reports existence only, never rows.
 */

export const dynamic = "force-dynamic";

const REQUIRED_CLIENT = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const REQUIRED_SERVER = ["SUPABASE_SERVICE_ROLE_KEY", "INVITE_TOKEN_PEPPER"] as const;
const OPTIONAL = [
  "NEXT_PUBLIC_SITE_URL",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "PINTEREST_APP_ID",
  "PINTEREST_APP_SECRET",
] as const;

/**
 * One probe per migration that matters, oldest first. A brand-new table is
 * enough to probe with `select("*")` — but a migration that only adds a
 * column to a table that already exists (the common shape once the schema
 * is past its first few migrations) needs `column` set to that column
 * specifically, or `select("*")` succeeds against the table regardless of
 * whether the migration ever ran. `0016` (list_sections.kind) is exactly
 * this shape, and shipped without a probe entry at all — a project could
 * (and did) apply everything through `0014` and still fail at `/budget`
 * with no signal from this endpoint that anything was wrong.
 */
const SCHEMA_PROBE = [
  { table: "weddings", migration: "0001_core_schema" },
  { table: "lists", migration: "0004_lists" },
  { table: "list_items", migration: "0005_lists_status_assignment", column: "status" },
  { table: "weddings", migration: "0007_settings", column: "reminder_window_days" },
  { table: "cut_lines", migration: "0008_multi_cut_lines" },
  { table: "run_sheet_items", migration: "0009_run_sheet" },
  { table: "budget_items", migration: "0010_budget" },
  { table: "budget_items", migration: "0011_budget_manual_quantity_columns", column: "quantity" },
  { table: "moodboards", migration: "0013_moodboards" },
  { table: "moodboard_clip_tokens", migration: "0014_moodboard_clipper" },
  { table: "weddings", migration: "0015_wedding_slug", column: "slug" },
  // 0016 also added list_sections.kind, but 0018 drops that column again — a
  // column this probe can no longer check for is not a safe probe for 0016,
  // so this checks a column of 0016's that outlives it instead.
  { table: "collaborators", migration: "0016_list_content_and_calculated_dates", column: "display_name" },
  { table: "budget_item_sections", migration: "0017_budget_section_links" },
  { table: "list_sections", migration: "0018_section_notes", column: "notes" },
] as const;

function isSet(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "";
}

export async function GET() {
  const env = {
    required: Object.fromEntries([...REQUIRED_CLIENT, ...REQUIRED_SERVER].map((n) => [n, isSet(n)])),
    optional: Object.fromEntries(OPTIONAL.map((n) => [n, isSet(n)])),
  };

  const missing = Object.entries(env.required)
    .filter(([, set]) => !set)
    .map(([name]) => name);

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        problem: "environment",
        missing,
        fix: "Set these in the Vercel project under Settings → Environment Variables, for every environment you deploy, then redeploy. See .env.example.",
        env,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // --- can we reach the database at all? ---
  let database: Record<string, unknown>;
  const schema: Record<string, string> = {};
  let bucket: Record<string, unknown> = { checked: false };

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("weddings").select("id", { head: true, count: "exact" });

    if (error) {
      database = { reachable: false, code: error.code ?? null, message: error.message };
    } else {
      database = { reachable: true };

      for (const probe of SCHEMA_PROBE) {
        const column = "column" in probe ? probe.column : "*";
        const result = await supabase.from(probe.table).select(column, { head: true, count: "exact" });
        // Through PostgREST a missing table is PGRST205, not PostgreSQL's
        // 42P01 — the distinction this endpoint got wrong on its first pass,
        // which would have reported the very outage it was written for as an
        // unrecognised error. src/lib/db-errors.ts has both.
        schema[probe.migration] = isSchemaMissing(result.error)
          ? "MISSING"
          : result.error
            ? `error: ${result.error.code ?? "unknown"}`
            : "applied";
      }

      const { data: bucketData, error: bucketError } = await supabase.storage.getBucket("moodboards");
      bucket = bucketData
        ? { checked: true, exists: true, public: bucketData.public }
        : { checked: true, exists: false, hint: "Run: node scripts/ensure-bucket.mjs", error: bucketError?.message ?? null };
    }
  } catch (error) {
    database = {
      reachable: false,
      message: error instanceof Error ? error.message : "unknown error",
    };
  }

  const schemaBehind = Object.entries(schema)
    .filter(([, status]) => status !== "applied")
    .map(([migration]) => migration);

  const ok = database["reachable"] === true && schemaBehind.length === 0;

  return NextResponse.json(
    {
      ok,
      problem: !ok
        ? database["reachable"] !== true
          ? "database-unreachable"
          : "migrations-behind"
        : null,
      fix: !ok
        ? database["reachable"] !== true
          ? "Check that NEXT_PUBLIC_SUPABASE_URL points at a live project and that SUPABASE_SERVICE_ROLE_KEY belongs to it. A paused project fails exactly like a wrong one."
          : `Apply the missing migrations: ${schemaBehind.join(", ")}. That is \`supabase db push\` against this project, or paste each file from supabase/migrations into the SQL editor in order. If they HAVE been applied, PostgREST's schema cache is stale — reload it from the dashboard (API → Reload schema) or run: notify pgrst, 'reload schema';`
        : null,
      env,
      database,
      schema,
      bucket,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
