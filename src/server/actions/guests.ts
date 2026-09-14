"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { rankAfter, rankFirst } from "@/lib/rank";
import { fail, ok, type ActionResult } from "./result";

/**
 * Every action re-reads the current wedding from the session rather than
 * trusting a wedding_id from the client, and every query is constrained to
 * it. RLS would refuse a cross-wedding write anyway; this makes the intent
 * legible at the call site instead of relying on the database to be the only
 * thing standing in the way.
 */

/**
 * An optional text field, as a form submits it.
 *
 * A blank string means the user cleared the field, which in the database is
 * null. An absent key means the field was not part of this submission at all
 * and must be left alone. Those two are different, and collapsing them is how
 * a partial update quietly wipes a column nobody touched — so the distinction
 * is encoded here rather than swept up after parsing.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

const guestFields = z.object({
  first_name: z.string().trim().min(1, "A first name is required").max(80),
  last_name: optionalText(80),
  preferred_name: optionalText(80),
  email: z
    .union([z.string().trim().email("That doesn't look like an email"), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  phone: optionalText(40),
  age_band: z.enum(["adult", "child", "infant"]).default("adult"),
  side: z
    .union([z.enum(["partner_a", "partner_b", "both", "other"]), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  dietary: optionalText(500),
  accessibility: optionalText(500),
  notes: optionalText(2000),
});

export async function updateGuest(
  guestId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = guestFields.partial().safeParse(patch);
  if (!parsed.success) {
    return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("guests")
    .update(parsed.data)
    .eq("id", guestId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);

  revalidatePath("/guests");
  revalidatePath(`/guests/${guestId}`);
  return ok(undefined);
}

export async function createGuest(
  householdId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = guestFields.safeParse(fields);
  if (!parsed.success) {
    return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guests")
    .insert({
      ...parsed.data,
      wedding_id: wedding.id,
      household_id: householdId,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/guests");
  revalidatePath(`/households/${householdId}`);
  return ok({ id: data.id });
}

/**
 * Soft delete. A guest cut after invitations went out must stay
 * reconstructable — "who did we actually invite" is a question that gets
 * asked, and a hard delete makes it unanswerable.
 */
export async function removeGuest(guestId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("guests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", guestId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);

  revalidatePath("/guests");
  return ok(undefined);
}

const householdFields = z.object({
  display_name: z.string().trim().min(1, "Give the household a name").max(120),
  address: optionalText(500),
  notes: optionalText(2000),
});

/**
 * New households land at the bottom of the ranking, below the cut line.
 * That is the safe default: somebody you have just thought of should not
 * silently push someone else off the list.
 */
export async function createHousehold(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = householdFields.safeParse(fields);
  if (!parsed.success) {
    return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("households")
    .select("rank")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("households")
    .insert({
      ...parsed.data,
      wedding_id: wedding.id,
      rank: last ? rankAfter(last.rank) : rankFirst(),
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/guests");
  revalidatePath("/guests/rank");
  return ok({ id: data.id });
}

export async function updateHousehold(
  householdId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = householdFields
    .partial()
    .extend({ reminders_muted: z.boolean().optional() })
    .safeParse(patch);
  if (!parsed.success) {
    return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("households")
    .update(parsed.data)
    .eq("id", householdId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);

  revalidatePath("/guests");
  revalidatePath(`/households/${householdId}`);
  return ok(undefined);
}

export async function removeHousehold(householdId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Guests go too, or they become orphans in every count on the dashboard.
  const { error: guestError } = await supabase
    .from("guests")
    .update({ deleted_at: now })
    .eq("household_id", householdId)
    .eq("wedding_id", wedding.id);
  if (guestError) return fail(guestError.message);

  const { error } = await supabase
    .from("households")
    .update({ deleted_at: now })
    .eq("id", householdId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePath("/guests");
  revalidatePath("/guests/rank");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function createTag(name: string, colour: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(40),
      colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value"),
    })
    .safeParse({ name, colour });
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .insert({ ...parsed.data, wedding_id: wedding.id })
    .select("id")
    .single();

  if (error) {
    // The unique index is on lower(name): a duplicate is a user mistake, not
    // a system failure, so say so in words rather than leaking the constraint.
    if (error.code === "23505") return fail(`There is already a tag called "${name}"`);
    return fail(error.message);
  }

  revalidatePath("/guests");
  return ok({ id: data.id });
}

export async function setGuestTags(
  guestIds: string[],
  tagId: string,
  action: "add" | "remove",
): Promise<ActionResult<{ affected: number }>> {
  const wedding = await requireWedding();
  const parsed = z
    .object({ guestIds: z.array(z.string().uuid()).min(1).max(1000), tagId: z.string().uuid() })
    .safeParse({ guestIds, tagId });
  if (!parsed.success) return fail("Nothing selected");

  const supabase = await createClient();

  if (action === "remove") {
    const { error } = await supabase
      .from("guest_tags")
      .delete()
      .eq("wedding_id", wedding.id)
      .eq("tag_id", parsed.data.tagId)
      .in("guest_id", parsed.data.guestIds);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("guest_tags").upsert(
      parsed.data.guestIds.map((guest_id) => ({
        wedding_id: wedding.id,
        guest_id,
        tag_id: parsed.data.tagId,
      })),
      { onConflict: "guest_id,tag_id", ignoreDuplicates: true },
    );
    if (error) return fail(error.message);
  }

  revalidatePath("/guests");
  return ok({ affected: parsed.data.guestIds.length });
}
