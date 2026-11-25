"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseDrawing, wallBounds } from "@/lib/seating/drawing";
import { requireWedding } from "@/server/queries/wedding";
import { resolveLayout, resolveSpace } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * The spaces of a layout and what is drawn in them (spec 57 Parts A and B).
 * A space is one room: a marquee, a terrace, the ceremony lawn. Every Supabase
 * `error` is checked, and every drawing is validated by `parseDrawing` before
 * it is stored (the database only bounds its type and size).
 */

const uuid = z.string().uuid();
const nameSchema = z.string().trim().min(1, "Give the room a name").max(60, "Keep the name under 60 characters");
const MAX_DRAWING_BYTES = 256 * 1024;
const MAX_SPACES = 12;

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/seating`);
  revalidatePath(`/events/${eventId}/seating/print`);
  revalidatePath("/seating");
}

/** A new, empty space at the end of the layout, 20 × 15 m until the couple says otherwise. */
export async function addSeatingSpace(eventId: string, name: string, layoutId?: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Give the room a name");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("seating_spaces")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .eq("layout_id", layout.layout.id);
  if (readError) return fail(readError.message);
  if ((existing ?? []).length >= MAX_SPACES) return fail(`${MAX_SPACES} rooms is the most one layout holds`);

  const { data, error } = await supabase
    .from("seating_spaces")
    .insert({
      wedding_id: wedding.id,
      layout_id: layout.layout.id,
      name: parsed.data,
      sort_order: Math.max(0, ...(existing ?? []).map((s) => s.sort_order)) + 1,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ id: data.id });
}

export async function renameSeatingSpace(eventId: string, spaceId: string, name: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Give the room a name");
  if (!uuid.safeParse(spaceId).success) return fail("That room doesn't exist");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_spaces")
    .update({ name: parsed.data })
    .eq("id", spaceId)
    .eq("wedding_id", wedding.id)
    .select("id");
  if (error) return fail(error.message);
  if (!data || data.length === 0) return fail("That room doesn't exist");
  revalidate(eventId);
  return ok(undefined);
}

/**
 * Deletes a room. A layout always keeps at least one. Its tables are not
 * lost: they move to the layout's first other room, taken off the floor (so
 * nobody is unseated), and its furniture and décor go with it.
 */
export async function deleteSeatingSpace(eventId: string, spaceId: string, layoutId?: string): Promise<ActionResult<{ movedTables: number; movedTo: string }>> {
  const wedding = await requireWedding();
  if (!uuid.safeParse(spaceId).success) return fail("That room doesn't exist");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const supabase = await createClient();

  const { data: spaces, error } = await supabase
    .from("seating_spaces")
    .select("id, name, sort_order")
    .eq("wedding_id", wedding.id)
    .eq("layout_id", layout.layout.id)
    .order("sort_order")
    .order("created_at");
  if (error) return fail(error.message);
  const target = (spaces ?? []).find((s) => s.id === spaceId);
  if (!target) return fail("That room doesn't exist");
  const other = (spaces ?? []).find((s) => s.id !== spaceId);
  if (!other) return fail("A layout needs at least one room");

  const moved = await supabase
    .from("seating_tables")
    .update({ space_id: other.id, pos_x_cm: null, pos_y_cm: null })
    .eq("wedding_id", wedding.id)
    .eq("layout_id", layout.layout.id)
    .eq("space_id", spaceId)
    .select("id");
  if (moved.error) return fail(moved.error.message);

  // The fixtures in it are deleted with it (the foreign key cascades).
  const removed = await supabase.from("seating_spaces").delete().eq("id", spaceId).eq("wedding_id", wedding.id);
  if (removed.error) return fail(removed.error.message);
  revalidate(eventId);
  return ok({ movedTables: moved.data?.length ?? 0, movedTo: other.name });
}

const drawingFieldsSchema = z.object({ opacity: z.number().int().min(10).max(100) });

/** How faded the venue's own drawing is under the plan (B.2). */
export async function setSeatingSpaceOpacity(eventId: string, spaceId: string, opacity: number): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = drawingFieldsSchema.safeParse({ opacity });
  if (!parsed.success || !uuid.safeParse(spaceId).success) return fail("That isn't a fade from 10 to 100");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_spaces")
    .update({ background_opacity: parsed.data.opacity })
    .eq("id", spaceId)
    .eq("wedding_id", wedding.id)
    .select("id");
  if (error) return fail(error.message);
  if (!data || data.length === 0) return fail("That room doesn't exist");
  revalidate(eventId);
  return ok(undefined);
}

/**
 * Stores a space's whole drawing. Validated first: a broken item, a repeated
 * id or a door on a wall that isn't there is refused with what's wrong. With
 * walls drawn and no venue image under them, the room becomes the walls'
 * bounding box (B.3); with an image, the room is left as it is, because the
 * image is stretched to fit it.
 */
export async function saveSeatingDrawing(eventId: string, spaceId: string, drawing: unknown, layoutId?: string): Promise<ActionResult<{ room_width_cm: number; room_depth_cm: number }>> {
  const wedding = await requireWedding();
  if (!uuid.safeParse(spaceId).success) return fail("That room doesn't exist");
  const parsed = parseDrawing(drawing);
  if (!parsed.ok) return fail(parsed.error);
  if (new TextEncoder().encode(JSON.stringify(parsed.drawing)).length > MAX_DRAWING_BYTES) {
    return fail("That drawing is too big to save. Remove some of it.");
  }
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const space = await resolveSpace(wedding.id, layout.layout.id, spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data || space.data.id !== spaceId) return fail("That room isn't part of this layout");

  let width = space.data.room_width_cm;
  let depth = space.data.room_depth_cm;
  const bounds = wallBounds(parsed.drawing.walls);
  if (bounds && !space.data.background_path) {
    // To the next 25 cm so the grid still lines up.
    const up = (v: number) => Math.min(20000, Math.max(300, Math.ceil(v / 25) * 25));
    width = up(bounds.maxX);
    depth = up(bounds.maxY);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_spaces")
    .update({ drawing: parsed.drawing, room_width_cm: width, room_depth_cm: depth })
    .eq("id", spaceId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ room_width_cm: width, room_depth_cm: depth });
}
