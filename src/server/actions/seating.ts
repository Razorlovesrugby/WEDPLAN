"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import { calibrateRoom, normaliseDegrees, readSegments } from "@/lib/seating/geometry";
import { nextTableLabel } from "@/lib/seating/model";
import { zonedInputToUtc } from "@/lib/timezone";
import { getSessionUser, requireWedding } from "@/server/queries/wedding";
import { resolveLayout, resolveSpace } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * Every write the seating screen makes (spec 33). One small write per move —
 * never a whole-plan save — so two people editing lose at most the one move
 * that collided, and an optimistic screen has one thing to roll back.
 */

const uuid = z.string().uuid();
const shapeSchema = z.enum(["round", "long", "square", "head", "sweetheart", "oval", "half_moon", "serpentine", "rows", "banquet"]);
const fixtureKindSchema = z.enum([
  "dance_floor",
  "bar",
  "band",
  "dj",
  "stage",
  "cake",
  "gifts",
  "entrance",
  "photo_booth",
  "buffet",
  "other",
  "lounge",
  "kids_area",
  "floral_arch",
  "garland",
  "aisle_flowers",
  "candles",
  "plant",
  "sign",
  "lantern",
  "drape",
  "marquee",
  "tree",
  "path",
  "pool",
  "garden_bed",
  "slope",
  "custom",
]);

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/seating`);
  revalidatePath(`/events/${eventId}/seating/print`);
  revalidatePath("/seating");
}

/** Guests can see their table once the reveal date has passed (Part F): their pages must then follow every move. */
async function revalidateGuestPagesIfRevealed(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("seating_plans").select("reveal_at").eq("event_id", eventId).maybeSingle();
  if (data?.reveal_at && new Date(data.reveal_at) <= new Date()) revalidatePath("/w", "layout");
}

async function eventBelongs(weddingId: string, eventId: string): Promise<boolean> {
  if (!uuid.safeParse(eventId).success) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id").eq("id", eventId).eq("wedding_id", weddingId).maybeSingle();
  return Boolean(data);
}

async function ensurePlan(weddingId: string, eventId: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_plans")
    .upsert({ wedding_id: weddingId, event_id: eventId }, { onConflict: "event_id", ignoreDuplicates: true });
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const tableFieldsSchema = z.object({
  label: z.string().trim().min(1, "Give the table a name").max(60),
  shape: shapeSchema,
  capacity: z.coerce.number().int().min(1, "At least one seat").max(400, "Too many seats for one table"),
  reserved_seats: z.coerce.number().int().min(0).max(400).default(0),
  reserved_note: z.string().trim().max(200).optional(),
  ends_seated: z.boolean().default(false),
  accessible: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
  width_cm: z.coerce.number().int().min(40).max(2000).nullable().optional(),
  length_cm: z.coerce.number().int().min(40).max(2000).nullable().optional(),
  // Ceremony rows and banquet runs (spec 57 A.3); left out, they stay as they are.
  rows_count: z.coerce.number().int().min(1).max(100).optional(),
  aisle_cm: z.coerce.number().int().min(0).max(1000).optional(),
  segments: z.unknown().optional(),
});

export async function createSeatingTable(
  eventId: string,
  fields: {
    shape?: string;
    capacity?: number;
    label?: string;
    pos_x_cm?: number;
    pos_y_cm?: number;
    /** A cocktail table is one place, marked reserved, so it has no seats to fill. */
    reserved_seats?: number;
    rows_count?: number;
    aisle_cm?: number;
    segments?: unknown;
  },
  layoutId?: string,
  spaceId?: string,
): Promise<ActionResult<{ id: string; label: string }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const space = await resolveSpace(wedding.id, layout.layout.id, spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data) return fail("That room isn't part of this layout");

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("seating_tables")
    .select("label, sort_order")
    .eq("wedding_id", wedding.id)
    .eq("layout_id", layout.layout.id);
  if (readError) return fail(readError.message);

  const shape = shapeSchema.catch("round").parse(fields.shape);
  const capacity = z.coerce.number().int().min(1).max(shape === "rows" || shape === "banquet" ? 400 : 60).catch(shape === "head" ? 6 : shape === "sweetheart" ? 2 : shape === "rows" ? 40 : shape === "banquet" ? 20 : 8).parse(fields.capacity ?? undefined);
  const segments = shape === "banquet" ? readSegments(fields.segments) : [];
  const label = fields.label?.trim() || nextTableLabel((existing ?? []).map((t) => t.label));
  const sortOrder = Math.max(0, ...(existing ?? []).map((t) => t.sort_order)) + 1;
  const placed = Number.isFinite(fields.pos_x_cm) && Number.isFinite(fields.pos_y_cm);

  const { data, error } = await supabase
    .from("seating_tables")
    .insert({
      wedding_id: wedding.id,
      event_id: eventId,
      layout_id: layout.layout.id,
      space_id: space.data.id,
      label: label.slice(0, 60),
      shape,
      capacity,
      sort_order: sortOrder,
      pos_x_cm: placed ? Math.round(fields.pos_x_cm!) : null,
      pos_y_cm: placed ? Math.round(fields.pos_y_cm!) : null,
      reserved_seats: Math.max(0, Math.min(capacity, Math.round(fields.reserved_seats ?? 0))),
      // The database insists rows have a row count and nothing else does.
      rows_count: shape === "rows" ? z.coerce.number().int().min(1).max(100).catch(4).parse(fields.rows_count ?? undefined) : null,
      aisle_cm: shape === "rows" ? z.coerce.number().int().min(0).max(1000).catch(120).parse(fields.aisle_cm ?? undefined) : null,
      segments: shape === "banquet" && segments.length > 0 ? segments : null,
    })
    .select("id, label")
    .single();
  if (error) return fail(error.message);

  revalidate(eventId);
  return ok({ id: data.id, label: data.label });
}

/**
 * Edits a table. Shrinking it below a chosen chair (§D.3) clears that guest's
 * chair in the same request — they stay at the table, chair not chosen — so
 * nobody is left sitting in chair 9 of an 8-seat table.
 */
export async function updateSeatingTable(
  tableId: string,
  eventId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ chairsCleared: number }>> {
  const wedding = await requireWedding();
  const parsed = tableFieldsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  if (parsed.data.capacity > 60 && parsed.data.shape !== "rows" && parsed.data.shape !== "banquet") {
    return fail("Sixty seats at most, except for ceremony rows and banquet runs", { capacity: ["Sixty seats at most"] });
  }
  if (parsed.data.reserved_seats > parsed.data.capacity) {
    return fail("Reserved seats can't be more than the table's seats", {
      reserved_seats: ["More than the table seats"],
    });
  }

  const supabase = await createClient();
  // Rows need a row count and banquet runs their pieces; every other shape has neither.
  const { data: current, error: currentError } = await supabase
    .from("seating_tables")
    .select("rows_count, aisle_cm, segments")
    .eq("id", tableId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (currentError) return fail(currentError.message);
  if (!current) return fail("That table doesn't exist");
  const isRows = parsed.data.shape === "rows";
  const isBanquet = parsed.data.shape === "banquet";
  const segments = isBanquet ? (parsed.data.segments !== undefined ? readSegments(parsed.data.segments) : readSegments(current.segments)) : [];
  const { error } = await supabase
    .from("seating_tables")
    .update({
      rows_count: isRows ? (parsed.data.rows_count ?? current.rows_count ?? 4) : null,
      aisle_cm: isRows ? (parsed.data.aisle_cm ?? current.aisle_cm ?? 120) : null,
      segments: isBanquet && segments.length > 0 ? segments : null,
      label: parsed.data.label,
      shape: parsed.data.shape,
      capacity: parsed.data.capacity,
      reserved_seats: parsed.data.reserved_seats,
      reserved_note: parsed.data.reserved_note || null,
      ends_seated: parsed.data.shape === "long" && parsed.data.ends_seated,
      accessible: parsed.data.accessible,
      notes: parsed.data.notes || null,
      width_cm: parsed.data.width_cm ?? null,
      length_cm: parsed.data.length_cm ?? null,
    })
    .eq("id", tableId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  const { data: cleared, error: clearError } = await supabase
    .from("seat_assignments")
    .update({ seat_index: null })
    .eq("table_id", tableId)
    .eq("wedding_id", wedding.id)
    .gte("seat_index", parsed.data.capacity)
    .select("guest_id");
  if (clearError) return fail(clearError.message);

  revalidate(eventId);
  await revalidateGuestPagesIfRevealed(eventId);
  return ok({ chairsCleared: cleared?.length ?? 0 });
}

export async function reorderSeatingTables(eventId: string, orderedIds: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  const ids = z.array(uuid).max(500).safeParse(orderedIds);
  if (!ids.success) return fail("That order doesn't make sense");

  const supabase = await createClient();
  const results = await Promise.all(
    ids.data.map((id, i) =>
      supabase.from("seating_tables").update({ sort_order: i + 1 }).eq("id", id).eq("wedding_id", wedding.id).eq("event_id", eventId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(failed.error.message);

  revalidate(eventId);
  return ok(undefined);
}

/** Deletes a table; its guests go back to the tray (the FK cascades their assignments). */
export async function deleteSeatingTable(tableId: string, eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("seating_tables").delete().eq("id", tableId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidate(eventId);
  await revalidateGuestPagesIfRevealed(eventId);
  return ok(undefined);
}

/** Position and rotation in the room (§C.1). Null x/y takes it back off the floor. Saved on pointer-up, once per drag. */
export async function moveSeatingTable(
  tableId: string,
  eventId: string,
  position: { x: number | null; y: number | null; rotation?: number; spaceId?: string },
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const placed = position.x !== null && position.y !== null;
  if (placed && (!Number.isFinite(position.x) || !Number.isFinite(position.y))) return fail("That's not a position");

  const supabase = await createClient();
  // Placing a table in a room puts it in THAT room: the same layout's other space (the composite key refuses a space of another layout).
  const moveSpace = placed && position.spaceId && uuid.safeParse(position.spaceId).success ? { space_id: position.spaceId } : {};
  const { error } = await supabase
    .from("seating_tables")
    .update({
      ...moveSpace,
      pos_x_cm: placed ? Math.round(position.x!) : null,
      pos_y_cm: placed ? Math.round(position.y!) : null,
      ...(position.rotation === undefined ? {} : { rotation_deg: normaliseDegrees(position.rotation) }),
    })
    .eq("id", tableId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidate(eventId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/**
 * Seats guests at a table (`tableId`), or returns them to the tray (`null`).
 *
 * One action for one person, a whole household, and "back to the tray". With
 * `seatIndex` it places ONE guest in one chair; if someone is already in it,
 * the two swap — the other person takes the mover's old place (a chair, a
 * table with no chair, or the tray). New seats are only for people invited to
 * this event; the warnings handle anyone who stops being invited afterwards.
 */
export async function assignGuests(
  eventId: string,
  tableId: string | null,
  guestIds: string[],
  seatIndex?: number | null,
  layoutId?: string,
): Promise<ActionResult<{ swappedWith: string | null }>> {
  const wedding = await requireWedding();
  const ids = z.array(uuid).min(1).max(300).safeParse(guestIds);
  if (!ids.success) return fail("Nobody to move");
  if (tableId !== null && !uuid.safeParse(tableId).success) return fail("That table doesn't exist");
  const chair = seatIndex === undefined || seatIndex === null ? null : z.number().int().min(0).max(399).safeParse(seatIndex);
  if (chair && !chair.success) return fail("That chair doesn't exist");
  if (chair && ids.data.length !== 1) return fail("One person per chair");

  const supabase = await createClient();
  // The layout is the target table's; only putting someone back in the tray needs it named (or the live one).
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const layoutKey = layout.layout.id;

  if (tableId === null) {
    const { error } = await supabase
      .from("seat_assignments")
      .delete()
      .eq("wedding_id", wedding.id)
      .eq("layout_id", layoutKey)
      .in("guest_id", ids.data);
    if (error) return fail(error.message);
    revalidate(eventId);
    await revalidateGuestPagesIfRevealed(eventId);
    return ok({ swappedWith: null });
  }

  const { data: target, error: targetError } = await supabase
    .from("seating_tables")
    .select("id, capacity")
    .eq("id", tableId)
    .eq("wedding_id", wedding.id)
    .eq("event_id", eventId)
    .eq("layout_id", layoutKey)
    .maybeSingle();
  if (targetError) return fail(targetError.message);
  if (!target) return fail("That table isn't part of this layout");
  if (chair && chair.data >= target.capacity) return fail("That chair isn't at this table");
  if (chair) {
    const { data: blocked, error: blockedError } = await supabase
      .from("seating_chairs_blocked")
      .select("seat_index")
      .eq("table_id", tableId)
      .eq("seat_index", chair.data)
      .maybeSingle();
    if (blockedError) return fail(blockedError.message);
    if (blocked) return fail("That chair is out of use");
  }

  const { data: invited, error: inviteError } = await supabase
    .from("v_guest_event_invites")
    .select("guest_id")
    .eq("wedding_id", wedding.id)
    .eq("event_id", eventId)
    .eq("invited", true)
    .in("guest_id", ids.data);
  if (inviteError) return fail(inviteError.message);
  const invitedIds = new Set((invited ?? []).map((r) => r.guest_id));

  // Someone already seated may be moved even if they're no longer invited —
  // the planner is tidying, not seating someone new.
  const { data: current, error: currentError } = await supabase
    .from("seat_assignments")
    .select("guest_id, table_id, seat_index")
    .eq("wedding_id", wedding.id)
    .eq("layout_id", layoutKey)
    .in("guest_id", ids.data);
  if (currentError) return fail(currentError.message);
  const currentBy = new Map((current ?? []).map((r) => [r.guest_id, r]));
  const refused = ids.data.filter((id) => !invitedIds.has(id) && !currentBy.has(id));
  if (refused.length > 0) {
    return fail(
      refused.length === 1
        ? "That guest isn't invited to this event — invite them first"
        : `${refused.length} of those guests aren't invited to this event — invite them first`,
    );
  }

  let swappedWith: string | null = null;
  if (chair) {
    const mover = ids.data[0]!;
    const { data: occupant, error: occError } = await supabase
      .from("seat_assignments")
      .select("guest_id")
      .eq("table_id", tableId)
      .eq("seat_index", chair.data)
      .maybeSingle();
    if (occError) return fail(occError.message);

    if (occupant && occupant.guest_id !== mover) {
      swappedWith = occupant.guest_id;
      const from = currentBy.get(mover);
      // Free the chair first: the one-guest-per-chair index would refuse the move otherwise.
      if (from) {
        const { error } = await supabase
          .from("seat_assignments")
          .update({ table_id: from.table_id, seat_index: null })
          .eq("guest_id", occupant.guest_id)
          .eq("layout_id", layoutKey);
        if (error) return fail(error.message);
      } else {
        const { error } = await supabase
          .from("seat_assignments")
          .delete()
          .eq("guest_id", occupant.guest_id)
          .eq("layout_id", layoutKey);
        if (error) return fail(error.message);
      }
    }

    const { error } = await supabase.from("seat_assignments").upsert(
      { wedding_id: wedding.id, event_id: eventId, layout_id: layoutKey, guest_id: mover, table_id: tableId, seat_index: chair.data },
      { onConflict: "guest_id,layout_id" },
    );
    if (error) return fail(error.message);

    // The displaced guest takes the mover's old chair, if it had one.
    const from = currentBy.get(mover);
    if (swappedWith && from && from.seat_index !== null) {
      const { error: swapError } = await supabase
        .from("seat_assignments")
        .update({ seat_index: from.seat_index })
        .eq("guest_id", swappedWith)
        .eq("layout_id", layoutKey);
      if (swapError) return fail(swapError.message);
    }
  } else {
    // Moving to a table without choosing a chair. Someone who stays at the
    // same table keeps their chair; someone arriving has none yet.
    const rows = ids.data.map((guestId) => {
      const prev = currentBy.get(guestId);
      return {
        wedding_id: wedding.id,
        event_id: eventId,
        layout_id: layoutKey,
        guest_id: guestId,
        table_id: tableId,
        seat_index: prev && prev.table_id === tableId ? prev.seat_index : null,
      };
    });
    const { error } = await supabase.from("seat_assignments").upsert(rows, { onConflict: "guest_id,layout_id" });
    if (error) return fail(error.message);
  }

  revalidate(eventId);
  await revalidateGuestPagesIfRevealed(eventId);
  return ok({ swappedWith });
}

/** "Clear chairs": everyone at the table stays, with no chair chosen. */
export async function clearTableChairs(tableId: string, eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("seat_assignments")
    .update({ seat_index: null })
    .eq("table_id", tableId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  await revalidateGuestPagesIfRevealed(eventId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const ruleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["together", "apart", "near"]), guestA: uuid, guestB: uuid, note: z.string().trim().max(300).optional() }),
  z.object({ kind: z.literal("avoid_table"), guestA: uuid, tableId: uuid, note: z.string().trim().max(300).optional() }),
  z.object({ kind: z.literal("accessible"), guestA: uuid, note: z.string().trim().max(300).optional() }),
]);

export async function addSeatingRule(eventId: string, fields: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = ruleSchema.safeParse(fields);
  if (!parsed.success) return fail("That rule needs both people (or a table)");
  const r = parsed.data;

  let row: { kind: typeof r.kind; guest_a: string; guest_b: string | null; table_id: string | null };
  if (r.kind === "avoid_table") row = { kind: r.kind, guest_a: r.guestA, guest_b: null, table_id: r.tableId };
  else if (r.kind === "accessible") row = { kind: r.kind, guest_a: r.guestA, guest_b: null, table_id: null };
  else {
    if (r.guestA === r.guestB) return fail("Pick two different people");
    // Stored smaller id first (the database insists), so a pair is one row whichever way round it was entered.
    const [a, b] = [r.guestA, r.guestB].sort();
    row = { kind: r.kind, guest_a: a!, guest_b: b!, table_id: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_rules")
    .insert({ wedding_id: wedding.id, ...row, note: r.note || null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return fail("That rule is already there");
    return fail(error.message);
  }
  revalidate(eventId);
  return ok({ id: data.id });
}

export async function removeSeatingRule(ruleId: string, eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("seating_rules").delete().eq("id", ruleId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

export async function updateSeatingRoom(
  eventId: string,
  fields: { room_width_cm: number; room_depth_cm: number },
  layoutId?: string,
  spaceId?: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const dims = z
    .object({
      room_width_cm: z.coerce.number().int().min(300, "At least 3 m").max(20000, "200 m at most"),
      room_depth_cm: z.coerce.number().int().min(300, "At least 3 m").max(20000, "200 m at most"),
    })
    .safeParse(fields);
  if (!dims.success) return fail("Those room sizes don't work", dims.error.flatten().fieldErrors);
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");

  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const space = await resolveSpace(wedding.id, layout.layout.id, spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data) return fail("This layout has no room yet");
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_spaces")
    .update({ ...dims.data, calibrated: false })
    .eq("id", space.data.id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/** Two points on the venue image and the real distance between them (§C.3). Points are in image pixels. */
export async function calibrateSeatingRoom(
  eventId: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
  realCm: number,
  layoutId?: string,
  spaceId?: string,
): Promise<ActionResult<{ room_width_cm: number; room_depth_cm: number }>> {
  const wedding = await requireWedding();
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const space = await resolveSpace(wedding.id, layout.layout.id, spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data?.background_w_px || !space.data.background_h_px) return fail("Upload the venue's floor plan first");

  const dims = calibrateRoom({ width: space.data.background_w_px, height: space.data.background_h_px }, a, b, realCm);
  if (!dims) return fail("Pick two points further apart, and a distance above zero");

  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_spaces")
    .update({ ...dims, calibrated: true })
    .eq("id", space.data.id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(dims);
}

const BACKGROUND_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;

/**
 * A signed URL the browser PUTs the venue image to — the bytes never pass
 * through an action (next.config.mjs caps those at 4MB), same as every other
 * upload here. The path is built from ids the server holds, never from the client.
 */
export async function requestSeatingBackgroundUpload(
  eventId: string,
  fields: { content_type: string; byte_size: number },
): Promise<ActionResult<{ path: string; uploadUrl: string }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  if (!(BACKGROUND_TYPES as readonly string[]).includes(fields.content_type)) return fail("A JPEG, PNG or WebP image, please");
  if (!(fields.byte_size > 0) || fields.byte_size > MAX_BACKGROUND_BYTES) return fail("Anything under 10MB is fine");

  const ext = fields.content_type === "image/png" ? "png" : fields.content_type === "image/jpeg" ? "jpg" : "webp";
  const path = `seating/${wedding.id}/${eventId}/${crypto.randomUUID()}.${ext}`;
  const upload = await createUploadUrl(path);
  if (!upload) return fail("Storage isn't reachable. Has scripts/ensure-bucket.mjs been run here?");
  return ok({ path, uploadUrl: upload.signedUrl });
}

/**
 * Records the uploaded image on the layout's room. A draft copy shares its
 * source's image file until it is replaced, so a file is only removed once no
 * space still points at it.
 */
async function removeBackgroundFileIfUnused(weddingId: string, path: string): Promise<void> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("seating_spaces")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", weddingId)
    .eq("background_path", path);
  if ((count ?? 0) === 0) await removePaths([path]);
}

export async function confirmSeatingBackground(
  eventId: string,
  fields: { path: string; width: number; height: number },
  layoutId?: string,
  spaceId?: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const prefix = `seating/${wedding.id}/${eventId}/`;
  if (!fields.path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(webp|jpg|png)$/.test(fields.path.slice(prefix.length))) {
    return fail("That isn't this event's image");
  }
  const size = z.object({ width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000) }).safeParse(fields);
  if (!size.success) return fail("Couldn't read the image's size");

  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const space = await resolveSpace(wedding.id, layout.layout.id, spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data) return fail("This layout has no room yet");
  const supabase = await createClient();

  // Fit the room box to the image's shape, keeping the width the planner had.
  const width = space.data.room_width_cm ?? 2000;
  const depth = Math.min(20000, Math.max(300, Math.round((width * size.data.height) / size.data.width)));

  const { error } = await supabase
    .from("seating_spaces")
    .update({
      background_path: fields.path,
      background_w_px: size.data.width,
      background_h_px: size.data.height,
      room_depth_cm: depth,
      calibrated: false,
    })
    .eq("id", space.data.id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  if (space.data.background_path && space.data.background_path !== fields.path) {
    await removeBackgroundFileIfUnused(wedding.id, space.data.background_path);
  }
  revalidate(eventId);
  return ok(undefined);
}

export async function removeSeatingBackground(eventId: string, layoutId?: string, spaceId?: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const space = await resolveSpace(wedding.id, layout.layout.id, spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data?.background_path) return ok(undefined);

  // The row first, then the bytes if nothing else uses them (a draft may share the file).
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_spaces")
    .update({ background_path: null, background_w_px: null, background_h_px: null, calibrated: false })
    .eq("id", space.data.id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  await removeBackgroundFileIfUnused(wedding.id, space.data.background_path);
  revalidate(eventId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function createSeatingFixture(
  eventId: string,
  fields: {
    kind: string;
    pos_x_cm: number;
    pos_y_cm: number;
    width_cm: number;
    depth_cm: number;
    label?: string | null;
    /** Décor: how many this one placed item stands for. */
    quantity?: number;
    vendor_id?: string | null;
    /** A kind `custom` item is one of the couple's own; a kind `marquee` can name a marquee template. */
    custom_item_id?: string | null;
    marquee_id?: string | null;
  },
  layoutId?: string,
  spaceId?: string,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = z
    .object({
      kind: fixtureKindSchema,
      pos_x_cm: z.number().finite(),
      pos_y_cm: z.number().finite(),
      width_cm: z.number().int().min(20).max(5000),
      depth_cm: z.number().int().min(20).max(5000),
      label: z.string().trim().max(60).nullable().optional(),
      quantity: z.number().int().min(1).max(9999).optional(),
      vendor_id: uuid.nullable().optional(),
      custom_item_id: uuid.nullable().optional(),
      marquee_id: uuid.nullable().optional(),
    })
    .safeParse(fields);
  if (!parsed.success) return fail("That doesn't fit in the room");
  // The database insists a custom item is named and nothing else names one.
  if ((parsed.data.kind === "custom") !== Boolean(parsed.data.custom_item_id)) return fail("Pick which of your own items that is");
  if (parsed.data.marquee_id && parsed.data.kind !== "marquee") return fail("Only a marquee can name a marquee template");
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const space = await resolveSpace(wedding.id, layout.layout.id, spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data) return fail("That room isn't part of this layout");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_fixtures")
    .insert({
      wedding_id: wedding.id,
      event_id: eventId,
      layout_id: layout.layout.id,
      space_id: space.data.id,
      kind: parsed.data.kind,
      pos_x_cm: Math.round(parsed.data.pos_x_cm),
      pos_y_cm: Math.round(parsed.data.pos_y_cm),
      width_cm: parsed.data.width_cm,
      depth_cm: parsed.data.depth_cm,
      label: parsed.data.label || null,
      quantity: parsed.data.quantity ?? 1,
      vendor_id: parsed.data.vendor_id ?? null,
      custom_item_id: parsed.data.custom_item_id ?? null,
      marquee_id: parsed.data.marquee_id ?? null,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ id: data.id });
}

export async function updateSeatingFixture(
  fixtureId: string,
  eventId: string,
  fields: {
    label?: string | null;
    pos_x_cm?: number;
    pos_y_cm?: number;
    width_cm?: number;
    depth_cm?: number;
    rotation_deg?: number;
    quantity?: number;
    vendor_id?: string | null;
  },
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z
    .object({
      label: z.string().trim().max(60).nullable().optional(),
      pos_x_cm: z.number().finite().optional(),
      pos_y_cm: z.number().finite().optional(),
      width_cm: z.number().int().min(20).max(5000).optional(),
      depth_cm: z.number().int().min(20).max(5000).optional(),
      rotation_deg: z.number().finite().optional(),
      quantity: z.number().int().min(1).max(9999).optional(),
      vendor_id: uuid.nullable().optional(),
    })
    .safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const f = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_fixtures")
    .update({
      ...(f.label === undefined ? {} : { label: f.label || null }),
      ...(f.pos_x_cm === undefined ? {} : { pos_x_cm: Math.round(f.pos_x_cm) }),
      ...(f.pos_y_cm === undefined ? {} : { pos_y_cm: Math.round(f.pos_y_cm) }),
      ...(f.width_cm === undefined ? {} : { width_cm: f.width_cm }),
      ...(f.depth_cm === undefined ? {} : { depth_cm: f.depth_cm }),
      ...(f.rotation_deg === undefined ? {} : { rotation_deg: normaliseDegrees(f.rotation_deg) }),
      ...(f.quantity === undefined ? {} : { quantity: f.quantity }),
      ...(f.vendor_id === undefined ? {} : { vendor_id: f.vendor_id }),
    })
    .eq("id", fixtureId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

export async function deleteSeatingFixture(fixtureId: string, eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("seating_fixtures").delete().eq("id", fixtureId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Snapshots (Part E)
// ---------------------------------------------------------------------------

export async function saveSeatingSnapshot(eventId: string, name: string, layoutId?: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsedName = z.string().trim().min(1, "Give the copy a name").max(120).safeParse(name);
  if (!parsedName.success) return fail(parsedName.error.issues[0]?.message ?? "Give the copy a name");
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");

  const user = await getSessionUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("take_seating_snapshot", {
    p_event_id: eventId,
    p_name: parsedName.data,
    p_created_by: user?.id ?? null,
    p_layout_id: layoutId ?? null,
  });
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ id: data });
}

export async function restoreSeatingSnapshot(
  snapshotId: string,
  eventId: string,
): Promise<ActionResult<{ tables: number; fixtures: number; seated: number; skipped: number }>> {
  await requireWedding();
  if (!uuid.safeParse(snapshotId).success) return fail("That copy doesn't exist");
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_seating_snapshot", {
    p_snapshot_id: snapshotId,
    p_created_by: user?.id ?? null,
  });
  if (error) return fail(error.message);
  revalidate(eventId);
  await revalidateGuestPagesIfRevealed(eventId);
  return ok(data);
}

export async function renameSeatingSnapshot(snapshotId: string, eventId: string, name: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsedName = z.string().trim().min(1).max(120).safeParse(name);
  if (!parsedName.success) return fail("Give the copy a name");
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_snapshots")
    .update({ name: parsedName.data })
    .eq("id", snapshotId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

export async function deleteSeatingSnapshot(snapshotId: string, eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("seating_snapshots").delete().eq("id", snapshotId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Reveal (Part F)
// ---------------------------------------------------------------------------

/** `at` is a datetime-local string in the wedding's timezone, or "" to hide tables from guests again. */
export async function setSeatingReveal(eventId: string, at: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  let revealAt: string | null = null;
  if (at.trim()) {
    revealAt = zonedInputToUtc(at, wedding.timezone);
    if (!revealAt) return fail("That doesn't look like a valid date and time");
  }

  const planError = await ensurePlan(wedding.id, eventId);
  if (planError) return fail(planError);
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_plans")
    .update({ reveal_at: revealAt })
    .eq("event_id", eventId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  revalidatePath("/w", "layout");
  return ok(undefined);
}
