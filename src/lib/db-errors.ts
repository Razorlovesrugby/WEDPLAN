/**
 * Telling "this migration has not been applied" apart from a real failure.
 *
 * THE TRAP THIS FILE EXISTS FOR: the app does not talk to PostgreSQL, it
 * talks to PostgREST. So a missing table does NOT arrive as Postgres's
 * `42P01 undefined_table` — it arrives as `PGRST205`, "Could not find the
 * table 'public.v_moodboards' in the schema cache". A guard written against
 * the Postgres code looks right, passes review, and never fires in
 * production. That is exactly what happened: supabase/tests/*.sql speak to
 * Postgres directly and see 42P01, the running app never does.
 *
 * Both are handled here, along with the column-level equivalents, because a
 * half-applied pair of migrations (0013 without 0014) shows up as a missing
 * COLUMN rather than a missing table.
 */

/** PostgREST's schema-cache codes, then the raw PostgreSQL ones it sometimes passes through. */
const SCHEMA_CODES = new Set([
  "PGRST202", // function not found in the schema cache
  "PGRST204", // column not found in the schema cache
  "PGRST205", // table or view not found in the schema cache
  "42P01", //   undefined_table
  "42703", //   undefined_column
]);

export type DbErrorish = { code?: string | null; message?: string | null } | null | undefined;

/**
 * True when the database simply does not have this part of the schema yet.
 *
 * Note this is also what a STALE PostgREST schema cache looks like — the
 * migration ran, but PostgREST has not reloaded. The remedy differs (reload
 * rather than migrate) but the handling here is the same: degrade, and let
 * /api/health say which it is.
 */
export function isSchemaMissing(error: DbErrorish): boolean {
  if (!error) return false;
  if (error.code && SCHEMA_CODES.has(error.code)) return true;

  // Belt and braces for a PostgREST version that changes its codes again:
  // the message shape has been stable across several of them.
  const message = error.message ?? "";
  return /schema cache/i.test(message) && /could not find/i.test(message);
}
