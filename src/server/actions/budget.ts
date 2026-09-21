"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { createList, addItem } from "./lists";
import { suggestAllocations } from "@/lib/budget-allocations";
import { fail, ok, type ActionResult } from "./result";
import type { BudgetItemRow, PaymentRow } from "@/lib/types/database";

/**
 * Budget management, spec 6. Every write is scoped to the current session's
 * wedding, same convention as src/server/actions/lists.ts — RLS would refuse
 * a cross-wedding write regardless, but this keeps intent legible at the
 * call site.
 */

function revalidateBudget() {
  revalidatePath("/budget");
  revalidatePath("/");
  revalidatePath("/guests/rank");
  revalidatePath("/timeline");
  revalidatePath("/calendar");
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

const optionalUuid = () =>
  z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

const minorUnits = () => z.coerce.number().int().min(0);

/**
 * One of estimated/quoted/contracted. Blank *and* a typed 0 both store null:
 * the item editor renders a stored 0 as an empty field, so the two states are
 * indistinguishable to the planner, and a stored 0 used to outrank every real
 * number below it in `computed_current`'s ladder (0021, spec 19 §14). A line
 * that genuinely costs nothing is recorded by leaving the field empty.
 */
const optionalSnapshot = () =>
  z
    .union([minorUnits(), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" || v === 0 ? null : v));
const optionalMinorUnits = () =>
  z
    .union([minorUnits(), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

/** Decimals allowed (spec 6.1, section 4, decision 2) — "2.5 hours", "40.5 metres", not just whole counts. */
const optionalQuantity = () =>
  z
    .union([z.coerce.number().min(0), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

/**
 * A percentage of a budget (spec 19). Blank clears it — an unallocated
 * category or line is a first-class state, not an error, so "" is a real
 * answer rather than a validation failure.
 */
const optionalPercent = () =>
  z
    .union([z.coerce.number().min(0, "0% or more").max(100, "100% or less"), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

// ---------------------------------------------------------------------------
// The overall budget, and category allocations (spec 19)
// ---------------------------------------------------------------------------

/**
 * Its own action rather than a field on updateWeddingSettings: that action
 * validates the whole settings form at once (name, timezone and reminder
 * window all required), so it can't take a partial write from /budget. Same
 * reasoning setCapacity/setCutLine live in rank.ts rather than settings.ts —
 * see that file's header comment.
 */
export async function setTotalBudget(amountMinor: number | string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = optionalMinorUnits().safeParse(amountMinor === null ? "" : amountMinor);
  if (!parsed.success) return fail("That doesn't look like an amount");

  const supabase = await createClient();
  const { error } = await supabase
    .from("weddings")
    .update({ total_budget: parsed.data ?? null })
    .eq("id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

export async function setCategoryAllocation(
  categoryId: string,
  pct: number | string | null,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = optionalPercent().safeParse(pct === null ? "" : pct);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That doesn't look like a percentage");

  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_categories")
    .update({ allocation_pct: parsed.data ?? null })
    .eq("id", categoryId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

/**
 * Fills the categories that have no percentage yet from the starter table
 * (spec 19 section 8), leaving every allocated category — and every category
 * the table doesn't recognise — untouched. The matching itself is pure and
 * unit-tested in src/lib/budget-allocations.ts.
 */
export async function applySuggestedAllocations(): Promise<ActionResult<{ applied: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: categories, error: readError } = await supabase
    .from("budget_categories")
    .select("id, name, allocation_pct")
    .eq("wedding_id", wedding.id);
  if (readError) return fail(readError.message);

  const suggestions = suggestAllocations(categories ?? []);
  for (const suggestion of suggestions) {
    const { error } = await supabase
      .from("budget_categories")
      .update({ allocation_pct: suggestion.pct })
      .eq("id", suggestion.id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }

  revalidateBudget();
  return ok({ applied: suggestions.length });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const UNCATEGORISED = "Uncategorised";

async function findOrCreateUncategorised(weddingId: string): Promise<string> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("budget_categories")
    .select("id")
    .eq("wedding_id", weddingId)
    .eq("name", UNCATEGORISED)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("budget_categories")
    .insert({ wedding_id: weddingId, name: UNCATEGORISED })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the ${UNCATEGORISED} category: ${error.message}`);
  return created.id;
}

export async function createBudgetCategory(name: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = z.string().trim().min(1, "Give the category a name").max(120).safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid name");

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("budget_categories")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("budget_categories")
    .insert({ wedding_id: wedding.id, name: parsed.data, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidateBudget();
  return ok({ id: data.id });
}

export async function renameBudgetCategory(categoryId: string, name: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.string().trim().min(1, "Give the category a name").max(120).safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid name");

  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_categories")
    .update({ name: parsed.data })
    .eq("id", categoryId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

/**
 * Allowed even with items still in the category (spec 6, section 10,
 * decision 6) — they fall back to an auto-created "Uncategorised" category
 * for the wedding rather than blocking the delete.
 */
export async function deleteBudgetCategory(categoryId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("budget_categories")
    .select("id, name")
    .eq("id", categoryId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (!category) return fail("That category no longer exists");

  if (category.name !== UNCATEGORISED) {
    const uncategorisedId = await findOrCreateUncategorised(wedding.id);
    if (uncategorisedId !== categoryId) {
      const { error: moveError } = await supabase
        .from("budget_items")
        .update({ category_id: uncategorisedId })
        .eq("category_id", categoryId)
        .eq("wedding_id", wedding.id);
      if (moveError) return fail(moveError.message);
    }
  }

  const { error } = await supabase
    .from("budget_categories")
    .delete()
    .eq("id", categoryId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const budgetItemFields = z.object({
  category_id: z.string().uuid(),
  event_id: optionalUuid(),
  label: z.string().trim().min(1, "Give the line a name").max(200),
  vendor_name: optionalText(200),
  /**
   * Set when the name came from picking a vendor record (spec 8 §4).
   * An empty string means "plain text" — the planner typed a name that
   * belongs to no vendor, which stays a legitimate thing to do.
   */
  vendor_id: z
    .string()
    .uuid()
    .or(z.literal(""))
    .optional()
    .transform((v) => (v ? v : null)),
  quantity_basis: z.enum(["flat", "per_adult", "per_child", "per_seat", "consumption", "manual"]),
  unit_price: optionalMinorUnits(),
  estimated: optionalSnapshot(),
  quoted: optionalSnapshot(),
  contracted: optionalSnapshot(),
  notes: optionalText(2000),
  /** Multiplier for `manual` (spec 6.1) — unused for every other basis. */
  quantity: optionalQuantity(),
  /** Whether the line's money figures were entered incl. or excl. GST (spec 18). */
  gst_treatment: z.enum(["inclusive", "exclusive"]),
  /** This line's share of its category's target (spec 19) — a planning target, never written into `estimated`. */
  allocation_pct: optionalPercent(),
});

export async function createBudgetItem(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = budgetItemFields.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  if (parsed.data.quantity_basis === "consumption" && parsed.data.unit_price) {
    return fail("A consumption item is priced by its components, not a unit price");
  }
  // Defaults to 1 when left blank (spec 6.1, section 4, decision 3) — a
  // forgotten quantity still produces a real total (the unit price on its
  // own) rather than zero.
  const quantity =
    parsed.data.quantity_basis === "manual" ? (parsed.data.quantity ?? 1) : parsed.data.quantity;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_items")
    .insert({ ...parsed.data, quantity, wedding_id: wedding.id })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidateBudget();
  return ok({ id: data.id });
}

const budgetItemPatch = budgetItemFields.partial();

/**
 * Also what detects the contracted null -> non-null transition (spec 6,
 * section 6): the caller checks `promptFollowUp` on a successful result and
 * shows the one-line follow-up confirm if it's true.
 */
export async function updateBudgetItem(
  itemId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult<{ promptFollowUp: boolean }>> {
  const wedding = await requireWedding();
  const parsed = budgetItemPatch.safeParse(patch);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("budget_items")
    .select("contracted, contracted_task_created, quantity_basis")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!current) return fail("That line no longer exists");

  const update: Partial<BudgetItemRow> = { ...parsed.data };

  // Defaults to 1 when left blank (spec 6.1, section 4, decision 3), for a
  // line that either is or is becoming `manual`.
  const effectiveBasis = parsed.data.quantity_basis ?? current.quantity_basis;
  if (effectiveBasis === "manual" && "quantity" in parsed.data && parsed.data.quantity === null) {
    update.quantity = 1;
  }

  const { error } = await supabase.from("budget_items").update(update).eq("id", itemId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  const promptFollowUp =
    "contracted" in parsed.data &&
    current.contracted === null &&
    parsed.data.contracted !== null &&
    parsed.data.contracted !== undefined &&
    !current.contracted_task_created;

  revalidateBudget();
  return ok({ promptFollowUp });
}

export async function deleteBudgetItem(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("budget_items").delete().eq("id", itemId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Consumption components
// ---------------------------------------------------------------------------

const componentFields = z.object({
  label: z.string().trim().min(1, "Give the component a name").max(120),
  guest_basis: z.enum(["per_adult", "per_seat"]),
  servings_per_guest_per_hour: z.coerce.number().min(0),
  duration_hours: z.coerce.number().min(0),
  price_per_serving: minorUnits(),
  wastage_buffer_pct: z.coerce.number().min(0).max(5).optional(),
});

export async function addConsumptionComponent(
  budgetItemId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = componentFields.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("consumption_components")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .eq("budget_item_id", budgetItemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("consumption_components")
    .insert({
      ...parsed.data,
      wedding_id: wedding.id,
      budget_item_id: budgetItemId,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidateBudget();
  return ok({ id: data.id });
}

export async function updateConsumptionComponent(
  componentId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = componentFields.partial().safeParse(patch);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("consumption_components")
    .update(parsed.data)
    .eq("id", componentId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

export async function removeConsumptionComponent(componentId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("consumption_components")
    .delete()
    .eq("id", componentId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

const paymentFields = z.object({
  due_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  amount: minorUnits(),
  reference: optionalText(200),
  paid_by: optionalText(200),
  notes: optionalText(2000),
});

export async function recordPayment(
  budgetItemId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = paymentFields.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      ...parsed.data,
      wedding_id: wedding.id,
      budget_item_id: budgetItemId,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidateBudget();
  return ok({ id: data.id });
}

export async function updatePayment(paymentId: string, patch: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = paymentFields.partial().safeParse(patch);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();

  const update: Partial<PaymentRow> = { ...parsed.data };

  const { error } = await supabase.from("payments").update(update).eq("id", paymentId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

export async function markPaymentPaid(paymentId: string, paidAt: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("payments")
    .update({ paid_at: paidAt })
    .eq("id", paymentId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("payments").delete().eq("id", paymentId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The contracting prompt (spec 6, section 6)
// ---------------------------------------------------------------------------

const FOLLOW_UPS_LIST_TITLE = "Budget follow-ups";

async function findOrCreateFollowUpsList(weddingId: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("lists")
    .select("id")
    .eq("wedding_id", weddingId)
    .eq("title", FOLLOW_UPS_LIST_TITLE)
    .is("archived_at", null)
    .maybeSingle();
  if (existing) return ok({ id: existing.id });
  return createList({ title: FOLLOW_UPS_LIST_TITLE });
}

/**
 * Accepting the prompt: adds a plain list_items row to a wedding-level
 * "Budget follow-ups" list, created lazily the first time it's needed —
 * exactly spec 1's other lazily-created lists. No auto-filled due date; the
 * planner sets one if they want it in the reminders digest.
 */
export async function confirmBudgetFollowUp(budgetItemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: item, error: readError } = await supabase
    .from("budget_items")
    .select("label, vendor_name")
    .eq("id", budgetItemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!item) return fail("That line no longer exists");

  const list = await findOrCreateFollowUpsList(wedding.id);
  if (!list.ok) return list;

  const title = `Confirm final numbers with ${item.vendor_name || item.label}`;
  const added = await addItem(list.data.id, { title });
  if (!added.ok) return added;

  const { error } = await supabase
    .from("budget_items")
    .update({ contracted_task_created: true })
    .eq("id", budgetItemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  revalidatePath("/lists");
  revalidatePath(`/lists/${list.data.id}`);
  return ok(undefined);
}

/** Declining the prompt: no list write, just "don't ask again for this line." */
export async function dismissBudgetFollowUp(budgetItemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_items")
    .update({ contracted_task_created: true })
    .eq("id", budgetItemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateBudget();
  return ok(undefined);
}
