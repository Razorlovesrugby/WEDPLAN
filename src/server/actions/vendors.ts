"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { VENDOR_STAGES } from "@/lib/vendors";
import { fail, ok, type ActionResult } from "./result";

/**
 * Vendor writes (spec 8 §7).
 *
 * Two rules from the spec hold this file together.
 *
 * **Nothing here touches money.** A vendor has no amount columns; every figure
 * on a vendor page is read from spec 6's views. The only money-adjacent write
 * is setting `budget_items.vendor_id`, which changes which vendor a line
 * belongs to and never what it costs.
 *
 * **No automatic matching, ever.** The backfill links budget lines by EXACT
 * string equality and only when a human presses the button. This app owns a
 * trigram matcher and deliberately does not use it here.
 */

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));

const nameSchema = z.string().trim().min(1, "Give them a name").max(200);

function revalidateVendors(id?: string) {
  revalidatePath("/vendors");
  revalidatePath("/vendors/contact-sheet");
  if (id) revalidatePath(`/vendors/${id}`);
  // The budget reads the vendor's live name through v_budget_items, so a
  // rename has to invalidate it too.
  revalidatePath("/budget");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createVendorCategory(name: string): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().trim().min(1, "Give it a name").max(120).safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("vendor_categories")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("vendor_categories")
    .insert({
      wedding_id: wedding.id,
      name: parsed.data,
      sort_order: (last?.sort_order ?? 0) + 10,
    })
    .select("id")
    .single();

  // The unique (wedding_id, name) is what produces this, and saying so beats
  // "duplicate key value violates unique constraint".
  if (error) return fail(`There is already a category called "${parsed.data}".`);
  revalidateVendors();
  return ok({ id: data.id });
}

export async function deleteVendorCategory(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  // Vendors in it keep existing and become uncategorised — the FK is
  // `set null (category_id)`.
  const { error } = await supabase
    .from("vendor_categories")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

const vendorSchema = z.object({
  name: nameSchema,
  category_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
  stage: z.enum(VENDOR_STAGES).optional(),
  website: optionalText,
  email: optionalText,
  phone: optionalText,
  address: optionalText,
  notes: optionalText,
  source: optionalText,
  recommended_by: optionalText,
  gut_score: z
    .union([z.coerce.number().int().min(1).max(5), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export async function createVendor(fields: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = vendorSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("vendors")
    .insert({ ...parsed.data, wedding_id: wedding.id })
    .select("id")
    .single();

  if (error) return fail(error.message);
  revalidateVendors();
  return ok({ id: data.id });
}

export async function updateVendor(id: string, fields: unknown): Promise<ActionResult> {
  const parsed = vendorSchema.partial().safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update(parsed.data)
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors(id);
  return ok(undefined);
}

/** The reversible control, and the one a planner should reach for. */
export async function archiveVendor(id: string): Promise<ActionResult> {
  return setArchived(id, new Date().toISOString());
}

export async function restoreVendor(id: string): Promise<ActionResult> {
  return setArchived(id, null);
}

async function setArchived(id: string, at: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ archived_at: at })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors(id);
  return ok(undefined);
}

/**
 * What the delete confirm has to say before it destroys anything.
 *
 * Same posture `removeQuestion` takes over `rsvp_answers`: notes are the
 * reason the vendor record existed, so the planner is told how many they are
 * about to lose rather than finding out afterwards.
 */
export async function vendorDeletionImpact(
  id: string,
): Promise<ActionResult<{ contacts: number; notes: number; budgetLines: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const [contacts, notes, lines] = await Promise.all([
    supabase
      .from("vendor_contacts")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", wedding.id)
      .eq("vendor_id", id),
    supabase
      .from("vendor_notes")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", wedding.id)
      .eq("vendor_id", id),
    supabase
      .from("budget_items")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", wedding.id)
      .eq("vendor_id", id),
  ]);

  return ok({
    contacts: contacts.count ?? 0,
    notes: notes.count ?? 0,
    budgetLines: lines.count ?? 0,
  });
}

export async function deleteVendor(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // Contacts and notes cascade — they have no meaning without the vendor.
  // Budget lines do NOT: `vendor_id` nulls and the snapshot name stays, so
  // the line still reads "The Old Barn" with its numbers and its payment
  // schedule intact. Deleting a vendor must never delete money.
  const { error } = await supabase
    .from("vendors")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  id: z.string().uuid().optional(),
  vendor_id: z.string().uuid(),
  name: nameSchema,
  role: optionalText,
  email: optionalText,
  phone: optionalText,
  notes: optionalText,
});

export async function saveVendorContact(fields: unknown): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const { id, ...values } = parsed.data;

  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = id
    ? await supabase
        .from("vendor_contacts")
        .update(values)
        .eq("wedding_id", wedding.id)
        .eq("id", id)
    : await supabase.from("vendor_contacts").insert({ ...values, wedding_id: wedding.id });

  if (error) return fail(error.message);
  revalidateVendors(parsed.data.vendor_id);
  return ok(undefined);
}

export async function removeVendorContact(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_contacts")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors();
  return ok(undefined);
}

/**
 * Make one contact primary, clearing whoever held it.
 *
 * Both writes, in this order, because `vendor_contacts_one_primary` is a
 * partial unique index: setting the new one first would collide with the old
 * one and fail. Doing it in two statements means a moment with no primary
 * rather than a moment with two, which is the safe direction — `v_vendors`
 * left-joins on it, so no primary renders as no contact, and two primaries
 * would duplicate the vendor on `/vendors`.
 */
export async function setPrimaryVendorContact(
  vendorId: string,
  contactId: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("vendor_contacts")
    .update({ is_primary: false })
    .eq("wedding_id", wedding.id)
    .eq("vendor_id", vendorId)
    .eq("is_primary", true);

  if (clearError) return fail(clearError.message);

  const { error } = await supabase
    .from("vendor_contacts")
    .update({ is_primary: true })
    .eq("wedding_id", wedding.id)
    .eq("id", contactId);

  if (error) return fail(error.message);
  revalidateVendors(vendorId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addVendorNote(vendorId: string, body: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1, "Write something first").max(4000).safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);

  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const { error } = await supabase.from("vendor_notes").insert({
    wedding_id: wedding.id,
    vendor_id: vendorId,
    body: parsed.data,
    // Stamped from the session rather than typed. A log whose date and author
    // are somebody's job to fill in is a log with neither.
    author_id: auth.user?.id ?? null,
  });

  if (error) return fail(error.message);
  revalidateVendors(vendorId);
  return ok(undefined);
}

export async function updateVendorNote(id: string, body: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1, "A note cannot be empty").max(4000).safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);

  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_notes")
    .update({ body: parsed.data })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors();
  return ok(undefined);
}

export async function toggleVendorNotePin(id: string, pinned: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_notes")
    .update({ pinned })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors();
  return ok(undefined);
}

export async function deleteVendorNote(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_notes")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateVendors();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The budget link
// ---------------------------------------------------------------------------

/**
 * Link a budget line to a vendor, and write the name snapshot.
 *
 * The snapshot is invisible while the link exists — `v_budget_items` prefers
 * the vendor's live name — but it is what stops the line going blank when a
 * vendor is hard-deleted and `vendor_id` nulls (spec 8 §4, reason 3).
 */
export async function linkBudgetItemToVendor(
  itemId: string,
  vendorId: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("name")
    .eq("wedding_id", wedding.id)
    .eq("id", vendorId)
    .maybeSingle();

  if (!vendor) return fail("We couldn't find that vendor.");

  const { error } = await supabase
    .from("budget_items")
    .update({ vendor_id: vendorId, vendor_name: vendor.name })
    .eq("wedding_id", wedding.id)
    .eq("id", itemId);

  if (error) return fail(error.message);
  revalidateVendors(vendorId);
  return ok(undefined);
}

export async function unlinkBudgetItemFromVendor(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // `vendor_name` is left alone: it holds the snapshot, and clearing it would
  // blank a line whose name the planner never typed themselves.
  const { error } = await supabase
    .from("budget_items")
    .update({ vendor_id: null })
    .eq("wedding_id", wedding.id)
    .eq("id", itemId);

  if (error) return fail(error.message);
  revalidateVendors();
  return ok(undefined);
}

/**
 * The backfill button (spec 8 §4).
 *
 * One vendor, then every budget line in this wedding whose `vendor_name`
 * equals that exact string and whose `vendor_id` is null. Exact equality, a
 * human pressing a button, no similarity threshold anywhere.
 */
export async function createVendorFromBudgetLines(
  name: string,
  categoryId: string | null,
): Promise<ActionResult<{ id: string; linked: number }>> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: vendor, error } = await supabase
    .from("vendors")
    .insert({ wedding_id: wedding.id, name: parsed.data, category_id: categoryId })
    .select("id")
    .single();

  if (error) return fail(error.message);

  const { data: linked, error: linkError } = await supabase
    .from("budget_items")
    .update({ vendor_id: vendor.id })
    .eq("wedding_id", wedding.id)
    .eq("vendor_name", parsed.data)
    .is("vendor_id", null)
    .select("id");

  if (linkError) return fail(linkError.message);

  revalidateVendors(vendor.id);
  return ok({ id: vendor.id, linked: (linked ?? []).length });
}

// ---------------------------------------------------------------------------
// The run sheet link (spec 8 Answered, question 10)
// ---------------------------------------------------------------------------

export async function setRunSheetItemVendor(
  itemId: string,
  vendorId: string | null,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("run_sheet_items")
    .update({ vendor_id: vendorId })
    .eq("wedding_id", wedding.id)
    .eq("id", itemId);

  if (error) return fail(error.message);
  revalidatePath("/run-sheet");
  revalidateVendors();
  return ok(undefined);
}
