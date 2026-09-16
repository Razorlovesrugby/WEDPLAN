"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { zonedInputToUtc } from "@/lib/timezone";
import type { RunSheetItemRow } from "@/lib/types/database";
import { fail, ok, type ActionResult } from "./result";

const trackSchema = z.enum(["guests", "couple", "vendors", "other"]);

const baseFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the item a title").max(200),
  notes: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(200).optional(),
  owner: z.string().trim().max(200).optional(),
  track: trackSchema.default("other"),
  durationMinutes: z.coerce.number().int().min(0).max(1440),
  guestVisible: z.union([z.boolean(), z.literal("on"), z.literal("")]).optional(),
});

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/run-sheet`);
  revalidatePath("/run-sheet");
}

/**
 * Creates an item either pinned (a real wall-clock time) or unpinned
 * (chained off a predecessor, offset optional, predecessor itself optional
 * — an unpinned item with no predecessor yet saves as "time TBD", spec 5,
 * B6 decision 5). `at` is a datetime-local string, interpreted in the
 * wedding's own timezone, same rule src/server/actions/events.ts follows.
 */
export async function createRunSheetItem(
  eventId: string,
  fields: Record<string, unknown> & {
    pinned: boolean;
    at?: string;
    predecessorId?: string | null;
    offsetMinutes?: number;
  },
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = baseFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();

  let pinnedAt: string | null = null;
  if (fields.pinned) {
    pinnedAt = fields.at ? zonedInputToUtc(fields.at, wedding.timezone) : null;
    if (!pinnedAt) return fail("Give the pinned item a time");
  }

  const { data, error } = await supabase
    .from("run_sheet_items")
    .insert({
      wedding_id: wedding.id,
      event_id: eventId,
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      location: parsed.data.location || null,
      owner: parsed.data.owner || null,
      track: parsed.data.track,
      duration_minutes: parsed.data.durationMinutes,
      guest_visible: parsed.data.guestVisible === true || parsed.data.guestVisible === "on",
      pinned: Boolean(fields.pinned),
      pinned_at: pinnedAt,
      predecessor_id: fields.pinned ? null : (fields.predecessorId ?? null),
      offset_minutes: fields.pinned ? 0 : (fields.offsetMinutes ?? 0),
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidate(eventId);
  return ok({ id: data.id });
}

/** Title/location/owner/track/duration/notes/guest_visible — never the pin state, that's pin/unpinRunSheetItem's job. */
export async function updateRunSheetItem(
  itemId: string,
  eventId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = baseFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("run_sheet_items")
    .update({
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      location: parsed.data.location || null,
      owner: parsed.data.owner || null,
      track: parsed.data.track,
      duration_minutes: parsed.data.durationMinutes,
      guest_visible: parsed.data.guestVisible === true || parsed.data.guestVisible === "on",
    })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);

  revalidate(eventId);
  return ok(undefined);
}

/** Pins an item to a real wall-clock time — it becomes its own anchor, so any predecessor it had is cleared. */
export async function pinRunSheetItem(itemId: string, eventId: string, at: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const pinnedAt = zonedInputToUtc(at, wedding.timezone);
  if (!pinnedAt) return fail("That doesn't look like a valid time");

  const supabase = await createClient();
  const { error } = await supabase
    .from("run_sheet_items")
    .update({ pinned: true, pinned_at: pinnedAt, predecessor_id: null, offset_minutes: 0 })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);

  revalidate(eventId);
  return ok(undefined);
}

/** Unpins an item back to chaining off a predecessor (optional — null saves as "time TBD"). */
export async function unpinRunSheetItem(
  itemId: string,
  eventId: string,
  predecessorId: string | null,
  offsetMinutes: number,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsedOffset = z.coerce.number().int().min(0).max(1440).safeParse(offsetMinutes);
  if (!parsedOffset.success) return fail("The gap needs to be a whole number of minutes");

  const supabase = await createClient();
  const { error } = await supabase
    .from("run_sheet_items")
    .update({
      pinned: false,
      pinned_at: null,
      predecessor_id: predecessorId,
      offset_minutes: parsedOffset.data,
    })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);

  revalidate(eventId);
  return ok(undefined);
}

/**
 * Dragging an item to a new slot re-points its predecessor_id, server-side
 * — never a client-supplied position, same "compute the new relationship
 * server-side" rule spec 4's moveHousehold/moveGuest actions already follow.
 *
 * Two edges change, not one: the item that used to follow this one's OLD
 * predecessor now follows that predecessor directly (closing the gap this
 * item leaves), and whatever used to follow the NEW predecessor now follows
 * this item instead (inserting it into the new slot) — spec 5, B4.
 */
export async function reorderRunSheetItem(
  itemId: string,
  newPredecessorId: string | null,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: items, error: readError } = await supabase
    .from("run_sheet_items")
    .select("id, predecessor_id, pinned, event_id")
    .eq("wedding_id", wedding.id);
  if (readError) return fail(readError.message);

  const rows = (items ?? []) as Pick<RunSheetItemRow, "id" | "predecessor_id" | "pinned" | "event_id">[];
  const item = rows.find((r) => r.id === itemId);
  if (!item) return fail("That item no longer exists");
  if (item.pinned) return fail("A pinned item is its own anchor — unpin it first");
  if (newPredecessorId === itemId) return fail("An item cannot follow itself");

  const oldSuccessor = rows.find((r) => r.predecessor_id === itemId);
  const newSuccessor = rows.find((r) => r.predecessor_id === newPredecessorId && r.id !== itemId);

  if (oldSuccessor) {
    const { error } = await supabase
      .from("run_sheet_items")
      .update({ predecessor_id: item.predecessor_id })
      .eq("id", oldSuccessor.id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }

  const { error: moveError } = await supabase
    .from("run_sheet_items")
    .update({ predecessor_id: newPredecessorId })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (moveError) return fail(moveError.message);

  if (newSuccessor) {
    // If this is the same row as oldSuccessor (a one-slot shuffle), the
    // gap-closing update above already pointed it at item.predecessor_id —
    // this final write points it at this item instead, which is correct
    // either way.
    const { error } = await supabase
      .from("run_sheet_items")
      .update({ predecessor_id: itemId })
      .eq("id", newSuccessor.id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }

  revalidate(item.event_id);
  return ok(undefined);
}

/**
 * Refuses to silently orphan a chain: if another item's predecessor_id
 * points at this one, that item is re-linked to point at THIS item's own
 * predecessor first — the chain closes over the gap, same as a mid-chain
 * reorder — rather than the DB's plain foreign key simply rejecting the
 * delete (spec 5, B5; same rule spec 1's parent/sub-item handling follows).
 */
export async function deleteRunSheetItem(itemId: string, eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: item, error: readError } = await supabase
    .from("run_sheet_items")
    .select("id, predecessor_id")
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!item) return fail("That item no longer exists");

  const { data: successors, error: successorError } = await supabase
    .from("run_sheet_items")
    .select("id")
    .eq("wedding_id", wedding.id)
    .eq("predecessor_id", itemId);
  if (successorError) return fail(successorError.message);

  for (const successor of successors ?? []) {
    const { error } = await supabase
      .from("run_sheet_items")
      .update({ predecessor_id: item.predecessor_id })
      .eq("id", successor.id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }

  const { error: deleteError } = await supabase
    .from("run_sheet_items")
    .delete()
    .eq("id", itemId)
    .eq("wedding_id", wedding.id);
  if (deleteError) return fail(deleteError.message);

  revalidate(eventId);
  return ok(undefined);
}
