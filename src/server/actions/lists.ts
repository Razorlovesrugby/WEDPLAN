"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding, getSessionUser } from "@/server/queries/wedding";
import {
  generateTimelineItems,
  parseQuickAdd,
  spawnNextOccurrence,
  type RepeatRule,
  type TemplateSection,
} from "@/lib/lists/generate";
import type { ListItemStatus, ListItemRow, ListKind } from "@/lib/types/database";
import { LIST_COLOR_PALETTE } from "@/lib/list-colors";
import { fail, ok, type ActionResult } from "./result";

/**
 * Every action re-reads the current wedding from the session and scopes every
 * query to it — same convention as src/server/actions/guests.ts. RLS would
 * refuse a cross-wedding write regardless; this keeps the intent legible at
 * the call site.
 */

function revalidateLists(listId?: string) {
  revalidatePath("/lists");
  revalidatePath("/timeline");
  revalidatePath("/calendar");
  revalidatePath("/board");
  revalidatePath("/settings");
  revalidatePath("/");
  if (listId) revalidatePath(`/lists/${listId}`);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v));

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const listColorValues = LIST_COLOR_PALETTE.map((c) => c.value) as [string, ...string[]];

const listFields = z.object({
  title: z.string().trim().min(1, "Give the list a name").max(120),
  // Picker-only, not a free color field — see docs/specs/03-settings-calendar-mobile.md
  // section 7, decision 4, and src/lib/list-colors.ts.
  color: z
    .union([z.enum(listColorValues), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  icon: optionalText(4),
  event_id: z
    .union([z.string().uuid(), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
});

export async function createList(
  fields: Record<string, unknown>,
  kind: ListKind = "generic",
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = listFields.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("lists")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .is("archived_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("lists")
    .insert({ ...parsed.data, kind, wedding_id: wedding.id, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidateLists();
  return ok({ id: data.id });
}

export async function updateList(listId: string, patch: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = listFields.partial().safeParse(patch);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("lists")
    .update(parsed.data)
    .eq("id", listId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists(listId);
  return ok(undefined);
}

export async function archiveList(listId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("lists")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", listId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

/**
 * Copies a checklist template's sections and items into a fresh list.
 * Deliberately refuses the timeline template — that one is date-generated
 * and idempotent, and goes through `generateTimelineTemplate` from
 * `/setup/plan` instead, never through this one-shot copy (spec 1, section
 * 3 and 6).
 */
export async function instantiateTemplate(templateKey: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: template, error: templateError } = await supabase
    .from("list_templates")
    .select("*")
    .eq("key", templateKey)
    .maybeSingle();
  if (templateError) return fail(templateError.message);
  if (!template) return fail("That template no longer exists");
  if (template.kind === "timeline") {
    return fail("Generate the countdown from /setup/plan instead — it needs your wedding date");
  }

  const payload = template.payload as { sections?: { section: string; items: string[] }[] };
  const sections = payload.sections ?? [];

  const { data: list, error: listError } = await supabase
    .from("lists")
    .insert({
      wedding_id: wedding.id,
      title: template.title,
      kind: template.kind,
      template_key: template.key,
    })
    .select("id")
    .single();
  if (listError) return fail(listError.message);

  for (let s = 0; s < sections.length; s++) {
    const section = sections[s]!;
    const { data: sectionRow, error: sectionError } = await supabase
      .from("list_sections")
      .insert({ wedding_id: wedding.id, list_id: list.id, title: section.section, sort_order: s })
      .select("id")
      .single();
    if (sectionError) return fail(sectionError.message);

    const items = section.items.map((title, i) => ({
      wedding_id: wedding.id,
      list_id: list.id,
      section_id: sectionRow.id,
      title,
      sort_order: i,
    }));
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from("list_items").insert(items);
      if (itemsError) return fail(itemsError.message);
    }
  }

  revalidateLists();
  return ok({ id: list.id });
}

/**
 * Idempotent generation of the timeline template: (wedding_id, template_key)
 * on list_items is unique, so re-running this after the wedding date changes
 * updates every existing generated item's due_date rather than duplicating
 * it. Sections are matched by title for the same reason.
 */
export async function generateTimelineTemplate(): Promise<ActionResult<{ listId: string; count: number }>> {
  const wedding = await requireWedding();
  if (!wedding.wedding_date) {
    return fail("Set your wedding date first — the countdown has nothing to count down to");
  }

  const supabase = await createClient();
  const { data: template, error: templateError } = await supabase
    .from("list_templates")
    .select("*")
    .eq("key", "timeline")
    .maybeSingle();
  if (templateError) return fail(templateError.message);
  if (!template) return fail("The countdown template hasn't been seeded yet — run scripts/seed-templates.mjs");

  const payload = template.payload as { sections?: TemplateSection[] };
  const sections = payload.sections ?? [];

  let { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("wedding_id", wedding.id)
    .eq("template_key", "timeline")
    .maybeSingle();

  if (!list) {
    const { data: created, error: createError } = await supabase
      .from("lists")
      .insert({ wedding_id: wedding.id, title: template.title, kind: "timeline", template_key: "timeline" })
      .select("id")
      .single();
    if (createError) return fail(createError.message);
    list = created;
  }
  const listId = list.id;

  const { data: existingSections, error: sectionsReadError } = await supabase
    .from("list_sections")
    .select("id, title")
    .eq("wedding_id", wedding.id)
    .eq("list_id", listId);
  if (sectionsReadError) return fail(sectionsReadError.message);

  const sectionIdByTitle = new Map((existingSections ?? []).map((s) => [s.title, s.id]));
  for (let s = 0; s < sections.length; s++) {
    const title = sections[s]!.section;
    if (sectionIdByTitle.has(title)) continue;
    const { data: created, error: createSectionError } = await supabase
      .from("list_sections")
      .insert({ wedding_id: wedding.id, list_id: listId, title, sort_order: s })
      .select("id")
      .single();
    if (createSectionError) return fail(createSectionError.message);
    sectionIdByTitle.set(title, created.id);
  }

  const generated = generateTimelineItems("timeline", wedding.wedding_date, sections);
  const rows = generated.map((item) => ({
    wedding_id: wedding.id,
    list_id: listId,
    section_id: sectionIdByTitle.get(item.section) ?? null,
    title: item.title,
    notes: item.notes,
    due_date: item.due_date,
    offset_days: item.offset_days,
    template_key: item.template_key,
    generated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("list_items")
    .upsert(rows, { onConflict: "wedding_id,template_key" });
  if (upsertError) return fail(upsertError.message);

  revalidateLists(listId);
  revalidatePath("/setup/plan");
  return ok({ listId, count: rows.length });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function addSection(listId: string, title: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = z.string().trim().min(1, "Give the section a name").max(120).safeParse(title);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid title");

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("list_sections")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .eq("list_id", listId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("list_sections")
    .insert({ wedding_id: wedding.id, list_id: listId, title: parsed.data, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidateLists(listId);
  return ok({ id: data.id });
}

export async function renameSection(sectionId: string, title: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.string().trim().min(1).max(120).safeParse(title);
  if (!parsed.success) return fail("Give the section a name");

  const supabase = await createClient();
  const { error } = await supabase
    .from("list_sections")
    .update({ title: parsed.data })
    .eq("id", sectionId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

export async function removeSection(sectionId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  // Items in the section are not deleted — the foreign key sets section_id to
  // null (0004), so they fall back to being unsectioned rather than vanishing.
  const { error } = await supabase
    .from("list_sections")
    .delete()
    .eq("id", sectionId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const itemFields = z.object({
  title: z.string().trim().min(1, "Give the item a title").max(200),
  notes: optionalText(2000),
  due_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  qty: z.coerce.number().int().positive().optional(),
  url: optionalText(2000),
  priority: z.coerce.number().int().min(0).max(3).optional(),
  section_id: z.union([z.string().uuid(), z.null()]).optional(),
});

export async function addItem(
  listId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = itemFields.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const user = await getSessionUser();
  const { data: last } = await supabase
    .from("list_items")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .eq("list_id", listId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Auto-assigned to whoever's creating it (spec 7) — every creation path
  // (quick-add, the full item form, a budget line's linked task) goes
  // through this one function, so this is the single place that needs it.
  // Still freely reassignable afterward via assignItem.
  const { data, error } = await supabase
    .from("list_items")
    .insert({
      ...parsed.data,
      wedding_id: wedding.id,
      list_id: listId,
      assigned_to: user?.id ?? null,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidateLists(listId);
  return ok({ id: data.id });
}

/**
 * "type a title, hit enter, it's in the list" — including a date typed
 * straight into the title, the way Apple Reminders reads "tomorrow" out of
 * what you typed instead of making you reach for a date picker.
 */
export async function quickAddItem(
  listId: string,
  sectionId: string | null,
  rawTitle: string,
): Promise<ActionResult<{ id: string; due_date: string | null }>> {
  const parsed = parseQuickAdd(rawTitle);
  if (!parsed.title) return fail("Type something first");

  const result = await addItem(listId, {
    title: parsed.title,
    due_date: parsed.due_date ?? "",
    section_id: sectionId,
  });
  if (!result.ok) return result;
  return ok({ id: result.data.id, due_date: parsed.due_date });
}

export async function updateItem(itemId: string, patch: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = itemFields.partial().safeParse(patch);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .update(parsed.data)
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

export async function toggleFlag(itemId: string, flagged: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .update({ flagged })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

export async function setPriority(itemId: string, priority: number): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.number().int().min(0).max(3).safeParse(priority);
  if (!parsed.success) return fail("Priority must be between 0 and 3");

  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .update({ priority: parsed.data })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

/** Also what /timeline's drag-to-reschedule calls — dragging an item IS setting its due_date. */
export async function setDueDate(itemId: string, dueDate: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail("Invalid date");

  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .update({ due_date: dueDate })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

export async function assignItem(itemId: string, userId: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .update({ assigned_to: userId })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

const STATUSES: ListItemStatus[] = ["not_started", "in_progress", "done"];

/**
 * Applies a status change to one already-fetched row: the status/done_at/
 * done_by patch, plus spawning its next occurrence if it's done and repeats.
 * Shared by `setStatus`'s own item and, below, every sub-item a close
 * cascades to — so a recurring sub-item keeps recurring even when it's
 * closed by its parent rather than by its own checkbox.
 */
async function completeItemRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  userId: string | undefined,
  item: ListItemRow,
  status: ListItemStatus,
): Promise<ActionResult> {
  const patch: Partial<ListItemRow> =
    status === "done"
      ? { status, done_at: new Date().toISOString(), done_by: userId ?? null }
      : { status, done_at: null, done_by: null };

  const { error } = await supabase.from("list_items").update(patch).eq("id", item.id).eq("wedding_id", weddingId);
  if (error) return fail(error.message);

  if (status === "done" && item.repeat_rule) {
    const spawned = spawnNextOccurrence({
      due_date: item.due_date ?? new Date().toISOString().slice(0, 10),
      repeat_rule: item.repeat_rule as unknown as RepeatRule,
    });
    if (spawned) {
      const { error: spawnError } = await supabase.from("list_items").insert({
        wedding_id: weddingId,
        list_id: item.list_id,
        section_id: item.section_id,
        parent_item_id: item.parent_item_id,
        title: item.title,
        notes: item.notes,
        qty: item.qty,
        url: item.url,
        priority: item.priority,
        assigned_to: item.assigned_to,
        due_date: spawned.due_date,
        repeat_rule: spawned.repeat_rule,
        recurrence_parent_id: item.recurrence_parent_id ?? item.id,
        sort_order: item.sort_order,
      });
      if (spawnError) return fail(spawnError.message);
    }
  }

  return ok(undefined);
}

/**
 * What /board's drag-between-columns calls, and what ticking an item off
 * anywhere else calls too — one action, so "done" means the same thing
 * everywhere. Marking a recurring item done spawns its next occurrence and
 * leaves this row as history (spec 1, section 5a) rather than resetting it.
 *
 * Closing a parent closes its open sub-items with it (spec 11 §1D) —
 * reopening a parent does not reopen them; that stays a separate, manual
 * click per sub-item. The sub-items are closed *before* the parent's own
 * row: `list_items_derive_parent_status` (0005) recomputes the parent's
 * status every time a child's status changes, and closing children one at a
 * time would otherwise walk the parent through "in_progress" and leave it
 * there — that trigger derives up to "in_progress" for a part-done set but
 * deliberately never auto-promotes to "done" even once every child catches
 * up (spec 1 §5a: "every sub-item done" stays a manual call). Writing the
 * parent's own status last means no further child update follows it to
 * re-derive anything out from under it.
 */
export async function setStatus(itemId: string, status: ListItemStatus): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!STATUSES.includes(status)) return fail("Invalid status");
  const user = await getSessionUser();

  const supabase = await createClient();
  const { data: item, error: readError } = await supabase
    .from("list_items")
    .select("*")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!item) return fail("That item no longer exists");

  if (status === "done" && !item.parent_item_id) {
    const { data: subItems, error: subError } = await supabase
      .from("list_items")
      .select("*")
      .eq("parent_item_id", itemId)
      .eq("wedding_id", wedding.id)
      .neq("status", "done");
    if (subError) return fail(subError.message);

    for (const subItem of subItems ?? []) {
      const subResult = await completeItemRow(supabase, wedding.id, user?.id, subItem, "done");
      if (!subResult.ok) return subResult;
    }
  }

  const result = await completeItemRow(supabase, wedding.id, user?.id, item, status);
  if (!result.ok) return result;

  revalidateLists(item.list_id);
  return ok(undefined);
}

const repeatRuleSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  day_of_month: z.number().int().min(1).max(31).optional(),
  end: z.union([
    z.object({ type: z.literal("never") }),
    z.object({ type: z.literal("after"), count: z.number().int().min(1).max(999) }),
    z.object({ type: z.literal("until"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ]),
  occurrence_index: z.number().int().min(1),
});

export async function setRepeatRule(itemId: string, rule: RepeatRule | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (rule !== null) {
    const parsed = repeatRuleSchema.safeParse(rule);
    if (!parsed.success) return fail("That repeat rule doesn't look right");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("list_items")
    .update({ repeat_rule: rule })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

/** One level deep only — the database refuses a sub-item of a sub-item (0005's nesting trigger). */
export async function addSubItem(parentItemId: string, title: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsedTitle = z.string().trim().min(1, "Give the sub-item a title").max(200).safeParse(title);
  if (!parsedTitle.success) return fail(parsedTitle.error.issues[0]?.message ?? "Invalid title");

  const supabase = await createClient();
  const { data: parent, error: parentError } = await supabase
    .from("list_items")
    .select("list_id, section_id")
    .eq("id", parentItemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (parentError) return fail(parentError.message);
  if (!parent) return fail("That item no longer exists");

  const { data, error } = await supabase
    .from("list_items")
    .insert({
      wedding_id: wedding.id,
      list_id: parent.list_id,
      section_id: parent.section_id,
      parent_item_id: parentItemId,
      title: parsedTitle.data,
    })
    .select("id")
    .single();
  if (error) {
    if (error.message.includes("one level of nesting")) {
      return fail("Sub-items can't have their own sub-items");
    }
    return fail(error.message);
  }

  revalidateLists();
  return ok({ id: data.id });
}

export async function deleteItem(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("list_items").delete().eq("id", itemId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateLists();
  return ok(undefined);
}

/**
 * Free reordering, within one list or one section. list_items.sort_order is
 * a plain integer (0004), not a fractional rank like households.rank — so a
 * drop renumbers the whole dropped-into group in one batch rather than
 * computing a single fractional midpoint. Cheap at the scale this screen
 * ever reaches (one person's lists, not a shared spreadsheet import).
 */
export async function reorderItems(orderedIds: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.array(z.string().uuid()).min(1).max(2000).safeParse(orderedIds);
  if (!parsed.success) return fail("Nothing to reorder");

  // Individual updates, not a bulk upsert: upsert's INSERT branch would need
  // every NOT NULL column (title, list_id, ...) even though every row here
  // already exists and only ever takes the ON CONFLICT UPDATE path —
  // Postgres validates the row before it knows a conflict will occur.
  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.map((id, index) =>
      supabase
        .from("list_items")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", id)
        .eq("wedding_id", wedding.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(failed.error.message);

  revalidateLists();
  return ok(undefined);
}

/**
 * Moves a top-level item into a (possibly different) section and renumbers
 * that section's order in one call — `reorderItems` alone can't do this
 * because it only ever touches `sort_order`, never `section_id` (spec 11
 * §1B). Shared by the cross-section drag and the per-item "Section" select:
 * a drag passes wherever in the destination section the card was actually
 * dropped; the select passes the destination's current order with the
 * moved item appended at the end. `sectionId: null` moves it to "no
 * section." The section the item left needs no renumbering of its own —
 * `sort_order` only has to stay ordered, not contiguous.
 */
export async function moveItemToSection(
  itemId: string,
  sectionId: string | null,
  orderedIdsInDestinationSection: string[],
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsedIds = z.array(z.string().uuid()).min(1).max(2000).safeParse(orderedIdsInDestinationSection);
  if (!parsedIds.success) return fail("Nothing to reorder");
  if (!parsedIds.data.includes(itemId)) return fail("That item isn't in the destination order given");

  const supabase = await createClient();
  const { error: sectionError } = await supabase
    .from("list_items")
    .update({ section_id: sectionId })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (sectionError) return fail(sectionError.message);

  const results = await Promise.all(
    parsedIds.data.map((id, index) =>
      supabase
        .from("list_items")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", id)
        .eq("wedding_id", wedding.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(failed.error.message);

  revalidateLists();
  return ok(undefined);
}

/**
 * Reordering the sections themselves (spec 11 §1C) — the direct analogue of
 * `reorderItems`, renumbering `list_sections.sort_order` the same way. The
 * "no section" bucket isn't a `list_sections` row and always renders last
 * regardless (`ListDetail`'s `groups`), so it never appears in this list.
 */
export async function reorderSections(orderedSectionIds: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.array(z.string().uuid()).min(1).max(200).safeParse(orderedSectionIds);
  if (!parsed.success) return fail("Nothing to reorder");

  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.map((id, index) =>
      supabase
        .from("list_sections")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", id)
        .eq("wedding_id", wedding.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(failed.error.message);

  revalidateLists();
  return ok(undefined);
}
