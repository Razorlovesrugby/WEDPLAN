import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { areaForTables, dayStartInZone, nextDay, type AreaKey } from "@/lib/audit/describe";
import type { AuditLogRow } from "@/lib/types/database";

/**
 * Reading the audit log (spec 32 §4.3).
 *
 * Through `createClient()`, so the collaborator-read policy on `audit_log` is
 * what scopes it. There is no write here and no write anywhere in the app: the
 * rows are written by a trigger, and `authenticated` has SELECT only.
 */

export const AUDIT_PAGE_SIZE = 50;

export type AuditPage = {
  entries: AuditLogRow[];
  /** Pass as `before` to get the next, older page; null when this was the last. */
  nextBefore: number | null;
};

/** Primitive arguments so `cache()` can actually dedupe a repeated call. */
export const listAuditEntries = cache(
  async (
    weddingId: string,
    timeZone: string,
    area: AreaKey | null,
    actor: string | null,
    from: string | null,
    to: string | null,
    before: number | null,
  ): Promise<AuditPage> => {
    const supabase = await createClient();
    let query = supabase
      .from("audit_log")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("id", { ascending: false })
      .limit(AUDIT_PAGE_SIZE + 1);

    if (area) query = query.in("table_name", [...areaForTables(area)]);
    if (actor === "public") query = query.eq("actor_kind", "public");
    else if (actor) query = query.eq("actor_id", actor);
    if (from) query = query.gte("at", dayStartInZone(from, timeZone).toISOString());
    if (to) query = query.lt("at", dayStartInZone(nextDay(to), timeZone).toISOString());
    if (before) query = query.lt("id", before);

    const { data, error } = await query;
    if (error) throw new Error(`Could not load the activity log: ${error.message}`);

    const rows = (data ?? []) as AuditLogRow[];
    const more = rows.length > AUDIT_PAGE_SIZE;
    const entries = more ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;
    return { entries, nextBefore: more ? (entries[entries.length - 1]?.id ?? null) : null };
  },
);
