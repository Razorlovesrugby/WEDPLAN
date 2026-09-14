"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { needsRebalance, rankBetween, rankSequence } from "@/lib/rank";
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
 * The cut line is a stored rank on the wedding, not a flag on each household.
 * Moving it re-tiers the entire waitlist with no write to households at all.
 */
export async function setCutLine(
  householdId: string | null,
  which: "a" | "b",
): Promise<ActionResult> {
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

  // Written as a branch rather than a computed key: a computed key widens to
  // a string index signature and loses the column types entirely.
  const patch = which === "a" ? { cut_rank: rank } : { tier_b_rank: rank };
  const { error } = await supabase.from("weddings").update(patch).eq("id", wedding.id);

  if (error) return fail(error.message);

  revalidatePath("/guests/rank");
  revalidatePath("/guests");
  revalidatePath("/");
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
