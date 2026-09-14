"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { rankSequence } from "@/lib/rank";
import { parseCsvTable } from "@/lib/csv-parse";
import { detectMapping, type ColumnMapping, IMPORT_FIELDS } from "@/lib/import/columns";
import {
  buildPlan,
  householdsToCreate,
  type ExistingGuest,
  type ExistingHousehold,
  type ImportPlan,
  type PlannedRow,
} from "@/lib/import/plan";
import { fail, ok, type ActionResult } from "./result";

/**
 * CSV import.
 *
 * Two actions, deliberately separate. `previewImport` reads the file and
 * decides nothing permanent; `commitImport` writes exactly what the user
 * approved. The file is re-parsed on commit rather than the preview being
 * trusted back from the browser — the client holds the user's *decisions*
 * (which rows to import), never the row data itself, so a tampered payload
 * can skip rows but cannot invent a guest in another wedding.
 */

/** A file bigger than this is not a guest list. Guards the parser and the
 *  round trip through a server action's payload. */
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

function parseMapping(raw: unknown): ColumnMapping | null {
  if (!Array.isArray(raw)) return null;
  const out: ColumnMapping = [];
  for (const entry of raw) {
    if (entry === null) out.push(null);
    else if (typeof entry === "string" && (IMPORT_FIELDS as readonly string[]).includes(entry)) {
      out.push(entry as ColumnMapping[number]);
    } else return null;
  }
  return out;
}

/**
 * Everything already in this wedding, for dedupe.
 *
 * Read through the signed-in client so RLS scopes it; a wedding is hundreds
 * of rows, so this is one small query rather than a per-row lookup.
 */
async function readExisting(weddingId: string): Promise<{
  guests: ExistingGuest[];
  households: ExistingHousehold[];
}> {
  const supabase = await createClient();

  const [{ data: guests, error: guestError }, { data: households, error: householdError }] =
    await Promise.all([
      supabase
        .from("guests")
        .select("id, first_name, last_name, email, household_id, households(display_name)")
        .eq("wedding_id", weddingId)
        .is("deleted_at", null),
      supabase
        .from("households")
        .select("id, display_name")
        .eq("wedding_id", weddingId)
        .is("deleted_at", null),
    ]);

  if (guestError) throw new Error(`Could not read the guest list: ${guestError.message}`);
  if (householdError) throw new Error(`Could not read households: ${householdError.message}`);

  return {
    guests: (guests ?? []).map((guest) => ({
      id: guest.id,
      first_name: guest.first_name,
      last_name: guest.last_name,
      email: guest.email,
      household_id: guest.household_id,
      household_name: guest.households?.display_name ?? "",
    })),
    households: households ?? [],
  };
}

export type PreviewResult = {
  headers: string[];
  mapping: ColumnMapping;
  delimiter: string;
  plan: ImportPlan;
  truncated: boolean;
};

/**
 * Parse, map and plan — no writes.
 *
 * `mapping` is absent on the first call (detection supplies one) and present
 * on every later call as the user corrects it.
 */
export async function previewImport(
  text: string,
  mapping?: unknown,
): Promise<ActionResult<PreviewResult>> {
  const wedding = await requireWedding();

  if (typeof text !== "string" || text.trim() === "") {
    return fail("That file is empty");
  }
  if (text.length > MAX_BYTES) {
    return fail("That file is larger than 2MB — is it definitely a guest list?");
  }

  const table = parseCsvTable(text);
  if (table.headers.length === 0) {
    return fail("That file has no header row");
  }
  if (table.rows.length === 0) {
    return fail("That file has headers but no rows underneath them");
  }

  const truncated = table.rows.length > MAX_ROWS;
  const rows = truncated ? table.rows.slice(0, MAX_ROWS) : table.rows;

  const supplied = mapping === undefined ? null : parseMapping(mapping);
  if (mapping !== undefined && supplied === null) {
    return fail("That column mapping is not valid");
  }

  // A mapping from the client is per-column, so it must match the file's own
  // width or the columns are being read off by one.
  const resolved =
    supplied && supplied.length === table.headers.length
      ? supplied
      : detectMapping(table.headers);

  const existing = await readExisting(wedding.id);
  const plan = buildPlan(rows, resolved, existing.guests, existing.households);

  return ok({
    headers: table.headers,
    mapping: resolved,
    delimiter: table.delimiter,
    plan,
    truncated,
  });
}

/**
 * Write the approved rows.
 *
 * Households first, because guests reference them. Both go in as single bulk
 * inserts: 300 guests one at a time is 300 round trips, and the composite
 * foreign key on (household_id, wedding_id) means a guest whose household
 * failed to insert is rejected by the database rather than silently orphaned.
 *
 * `rankSequence` supplies the household ranks in one evenly-spaced run. The
 * naive alternative — rankAfter in a loop — grows a character every few rows
 * and leaves a 300-household import with 60-character keys.
 */
export async function commitImport(
  text: string,
  mapping: unknown,
  skipLines: number[],
): Promise<ActionResult<{ households: number; guests: number }>> {
  const wedding = await requireWedding();

  const parsedMapping = parseMapping(mapping);
  if (parsedMapping === null) return fail("That column mapping is not valid");
  if (!Array.isArray(skipLines) || skipLines.some((line) => typeof line !== "number")) {
    return fail("That list of skipped rows is not valid");
  }

  const table = parseCsvTable(text);
  if (table.rows.length === 0) return fail("That file has no rows");
  if (parsedMapping.length !== table.headers.length) {
    return fail("The mapping no longer matches the file — load it again");
  }

  const existing = await readExisting(wedding.id);
  const plan = buildPlan(
    table.rows.slice(0, MAX_ROWS),
    parsedMapping,
    existing.guests,
    existing.households,
  );

  // The user's decisions, applied to a plan built fresh on the server.
  const skip = new Set(skipLines);
  const rows: PlannedRow[] = plan.rows.map((row) => ({
    ...row,
    action: skip.has(row.line) ? "skip" : row.errors.length > 0 ? "skip" : "create",
  }));

  const importing = rows.filter((row) => row.action === "create" && row.errors.length === 0);
  if (importing.length === 0) {
    return fail("Every row is either skipped or unusable, so there is nothing to import");
  }

  const supabase = await createClient();

  // --- households ---------------------------------------------------------
  const newHouseholds = householdsToCreate(plan, rows);
  const householdIdByKey = new Map<string, string>();

  if (newHouseholds.length > 0) {
    const { data: last } = await supabase
      .from("households")
      .select("rank")
      .eq("wedding_id", wedding.id)
      .is("deleted_at", null)
      .order("rank", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Imported households land below everyone already ranked, for the same
    // reason a hand-added one does: something you have just loaded should not
    // push an existing guest off the list.
    const ranks = rankSequence(newHouseholds.length, last?.rank ?? null, null);

    const { data: inserted, error } = await supabase
      .from("households")
      .insert(
        newHouseholds.map((household, index) => ({
          wedding_id: wedding.id,
          display_name: household.displayName,
          address: household.address,
          rank: ranks[index]!,
        })),
      )
      .select("id, display_name");

    if (error) return fail(`Could not create households: ${error.message}`);

    // Insert order is preserved by PostgREST, so the nth row back is the nth
    // household sent. Matching on name instead would collide whenever two
    // households share one.
    (inserted ?? []).forEach((row, index) => {
      const key = newHouseholds[index]?.key;
      if (key) householdIdByKey.set(key, row.id);
    });
  }

  // --- guests -------------------------------------------------------------
  const guestRows = importing.map((row) => ({
    wedding_id: wedding.id,
    household_id: row.existingHouseholdId ?? householdIdByKey.get(row.householdKey)!,
    ...row.guest,
  }));

  const orphan = guestRows.find((row) => !row.household_id);
  if (orphan) {
    return fail("A guest ended up without a household — nothing was imported beyond households");
  }

  const { error: guestError, count } = await supabase
    .from("guests")
    .insert(guestRows, { count: "exact" });

  if (guestError) return fail(`Could not import guests: ${guestError.message}`);

  revalidatePath("/guests");
  revalidatePath("/guests/rank");
  revalidatePath("/");

  return ok({
    households: newHouseholds.length,
    guests: count ?? guestRows.length,
  });
}
