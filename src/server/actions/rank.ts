"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { needsRebalance, rankBetween, rankSequence } from "@/lib/rank";
import { MAX_CUT_LINES } from "@/lib/tier-colors";
import type { CutLineRow } from "@/lib/types/database";
import { fail, ok, type ActionResult } from "./result";

/**
 * Moving a household in the ranking.
 *
 * The new rank is computed on the SERVER from the neighbours the client says
 * it dropped between, not sent by the client. Two reasons: the client's view
 * of the list can be stale by the time the write lands, and a rank is the
 * only thing ordering the list, so it is not something to accept on trust.
 *
 * `households.rank` is uniquely indexed per wedding. If the other collaborator
 * moved something into the same gap a moment earlier, the insert collides —
 * which is the correct outcome, not a problem to design around. We re-read the
 * neighbours and try again, so the loser of the race lands next to where they
 * aimed instead of failing.
 */

const moveSchema = z.object({
  householdId: z.string().uuid(),
  beforeId: z.string().uuid().nullable(),
  afterId: z.string().uuid().nullable(),
});

const MAX_ATTEMPTS = 4;

export async function moveHousehold(
  householdId: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<ActionResult<{ rank: string }>> {
  const parsed = moveSchema.safeParse({ householdId, beforeId, afterId });
  if (!parsed.success) return fail("That move doesn't make sense");

  const wedding = await requireWedding();
  const supabase = await createClient();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: neighbours, error: readError } = await supabase
      .from("households")
      .select("id, rank")
      .eq("wedding_id", wedding.id)
      .is("deleted_at", null)
      .in("id", [parsed.data.beforeId, parsed.data.afterId].filter((v): v is string => v !== null));

    if (readError) return fail(readError.message);

    const rankOf = (id: string | null) =>
      id === null ? null : (neighbours?.find((n) => n.id === id)?.rank ?? null);

    const lower = rankOf(parsed.data.beforeId);
    const upper = rankOf(parsed.data.afterId);

    let rank: string;
    try {
      rank = rankBetween(lower, upper);
    } catch {
      // Neighbours have moved since the drag started; the list is stale.
      return fail("Someone else reordered the list. Refresh and try again.");
    }

    const { error } = await supabase
      .from("households")
      .update({ rank })
      .eq("id", parsed.data.householdId)
      .eq("wedding_id", wedding.id);

    if (!error) {
      revalidatePath("/guests/rank");
      revalidatePath("/guests");
      return ok({ rank });
    }

    // 23505 is the unique index on (wedding_id, rank): somebody took this gap
    // between our read and our write. Try again with fresh neighbours.
    if (error.code !== "23505") return fail(error.message);
  }

  return fail("Could not place that household — the list is busy. Try again.");
}

/**
 * A cut line is a stored rank on a `cut_lines` row, not a flag on each
 * household. Moving it re-tiers the whole waitlist with no write to
 * households at all (spec 5, part A).
 *
 * The household's own rank is read here, server-side — never trusted from
 * the client — same rule this file's other actions already follow
 * (docs/HANDOFF.md section 5, point 3).
 */
export async function setCutLine(lineId: string, householdId: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  let rank: string | null = null;
  if (householdId) {
    const { data, error } = await supabase
      .from("households")
      .select("rank")
      .eq("wedding_id", wedding.id)
      .eq("id", householdId)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("That household is no longer in the list");
    rank = data.rank;
  }

  const { error } = await supabase
    .from("cut_lines")
    .update({ boundary_rank: rank })
    .eq("id", lineId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);

  revalidatePath("/guests/rank");
  revalidatePath("/guests");
  revalidatePath("/settings");
  revalidatePath("/");
  return ok(undefined);
}

async function loadCutLines(weddingId: string): Promise<CutLineRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cut_lines")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("position", { ascending: true });
  if (error) return null;
  return data ?? [];
}

const labelSchema = z.string().trim().min(1, "Give the line a name").max(60);

/**
 * Appends a new line directly above the trailing catch-all, per spec 5, A4.
 * The trailing line's own position is bumped first, into the gap this
 * creates — no other row moves, so there is nothing to collide with the
 * `unique (wedding_id, position)` index.
 *
 * The new line's boundary defaults to whatever the line above it already
 * ends at (or null, if this is the second line ever), so it shares a
 * boundary with its neighbour and therefore starts genuinely empty (A6,
 * decision 2) — the planner drags a household into it, or picks a new
 * boundary, whenever they decide where it sits.
 */
export async function addCutLine(label: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsedLabel = labelSchema.safeParse(label);
  if (!parsedLabel.success) return fail(parsedLabel.error.issues[0]?.message ?? "Invalid name");

  const lines = await loadCutLines(wedding.id);
  if (!lines) return fail("Could not load the current cut lines");
  if (lines.length >= MAX_CUT_LINES) return fail(`A wedding can have at most ${MAX_CUT_LINES} cut lines`);

  const trailing = lines[lines.length - 1];
  if (!trailing) return fail("This wedding has no cut lines to add another one below");

  const newPosition = lines.length - 1;
  const defaultBoundary = lines.length >= 2 ? (lines[lines.length - 2]?.boundary_rank ?? null) : null;

  const supabase = await createClient();

  // Bump the trailing line out of the way first — its new position (N) has
  // never been used, so this cannot collide with anything.
  const { error: bumpError } = await supabase
    .from("cut_lines")
    .update({ position: lines.length })
    .eq("id", trailing.id)
    .eq("wedding_id", wedding.id);
  if (bumpError) return fail(bumpError.message);

  const { data, error } = await supabase
    .from("cut_lines")
    .insert({
      wedding_id: wedding.id,
      label: parsedLabel.data,
      position: newPosition,
      boundary_rank: defaultBoundary,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidatePath("/guests/rank");
  revalidatePath("/guests");
  revalidatePath("/settings");
  return ok({ id: data.id });
}

/**
 * Refused on the last remaining line (spec 5, A3) — "no cut lines
 * configured" is not a representable state.
 *
 * Deleting any other line needs no write to a household: the tier below
 * simply absorbs its households once the row is gone, because tier is
 * fully derived (A6, decision 3). The one row that does need a write is the
 * new trailing line, if the line removed was the old one — the invariant
 * "the last line by position has a null boundary" has to keep holding.
 */
export async function removeCutLine(lineId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const lines = await loadCutLines(wedding.id);
  if (!lines) return fail("Could not load the current cut lines");
  if (lines.length <= 1) return fail("A wedding needs at least one cut line");

  const target = lines.find((l) => l.id === lineId);
  if (!target) return fail("That cut line no longer exists");

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("cut_lines")
    .delete()
    .eq("id", lineId)
    .eq("wedding_id", wedding.id);
  if (deleteError) return fail(deleteError.message);

  const remaining = lines.filter((l) => l.id !== lineId);
  const wasTrailing = target.position === lines[lines.length - 1]?.position;

  // Shift every line below the deleted one up by one position, low to high —
  // each target slot is already empty by the time we write to it.
  for (const line of remaining) {
    if (line.position <= target.position) continue;
    const { error } = await supabase
      .from("cut_lines")
      .update({ position: line.position - 1 })
      .eq("id", line.id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }

  if (wasTrailing) {
    const newTrailing = [...remaining].sort((a, b) => a.position - b.position).pop();
    if (newTrailing && newTrailing.boundary_rank !== null) {
      const { error } = await supabase
        .from("cut_lines")
        .update({ boundary_rank: null })
        .eq("id", newTrailing.id)
        .eq("wedding_id", wedding.id);
      if (error) return fail(error.message);
    }
  }

  revalidatePath("/guests/rank");
  revalidatePath("/guests");
  revalidatePath("/settings");
  revalidatePath("/");
  return ok(undefined);
}

export async function renameCutLine(lineId: string, label: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsedLabel = labelSchema.safeParse(label);
  if (!parsedLabel.success) return fail(parsedLabel.error.issues[0]?.message ?? "Invalid name");

  const supabase = await createClient();
  const { error } = await supabase
    .from("cut_lines")
    .update({ label: parsedLabel.data })
    .eq("id", lineId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePath("/guests/rank");
  revalidatePath("/guests");
  revalidatePath("/settings");
  return ok(undefined);
}

/**
 * Swaps a line's position with its neighbour above or below. Goes through a
 * temporary position (-1, never otherwise used) so the two writes never
 * collide with the `unique (wedding_id, position)` index — the same
 * park-then-write shape `rebalanceRanks` below uses for household ranks.
 */
export async function reorderCutLine(lineId: string, direction: "up" | "down"): Promise<ActionResult> {
  const wedding = await requireWedding();
  const lines = await loadCutLines(wedding.id);
  if (!lines) return fail("Could not load the current cut lines");

  const line = lines.find((l) => l.id === lineId);
  if (!line) return fail("That cut line no longer exists");

  const neighbourPosition = direction === "up" ? line.position - 1 : line.position + 1;
  const neighbour = lines.find((l) => l.position === neighbourPosition);
  if (!neighbour) return ok(undefined); // Already at that end — nothing to do.

  const supabase = await createClient();

  const park = await supabase.from("cut_lines").update({ position: -1 }).eq("id", line.id).eq("wedding_id", wedding.id);
  if (park.error) return fail(park.error.message);

  const moveNeighbour = await supabase
    .from("cut_lines")
    .update({ position: line.position })
    .eq("id", neighbour.id)
    .eq("wedding_id", wedding.id);
  if (moveNeighbour.error) return fail(moveNeighbour.error.message);

  const settle = await supabase
    .from("cut_lines")
    .update({ position: neighbourPosition })
    .eq("id", line.id)
    .eq("wedding_id", wedding.id);
  if (settle.error) return fail(settle.error.message);

  revalidatePath("/guests/rank");
  revalidatePath("/guests");
  revalidatePath("/settings");
  return ok(undefined);
}

export async function setCapacity(capacity: number | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.number().int().positive().nullable().safeParse(capacity);
  if (!parsed.success) return fail("Capacity must be a whole number above zero");

  const supabase = await createClient();
  const { error } = await supabase
    .from("weddings")
    .update({ capacity: parsed.data })
    .eq("id", wedding.id);

  if (error) return fail(error.message);

  revalidatePath("/guests/rank");
  revalidatePath("/");
  return ok(undefined);
}

/**
 * Rewrite every rank as an evenly spaced sequence.
 *
 * Keys lengthen as the same gap is bisected over and over. Nothing breaks when
 * they do, so this is never automatic — it rewrites every row, and doing that
 * behind someone's back while their partner is mid-drag is worse than a long
 * key. Offered when `needsRebalance` says the keys have grown.
 */
export async function rebalanceRanks(): Promise<ActionResult<{ rewritten: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: households, error } = await supabase
    .from("households")
    .select("id, rank")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null)
    .order("rank", { ascending: true });

  if (error) return fail(error.message);
  if (!households || households.length === 0) return ok({ rewritten: 0 });

  const fresh = rankSequence(households.length);

  // Two passes through a temporary namespace. Ranks are uniquely indexed, so
  // writing the new sequence directly would collide with rows that still hold
  // an old key. The interim keys start with '~', which sorts above every
  // base-62 digit and so cannot collide with a real rank either.
  for (const [index, household] of households.entries()) {
    const { error: parkError } = await supabase
      .from("households")
      .update({ rank: `~${index}` })
      .eq("id", household.id)
      .eq("wedding_id", wedding.id);
    if (parkError) return fail(`Rebalance failed partway: ${parkError.message}`);
  }

  for (const [index, household] of households.entries()) {
    const { error: writeError } = await supabase
      .from("households")
      .update({ rank: fresh[index]! })
      .eq("id", household.id)
      .eq("wedding_id", wedding.id);
    if (writeError) return fail(`Rebalance failed partway: ${writeError.message}`);
  }

  revalidatePath("/guests/rank");
  return ok({ rewritten: households.length });
}

/** Whether the list is worth rebalancing, so the UI can offer it. */
export async function ranksNeedRebalance(): Promise<boolean> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data } = await supabase
    .from("households")
    .select("rank")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null);
  return needsRebalance((data ?? []).map((h) => h.rank));
}
