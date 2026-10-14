"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import { calibrateRoom, normaliseDegrees } from "@/lib/seating/geometry";
import { nextTableLabel } from "@/lib/seating/model";
import { zonedInputToUtc } from "@/lib/timezone";
import { getSessionUser, requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * Every write the seating screen makes (spec 33). One small write per move —
 * never a whole-plan save — so two people editing lose at most the one move
 * that collided, and an optimistic screen has one thing to roll back.
 */

const uuid = z.string().uuid();
const shapeSchema = z.enum(["round", "long", "square", "head"]);
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
  capacity: z.coerce.number().int().min(1, "At least one seat").max(60, "Sixty seats at most"),
  reserved_seats: z.coerce.number().int().min(0).max(60).default(0),
  reserved_note: z.string().trim().max(200).optional(),
  ends_seated: z.boolean().default(false),
  accessible: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
  width_cm: z.coerce.number().int().min(40).max(2000).nullable().optional(),
  length_cm: z.coerce.number().int().min(40).max(2000).nullable().optional(),
});

export async function createSeatingTable(
  eventId: string,
  fields: { shape?: string; capacity?: number; label?: string; pos_x_cm?: number; pos_y_cm?: number },
): Promise<ActionResult<{ id: string; label: string }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("seating_tables")
    .select("label, sort_order")
    .eq("wedding_id", wedding.id)
    .eq("event_id", eventId);
  if (readError) return fail(readError.message);

  const shape = shapeSchema.catch("round").parse(fields.shape);
  const capacity = z.coerce.number().int().min(1).max(60).catch(shape === "head" ? 6 : 8).parse(fields.capacity ?? undefined);
  const label = fields.label?.trim() || nextTableLabel((existing ?? []).map((t) => t.label));
  const sortOrder = Math.max(0, ...(existing ?? []).map((t) => t.sort_order)) + 1;
  const placed = Number.isFinite(fields.pos_x_cm) && Number.isFinite(fields.pos_y_cm);

  const { data, error } = await supabase
    .from("seating_tables")
    .insert({
      wedding_id: wedding.id,
      event_id: eventId,
      label: label.slice(0, 60),
      shape,
      capacity,
      sort_order: sortOrder,
      pos_x_cm: placed ? Math.round(fields.pos_x_cm!) : null,
      pos_y_cm: placed ? Math.round(fields.pos_y_cm!) : null,
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
  if (parsed.data.reserved_seats > parsed.data.capacity) {
    return fail("Reserved seats can't be more than the table's seats", {
      reserved_seats: ["More than the table seats"],
    });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_tables")
    .update({
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
  position: { x: number | null; y: number | null; rotation?: number },
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const placed = position.x !== null && position.y !== null;
  if (placed && (!Number.isFinite(position.x) || !Number.isFinite(position.y))) return fail("That's not a position");

  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_tables")
    .update({
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
): Promise<ActionResult<{ swappedWith: string | null }>> {
  const wedding = await requireWedding();
  const ids = z.array(uuid).min(1).max(300).safeParse(guestIds);
  if (!ids.success) return fail("Nobody to move");
  if (tableId !== null && !uuid.safeParse(tableId).success) return fail("That table doesn't exist");
  const chair = seatIndex === undefined || seatIndex === null ? null : z.number().int().min(0).max(59).safeParse(seatIndex);
  if (chair && !chair.success) return fail("That chair doesn't exist");
  if (chair && ids.data.length !== 1) return fail("One person per chair");

  const supabase = await createClient();

  if (tableId === null) {
    const { error } = await supabase
      .from("seat_assignments")
      .delete()
      .eq("wedding_id", wedding.id)
      .eq("event_id", eventId)
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
    .maybeSingle();
  if (targetError) return fail(targetError.message);
  if (!target) return fail("That table isn't part of this event");
  if (chair && chair.data >= target.capacity) return fail("That chair isn't at this table");

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
    .eq("event_id", eventId)
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
          .eq("event_id", eventId);
        if (error) return fail(error.message);
      } else {
        const { error } = await supabase
          .from("seat_assignments")
          .delete()
          .eq("guest_id", occupant.guest_id)
          .eq("event_id", eventId);
        if (error) return fail(error.message);
      }
    }

    const { error } = await supabase.from("seat_assignments").upsert(
      { wedding_id: wedding.id, event_id: eventId, guest_id: mover, table_id: tableId, seat_index: chair.data },
      { onConflict: "guest_id,event_id" },
    );
    if (error) return fail(error.message);

    // The displaced guest takes the mover's old chair, if it had one.
    const from = currentBy.get(mover);
    if (swappedWith && from && from.seat_index !== null) {
      await supabase
        .from("seat_assignments")
        .update({ seat_index: from.seat_index })
        .eq("guest_id", swappedWith)
        .eq("event_id", eventId);
    }
  } else {
    // Moving to a table without choosing a chair. Someone who stays at the
    // same table keeps their chair; someone arriving has none yet.
    const rows = ids.data.map((guestId) => {
      const prev = currentBy.get(guestId);
      return {
        wedding_id: wedding.id,
        event_id: eventId,
        guest_id: guestId,
        table_id: tableId,
        seat_index: prev && prev.table_id === tableId ? prev.seat_index : null,
      };
    });
    const { error } = await supabase.from("seat_assignments").upsert(rows, { onConflict: "guest_id,event_id" });
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

  const planError = await ensurePlan(wedding.id, eventId);
  if (planError) return fail(planError);
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_plans")
    .update({ ...dims.data, calibrated: false })
    .eq("event_id", eventId)
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
): Promise<ActionResult<{ room_width_cm: number; room_depth_cm: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: plan, error: readError } = await supabase
    .from("seating_plans")
    .select("background_w_px, background_h_px")
    .eq("event_id", eventId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!plan?.background_w_px || !plan.background_h_px) return fail("Upload the venue's floor plan first");

  const dims = calibrateRoom({ width: plan.background_w_px, height: plan.background_h_px }, a, b, realCm);
  if (!dims) return fail("Pick two points further apart, and a distance above zero");

  const { error } = await supabase
    .from("seating_plans")
    .update({ ...dims, calibrated: true })
    .eq("event_id", eventId)
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

/** Records the uploaded image on the plan and removes the one it replaces. */
export async function confirmSeatingBackground(
  eventId: string,
  fields: { path: string; width: number; height: number },
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const prefix = `seating/${wedding.id}/${eventId}/`;
  if (!fields.path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(webp|jpg|png)$/.test(fields.path.slice(prefix.length))) {
    return fail("That isn't this event's image");
  }
  const size = z.object({ width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000) }).safeParse(fields);
  if (!size.success) return fail("Couldn't read the image's size");

  const planError = await ensurePlan(wedding.id, eventId);
  if (planError) return fail(planError);
  const supabase = await createClient();
  const { data: before } = await supabase.from("seating_plans").select("background_path").eq("event_id", eventId).maybeSingle();

  // Fit the room box to the image's shape, keeping the width the planner had.
  const { data: plan } = await supabase.from("seating_plans").select("room_width_cm").eq("event_id", eventId).maybeSingle();
  const width = plan?.room_width_cm ?? 2000;
  const depth = Math.min(20000, Math.max(300, Math.round((width * size.data.height) / size.data.width)));

  const { error } = await supabase
    .from("seating_plans")
    .update({
      background_path: fields.path,
      background_w_px: size.data.width,
      background_h_px: size.data.height,
      room_depth_cm: depth,
      calibrated: false,
    })
    .eq("event_id", eventId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  if (before?.background_path && before.background_path !== fields.path) await removePaths([before.background_path]);
  revalidate(eventId);
  return ok(undefined);
}

export async function removeSeatingBackground(eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("seating_plans")
    .select("background_path")
    .eq("event_id", eventId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (!before?.background_path) return ok(undefined);

  // Bytes first, then the row (storage.ts: the other order strands objects).
  const removed = await removePaths([before.background_path]);
  if (!removed.ok) return fail(removed.error ?? "Couldn't remove the image");
  const { error } = await supabase
    .from("seating_plans")
    .update({ background_path: null, background_w_px: null, background_h_px: null, calibrated: false })
    .eq("event_id", eventId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export async function createSeatingFixture(
  eventId: string,
  fields: { kind: string; pos_x_cm: number; pos_y_cm: number; width_cm: number; depth_cm: number },
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = z
    .object({
      kind: fixtureKindSchema,
      pos_x_cm: z.number().finite(),
      pos_y_cm: z.number().finite(),
      width_cm: z.number().int().min(20).max(5000),
      depth_cm: z.number().int().min(20).max(5000),
    })
    .safeParse(fields);
  if (!parsed.success) return fail("That doesn't fit in the room");
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_fixtures")
    .insert({
      wedding_id: wedding.id,
      event_id: eventId,
      kind: parsed.data.kind,
      pos_x_cm: Math.round(parsed.data.pos_x_cm),
      pos_y_cm: Math.round(parsed.data.pos_y_cm),
      width_cm: parsed.data.width_cm,
      depth_cm: parsed.data.depth_cm,
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
  fields: { label?: string | null; pos_x_cm?: number; pos_y_cm?: number; width_cm?: number; depth_cm?: number; rotation_deg?: number },
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

export async function saveSeatingSnapshot(eventId: string, name: string): Promise<ActionResult<{ id: string }>> {
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
