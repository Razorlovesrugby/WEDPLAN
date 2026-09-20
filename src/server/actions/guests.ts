"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { rankAfter, rankFirst } from "@/lib/rank";
import { isUniqueViolation } from "@/lib/db-errors";
import { isValidHouseholdSlug } from "@/lib/site/household-slug";
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

/**
 * Rename the readable half of a household's address (spec 21 §4).
 *
 * Three rules, and the first two are why this is its own action rather than a
 * field on `updateHousehold`:
 *
 *   The suffix is never touched. It is the credential; changing it here would
 *   mean a typo fix silently invalidated an invitation that is already in the
 *   post. `reissueInvitation` is the deliberate way to change it.
 *
 *   The old address is kept, in `household_slug_aliases`, and keeps resolving.
 *   Without that, "editable" would only be true before anybody had the link.
 *
 *   Renaming the household does not rename the address. The editor offers the
 *   new derivation as a suggestion; taking it is this action, by hand.
 */
export async function setHouseholdSlug(
  householdId: string,
  rawSlug: string,
): Promise<ActionResult<{ slug: string }>> {
  const wedding = await requireWedding();
  const slug = rawSlug.trim().toLowerCase();

  if (!isValidHouseholdSlug(slug)) {
    return fail(
      "That address can only use lowercase letters, numbers and hyphens — and can't be one of the app's own names.",
      { slug: ["Lowercase letters, numbers and hyphens, 2–64 characters"] },
    );
  }

  const supabase = await createClient();
  const { data: household, error: readError } = await supabase
    .from("households")
    .select("slug, slug_suffix")
    .eq("id", householdId)
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError) return fail(readError.message);
  if (!household) return fail("That household no longer exists");
  if (household.slug === slug) return ok({ slug });

  const { error } = await supabase
    .from("households")
    .update({ slug })
    .eq("id", householdId)
    .eq("wedding_id", wedding.id);

  if (error) {
    // The unique index is on (wedding_id, slug, slug_suffix), so this only
    // fires when another household holds the same pair — rare enough that
    // redrawing behind the planner's back would be more confusing than saying
    // so.
    if (isUniqueViolation(error)) {
      return fail("Another household already has that exact address. Try a different name.");
    }
    return fail(error.message);
  }

  // Recorded after the rename succeeds: an alias for an address the household
  // never gave up would send people to the wrong page.
  const { error: aliasError } = await supabase.from("household_slug_aliases").insert({
    wedding_id: wedding.id,
    household_id: householdId,
    slug: household.slug,
    slug_suffix: household.slug_suffix,
  });

  // A failed alias insert is not a failed rename. The new address works; the
  // old one stops working, which is the pre-spec-21 behaviour rather than a
  // broken state — so it is reported, not rolled back.
  if (aliasError && !isUniqueViolation(aliasError)) {
    return fail(
      `The address is now ${slug}, but the old one could not be kept working: ${aliasError.message}`,
    );
  }

  revalidatePath("/guests");
  revalidatePath("/invitations");
  revalidatePath(`/households/${householdId}`);
  return ok({ slug });
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
// Moving guests between households
// ---------------------------------------------------------------------------

/**
 * Reassigns one or more guests to a different household. No schema change
 * backs this — `guests.household_id` is the only thing that changes, and
 * every derived number (head count, seats, tier, RSVP state) is already
 * computed live from it in `v_households` and friends, so nothing else needs
 * writing. The composite foreign key on `(household_id, wedding_id)` is what
 * actually stops a guest landing in another wedding's household; the lookup
 * below exists to turn that into a message instead of a raw constraint error.
 *
 * Deliberately does not touch `plus_one_for` (moving a +1 away from who they
 * are the +1 of is left for the planner to notice, not decided for them) and
 * does not delete a household a move happens to empty out.
 */
export async function moveGuests(
  guestIds: string[],
  targetHouseholdId: string,
): Promise<ActionResult<{ moved: number }>> {
  const wedding = await requireWedding();
  const parsed = z
    .object({
      guestIds: z.array(z.string().uuid()).min(1).max(1000),
      targetHouseholdId: z.string().uuid(),
    })
    .safeParse({ guestIds, targetHouseholdId });
  if (!parsed.success) return fail("Nothing selected");

  const supabase = await createClient();

  const { data: target, error: targetError } = await supabase
    .from("households")
    .select("id")
    .eq("id", parsed.data.targetHouseholdId)
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (targetError) return fail(targetError.message);
  if (!target) return fail("That household could not be found");

  const { data: origins } = await supabase
    .from("guests")
    .select("household_id")
    .in("id", parsed.data.guestIds)
    .eq("wedding_id", wedding.id);

  const { data, error } = await supabase
    .from("guests")
    .update({ household_id: parsed.data.targetHouseholdId })
    .in("id", parsed.data.guestIds)
    .eq("wedding_id", wedding.id)
    .select("id");

  if (error) return fail(error.message);

  revalidatePath("/guests");
  revalidatePath("/guests/rank");
  revalidatePath(`/households/${parsed.data.targetHouseholdId}`);
  for (const origin of new Set((origins ?? []).map((g) => g.household_id))) {
    revalidatePath(`/households/${origin}`);
  }
  for (const guestId of parsed.data.guestIds) revalidatePath(`/guests/${guestId}`);

  return ok({ moved: data?.length ?? 0 });
}

export async function moveGuest(guestId: string, targetHouseholdId: string): Promise<ActionResult> {
  const result = await moveGuests([guestId], targetHouseholdId);
  return result.ok ? ok(undefined) : result;
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
