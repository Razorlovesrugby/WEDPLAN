"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { cleanSpecs, dollarsToMinor, itemSchema, storeFromUrl } from "@/lib/registry/items";
import { isRegistryPairing, isRegistryPalette } from "@/lib/registry/look";
import { claimStatusPatch, isClaimStatus } from "@/lib/registry/status";
import { fail, ok, type ActionResult } from "./result";

/**
 * The couple's side of the registry (spec 36).
 *
 * Every write here runs under the signed-in planner's session, so RLS is what
 * scopes it to their wedding; `wedding_id` is also set explicitly from
 * `requireWedding()` and never taken from the form. The visitor's side — the
 * claim itself — is `registry-public.ts`, and is the only place a stranger can
 * write anything.
 */

function revalidateRegistry(): void {
  revalidatePath("/gifts", "layout");
  revalidatePath("/");
}

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optionalId = z.string().uuid().nullable().optional().transform((v) => v ?? null);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  enabled: z.boolean(),
  open: z.boolean(),
  title: optionalText(120),
  intro: optionalText(600),
  hero_asset_id: optionalId,
  thanks_text: optionalText(1500),
  thanks_asset_id: optionalId,
  no_gifts_line: optionalText(300),
  show_prices: z.boolean(),
  show_taken: z.boolean(),
  show_funds: z.boolean(),
  disclosure_on: z.boolean(),
  disclosure_text: optionalText(300),
  palette: z.string().refine(isRegistryPalette, "Pick one of the palettes"),
  type_pairing: z.string().refine(isRegistryPairing, "Pick one of the pairings"),
});

export async function saveRegistrySettings(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = settingsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_settings")
    .upsert({ wedding_id: wedding.id, ...parsed.data }, { onConflict: "wedding_id" });
  if (error) return fail(error.message);
  revalidateRegistry();
  return ok(undefined);
}

/** Opening the Claims tab clears "N new claims". */
export async function markClaimsViewed(): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_settings")
    .upsert(
      { wedding_id: wedding.id, last_viewed_claims_at: new Date().toISOString() },
      { onConflict: "wedding_id" },
    );
  if (error) return fail(error.message);
  revalidatePath("/");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Delivery address — its own table, shown only after a claim
// ---------------------------------------------------------------------------

const shippingSchema = z.object({
  recipient_name: optionalText(120),
  line1: optionalText(160),
  line2: optionalText(160),
  city: optionalText(100),
  region: optionalText(100),
  postcode: optionalText(20),
  country: z.string().trim().min(1).max(100).default("New Zealand"),
  courier_note: optionalText(300),
});

export async function saveRegistryShipping(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = shippingSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_shipping")
    .upsert({ wedding_id: wedding.id, ...parsed.data }, { onConflict: "wedding_id" });
  if (error) return fail(error.message);
  revalidateRegistry();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function saveRegistryItem(fields: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = itemSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const input = parsed.data;

  // A price field that is filled but unreadable is an error to show, not a
  // silent null: the owner would otherwise think it saved.
  const typedPrice = input.price === null || input.price === undefined ? "" : String(input.price).trim();
  const price_minor = dollarsToMinor(input.price);
  if (typedPrice !== "" && price_minor === null) {
    return fail("Some fields need fixing", { price: ["Enter a price like 120 or 119.50"] });
  }

  const supabase = await createClient();
  const row = {
    wedding_id: wedding.id,
    title: input.title,
    url: input.url,
    store: storeFromUrl(input.url),
    image_asset_id: input.image_asset_id ?? null,
    price_minor,
    note: input.note,
    quantity: input.quantity,
    specs: cleanSpecs(input.specs),
    ship_note: input.ship_note,
    starred: input.starred,
    hidden: input.hidden,
  };

  let id = input.id;
  if (id) {
    const { error } = await supabase.from("registry_items").update(row).eq("wedding_id", wedding.id).eq("id", id);
    if (error) return fail(error.message);
  } else {
    // New items go to the end.
    const { data: last } = await supabase
      .from("registry_items")
      .select("sort_order")
      .eq("wedding_id", wedding.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("registry_items")
      .insert({ ...row, sort_order: (last?.sort_order ?? -1) + 1 })
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "Could not save that item");
    id = data.id;
  }

  // Tags: replace the set. The composite foreign key refuses a tag from another
  // wedding, so a forged id fails here rather than leaking across tenants.
  const del = await supabase.from("registry_item_tags").delete().eq("wedding_id", wedding.id).eq("item_id", id);
  if (del.error) return fail(del.error.message);
  if (input.tag_ids.length > 0) {
    const ins = await supabase
      .from("registry_item_tags")
      .insert(input.tag_ids.map((tag_id) => ({ item_id: id as string, tag_id, wedding_id: wedding.id })));
    if (ins.error) return fail(ins.error.message);
  }

  revalidateRegistry();
  return ok({ id });
}

/**
 * Soft delete. A claim may point at the item, and what was claimed has to stay
 * readable on the Claims tab, so the row stays and the page stops showing it.
 */
export async function deleteRegistryItem(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("wedding_id", wedding.id)
    .eq("id", z.string().uuid().parse(id));
  if (error) return fail(error.message);
  revalidateRegistry();
  return ok(undefined);
}

export async function reorderRegistryItems(ids: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.array(z.string().uuid()).max(500).safeParse(ids);
  if (!parsed.success) return fail("That order couldn't be saved");

  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.map((id, index) =>
      supabase.from("registry_items").update({ sort_order: index }).eq("wedding_id", wedding.id).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(failed.error.message);
  revalidateRegistry();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

const tagName = z.string().trim().min(1, "Give the tag a name").max(40);

/** Creating a tag that exists (ignoring case) returns the existing one. */
export async function createRegistryTag(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  const wedding = await requireWedding();
  const parsed = tagName.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That name won't do");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("registry_tags")
    .select("id, name")
    .eq("wedding_id", wedding.id)
    .ilike("name", parsed.data.replace(/[%_\\]/g, "\\$&"))
    .maybeSingle();
  if (existing) return ok(existing);

  const { data, error } = await supabase
    .from("registry_tags")
    .insert({ wedding_id: wedding.id, name: parsed.data })
    .select("id, name")
    .single();
  if (error || !data) return fail(error?.message ?? "Could not add that tag");
  revalidateRegistry();
  return ok(data);
}

export async function renameRegistryTag(id: string, name: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = tagName.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That name won't do");
  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_tags")
    .update({ name: parsed.data })
    .eq("wedding_id", wedding.id)
    .eq("id", z.string().uuid().parse(id));
  if (error) return fail(error.code === "23505" ? "You already have a tag with that name" : error.message);
  revalidateRegistry();
  return ok(undefined);
}

export async function deleteRegistryTag(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_tags")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", z.string().uuid().parse(id));
  if (error) return fail(error.message);
  revalidateRegistry();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Claims — the couple's side
// ---------------------------------------------------------------------------

/**
 * Move a claim to a stage (see `claimStatusPatch` for what that writes).
 */
export async function setClaimStatus(claimId: string, status: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!isClaimStatus(status)) return fail("That isn't a stage");

  const patch = claimStatusPatch(status, new Date().toISOString());

  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_claims")
    .update(patch)
    .eq("wedding_id", wedding.id)
    .eq("id", z.string().uuid().parse(claimId));
  if (error) return fail(error.message);
  revalidateRegistry();
  return ok(undefined);
}

/** The couple may release any claim. It is soft: the row stays, and the unit goes back on the page. */
export async function releaseClaimAsCouple(claimId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("registry_claims")
    .update({ released_at: new Date().toISOString() })
    .eq("wedding_id", wedding.id)
    .eq("id", z.string().uuid().parse(claimId))
    .is("released_at", null);
  if (error) return fail(error.message);
  revalidateRegistry();
  return ok(undefined);
}
