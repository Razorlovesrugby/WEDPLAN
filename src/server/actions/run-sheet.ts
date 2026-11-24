"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { zonedInputToUtc } from "@/lib/timezone";
import { addMinutesIso, followerStart, MAX_GAP_MINUTES, MAX_STEPS, spanMinutes, timesProblem } from "@/lib/run-sheet";
import type { RunSheetAssigneeType } from "@/lib/types/database";
import { fail, ok, type ActionResult } from "./result";

/**
 * The run sheet's writes (spec 50). Every one is a single call to a database
 * function (migration 0048), so an item, its assignees and what follows it
 * change together or not at all. Times arrive as `datetime-local` strings and
 * mean the wedding's own timezone, never the browser's.
 */

function revalidate() {
  revalidatePath("/run-sheet");
  revalidatePath("/events");
}

const assigneeSchema = z.object({
  type: z.enum(["collaborator", "guest", "vendor", "person"]),
  id: z.string().uuid(),
});

const saveSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Give the item a title").max(200),
  notes: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  eventId: z.string().uuid().nullable().optional(),
  guestVisible: z.boolean().optional(),
  /** A `datetime-local` value in the wedding's timezone. */
  startsAt: z.string().min(1, "Give the item a start"),
  endsAt: z.string().min(1, "Give the item an end"),
  predecessorId: z.string().uuid().nullable().optional(),
  /** Null means "the start was typed": the gap is whatever lands it there. */
  offsetMinutes: z.number().int().min(0).max(MAX_GAP_MINUTES).nullable().optional(),
  assignees: z.array(assigneeSchema).max(60).default([]),
});

export type SaveRunSheetItemInput = z.input<typeof saveSchema>;

/**
 * Creates or updates one item, with its assignees, in one transaction. For an
 * item that starts after another, the other item decides the start; a typed
 * start earlier than that item ends removes the link.
 */
export async function saveRunSheetItem(input: SaveRunSheetItemInput): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const f = parsed.data;

  const typedStart = zonedInputToUtc(f.startsAt, wedding.timezone);
  const typedEnd = zonedInputToUtc(f.endsAt, wedding.timezone);
  if (!typedStart || !typedEnd) return fail("Those don't look like valid times");

  const supabase = await createClient();

  // Check the limit on the times that will actually be stored. A follower's
  // start comes from its predecessor, so look at where it will land.
  let start = typedStart;
  let end = typedEnd;
  if (f.predecessorId) {
    const { data: predecessor, error } = await supabase
      .from("run_sheet_items")
      .select("ends_at")
      .eq("id", f.predecessorId)
      .eq("wedding_id", wedding.id)
      .maybeSingle();
    if (error) return fail(error.message);
    if (!predecessor) return fail("The item it should start after no longer exists");

    const gap = f.offsetMinutes ?? spanMinutes(predecessor.ends_at, typedStart);
    if (gap >= 0) {
      start = followerStart(predecessor.ends_at, gap);
      end = addMinutesIso(start, spanMinutes(typedStart, typedEnd));
    }
  }
  const problem = timesProblem(start, end, wedding.timezone);
  if (problem) return fail(problem);

  const before = f.id
    ? (
        await supabase
          .from("run_sheet_items")
          .select("starts_at, ends_at, location")
          .eq("id", f.id)
          .eq("wedding_id", wedding.id)
          .maybeSingle()
      ).data
    : null;

  const { data, error } = await supabase.rpc("save_run_sheet_item", {
    p_wedding_id: wedding.id,
    p_item_id: f.id ?? null,
    p_title: f.title,
    p_notes: f.notes || null,
    p_location: f.location || null,
    p_event_id: f.eventId ?? null,
    p_guest_visible: f.guestVisible ?? false,
    p_starts_at: typedStart,
    p_ends_at: typedEnd,
    p_predecessor_id: f.predecessorId ?? null,
    p_offset_minutes: f.predecessorId ? (f.offsetMinutes ?? null) : 0,
    p_assignees: f.assignees as { type: RunSheetAssigneeType; id: string }[],
  });
  if (error) return fail(error.message);

  // "Got it" is cleared when the task's time or place changes (spec 54 §6.11).
  if (before) {
    const { data: after } = await supabase
      .from("run_sheet_items")
      .select("starts_at, ends_at, location")
      .eq("id", data as string)
      .eq("wedding_id", wedding.id)
      .maybeSingle();
    if (
      after &&
      (Date.parse(after.starts_at) !== Date.parse(before.starts_at) ||
        Date.parse(after.ends_at) !== Date.parse(before.ends_at) ||
        (after.location ?? "") !== (before.location ?? ""))
    ) {
      const { error: clearError } = await supabase
        .from("run_sheet_item_assignees")
        .update({ confirmed_at: null })
        .eq("item_id", data as string)
        .eq("wedding_id", wedding.id);
      if (clearError) return fail(clearError.message);
    }
  }

  revalidate();
  return ok({ id: data as string });
}

const contentSchema = z.object({
  instructions: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(300).optional(),
  critical: z.boolean().optional(),
  contactId: z.string().uuid().nullable().optional(),
  steps: z.array(z.string().trim().min(1).max(200)).max(MAX_STEPS, `At most ${MAX_STEPS} steps`).default([]),
  bring: z.array(z.string().trim().min(1).max(200)).max(MAX_STEPS, `At most ${MAX_STEPS} things to bring`).default([]),
});

export type TaskContentInput = z.input<typeof contentSchema>;

/**
 * What a task holds for the people helping (spec 54 §10.1): instructions,
 * address, critical, contact, steps and bring list. Saved right after the item
 * itself, so unlike the item and its assignees it is not one transaction: a
 * failure here leaves the item saved and says so.
 *
 * Steps are matched to existing ones by position, so a helper's ticks stay
 * with the step they ticked when the wording is edited. "Got it" is cleared
 * when the instructions or address change.
 */
export async function saveTaskContent(itemId: string, input: TaskContentInput): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the helper details");
  const f = parsed.data;
  const supabase = await createClient();

  const { data: item, error: readError } = await supabase
    .from("run_sheet_items")
    .select("instructions, address")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!item) return fail("That item no longer exists");

  const instructions = f.instructions || null;
  const address = f.address || null;
  const { error } = await supabase
    .from("run_sheet_items")
    .update({ instructions, address, critical: f.critical ?? false, contact_id: f.contactId ?? null })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(`The item saved, but its helper details didn't: ${error.message}`);

  if ((item.instructions ?? null) !== instructions || (item.address ?? null) !== address) {
    const { error: clearError } = await supabase
      .from("run_sheet_item_assignees")
      .update({ confirmed_at: null })
      .eq("item_id", itemId)
      .eq("wedding_id", wedding.id);
    if (clearError) return fail(clearError.message);
  }

  for (const kind of ["step", "bring"] as const) {
    const wanted = kind === "step" ? f.steps : f.bring;
    const { data: existing, error: existingError } = await supabase
      .from("run_sheet_item_steps")
      .select("id, text, sort_order")
      .eq("item_id", itemId)
      .eq("wedding_id", wedding.id)
      .eq("kind", kind)
      .order("sort_order");
    if (existingError) return fail(existingError.message);
    const rows = existing ?? [];

    for (const [index, text] of wanted.entries()) {
      const row = rows[index];
      if (row) {
        if (row.text !== text || row.sort_order !== index) {
          const { error: updateError } = await supabase
            .from("run_sheet_item_steps")
            .update({ text, sort_order: index })
            .eq("id", row.id)
            .eq("wedding_id", wedding.id);
          if (updateError) return fail(updateError.message);
        }
      } else {
        const { error: insertError } = await supabase
          .from("run_sheet_item_steps")
          .insert({ wedding_id: wedding.id, item_id: itemId, kind, text, sort_order: index });
        if (insertError) return fail(insertError.message);
      }
    }
    const surplus = rows.slice(wanted.length).map((r) => r.id);
    if (surplus.length > 0) {
      const { error: deleteError } = await supabase.from("run_sheet_item_steps").delete().in("id", surplus).eq("wedding_id", wedding.id);
      if (deleteError) return fail(deleteError.message);
    }
  }

  revalidate();
  return ok(undefined);
}

/**
 * Moves an item, and everything that starts after it, by a number of minutes.
 * An item that starts after another cannot move to before that item ends.
 */
export async function moveRunSheetItem(itemId: string, deltaMinutes: number): Promise<ActionResult> {
  const wedding = await requireWedding();
  const delta = z.number().int().min(-1440).max(1440).safeParse(deltaMinutes);
  if (!delta.success) return fail("That isn't a number of minutes");

  const supabase = await createClient();
  const { data: item, error: readError } = await supabase
    .from("run_sheet_items")
    .select("starts_at, ends_at")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!item) return fail("That item no longer exists");

  const problem = timesProblem(
    addMinutesIso(item.starts_at, delta.data),
    addMinutesIso(item.ends_at, delta.data),
    wedding.timezone,
  );
  if (problem) return fail(problem);

  const { error } = await supabase.rpc("shift_run_sheet_item", {
    p_wedding_id: wedding.id,
    p_item_id: itemId,
    p_delta_minutes: delta.data,
  });
  if (error) return fail(error.message);

  revalidate();
  return ok(undefined);
}

/**
 * Changes only an item's end. Whatever starts after it moves by the change in
 * the end. Its assignees are left alone.
 */
export async function resizeRunSheetItem(itemId: string, endsAtIso: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (Number.isNaN(Date.parse(endsAtIso))) return fail("That doesn't look like a valid time");
  const end = new Date(endsAtIso).toISOString();

  const supabase = await createClient();
  const { data: item, error: readError } = await supabase
    .from("run_sheet_items")
    .select("title, notes, location, event_id, guest_visible, starts_at, predecessor_id, offset_minutes")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!item) return fail("That item no longer exists");

  const problem = timesProblem(item.starts_at, end, wedding.timezone);
  if (problem) return fail(problem);

  const { error } = await supabase.rpc("save_run_sheet_item", {
    p_wedding_id: wedding.id,
    p_item_id: itemId,
    p_title: item.title,
    p_notes: item.notes,
    p_location: item.location,
    p_event_id: item.event_id,
    p_guest_visible: item.guest_visible,
    p_starts_at: item.starts_at,
    p_ends_at: end,
    p_predecessor_id: item.predecessor_id,
    p_offset_minutes: item.predecessor_id ? item.offset_minutes : 0,
    p_assignees: null,
  });
  if (error) return fail(error.message);

  revalidate();
  return ok(undefined);
}

/** A copy at the same time, with the same people, that starts after nothing. */
export async function duplicateRunSheetItem(itemId: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const [{ data: item, error: itemError }, { data: rows, error: rowsError }] = await Promise.all([
    supabase
      .from("run_sheet_items")
      .select("title, notes, location, event_id, guest_visible, starts_at, ends_at")
      .eq("id", itemId)
      .eq("wedding_id", wedding.id)
      .maybeSingle(),
    supabase.from("run_sheet_item_assignees").select("*").eq("item_id", itemId).eq("wedding_id", wedding.id),
  ]);
  if (itemError) return fail(itemError.message);
  if (rowsError) return fail(rowsError.message);
  if (!item) return fail("That item no longer exists");

  const assignees: { type: RunSheetAssigneeType; id: string }[] = [];
  for (const row of rows ?? []) {
    if (row.collaborator_user_id) assignees.push({ type: "collaborator", id: row.collaborator_user_id });
    else if (row.guest_id) assignees.push({ type: "guest", id: row.guest_id });
    else if (row.vendor_id) assignees.push({ type: "vendor", id: row.vendor_id });
    else if (row.person_id) assignees.push({ type: "person", id: row.person_id });
  }

  const { data, error } = await supabase.rpc("save_run_sheet_item", {
    p_wedding_id: wedding.id,
    p_item_id: null,
    p_title: item.title,
    p_notes: item.notes,
    p_location: item.location,
    p_event_id: item.event_id,
    p_guest_visible: item.guest_visible,
    p_starts_at: item.starts_at,
    p_ends_at: item.ends_at,
    p_predecessor_id: null,
    p_offset_minutes: 0,
    p_assignees: assignees,
  });
  if (error) return fail(error.message);

  revalidate();
  return ok({ id: data as string });
}

/** Deletes an item. Whatever started after it keeps its time. */
export async function deleteRunSheetItem(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_run_sheet_item", {
    p_wedding_id: wedding.id,
    p_item_id: itemId,
  });
  if (error) return fail(error.message);

  revalidate();
  return ok(undefined);
}
