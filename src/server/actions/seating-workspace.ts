"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildTemplate, planRenumber, type TemplateInput } from "@/lib/seating/template";
import { nextTableLabel } from "@/lib/seating/model";
import { getSessionUser, requireWedding } from "@/server/queries/wedding";
import { firstSpaceOf, resolveLayout } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * Seating workspace writes (spec 53): undo and redo through whole-plan state,
 * automatic versions, the room template, tables in bulk, duplicate and
 * renumber, and blocked chairs. Every Supabase `error` is checked.
 */

const uuid = z.string().uuid();
const AUTO_VERSION_GAP_MS = 30 * 60_000;
const SEATING_TABLES = ["seating_plans", "seating_tables", "seating_fixtures", "seat_assignments", "seating_rules", "seating_chairs_blocked"];

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/seating`);
  revalidatePath(`/events/${eventId}/seating/print`);
  revalidatePath("/seating");
}

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

export type SeatingStateCapture = { payload: Record<string, unknown>; hash: string };

/**
 * The plan as it is now, for the undo stack. With `beforeChange`, also takes an
 * automatic version when this is the first change after 30 minutes with no
 * changes (spec 53 C.2): the snapshot is the plan as it was before the change.
 */
export async function captureSeatingState(eventId: string, beforeChange = false, layoutId?: string): Promise<ActionResult<SeatingStateCapture>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const supabase = await createClient();

  if (beforeChange) {
    const now = Date.now();
    const [lastChange, lastAuto] = await Promise.all([
      supabase.from("audit_log").select("at").eq("wedding_id", wedding.id).in("table_name", SEATING_TABLES).order("at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("seating_snapshots").select("created_at").eq("layout_id", layout.layout.id).eq("automatic", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (lastChange.error) return fail(lastChange.error.message);
    if (lastAuto.error) return fail(lastAuto.error.message);
    const quiet = !lastChange.data || now - Date.parse(lastChange.data.at) >= AUTO_VERSION_GAP_MS;
    const recentAuto = lastAuto.data && now - Date.parse(lastAuto.data.created_at) < AUTO_VERSION_GAP_MS;
    if (quiet && !recentAuto) {
      const user = await getSessionUser();
      const when = new Intl.DateTimeFormat("en-NZ", { timeZone: wedding.timezone, weekday: "long", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
      const { error } = await supabase.rpc("take_seating_snapshot", {
        p_event_id: eventId,
        p_name: `Before ${when}'s changes`,
        p_automatic: true,
        p_created_by: user?.id ?? null,
        p_layout_id: layout.layout.id,
      });
      if (error) return fail(error.message);
    }
  }

  const [state, hash] = await Promise.all([
    supabase.rpc("seating_state", { p_event_id: eventId, p_layout_id: layout.layout.id }),
    supabase.rpc("seating_state_hash", { p_event_id: eventId, p_layout_id: layout.layout.id }),
  ]);
  if (state.error) return fail(state.error.message);
  if (hash.error) return fail(hash.error.message);
  return ok({ payload: state.data as Record<string, unknown>, hash: hash.data as string });
}

/** Puts a captured state back, for undo and redo. Refused if the plan changed since `expectedHash`. */
export async function restoreSeatingState(
  eventId: string,
  payload: Record<string, unknown>,
  expectedHash: string,
  layoutId?: string,
): Promise<ActionResult<{ hash: string }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_seating_state", {
    p_event_id: eventId,
    p_payload: payload,
    p_expected_hash: expectedHash,
    p_layout_id: layout.layout.id,
  });
  if (error) {
    if (error.code === "40001") return fail("Someone changed the plan since, so that wasn't undone.");
    return fail(error.message);
  }
  revalidate(eventId);
  await revalidateGuestPagesIfRevealed(eventId);
  return ok({ hash: data.hash });
}

// ---------------------------------------------------------------------------
// Part A: the room template
// ---------------------------------------------------------------------------
const templateSchema = z.object({
  people: z.number().int().min(0).max(1000),
  tables: z.enum(["round8", "round10", "long12", "mixed"]),
  couple: z.enum(["top", "sweetheart", "guests"]),
  elements: z.array(z.enum(["dance_floor", "band", "bar", "buffet", "cake", "photo_booth"])).max(6),
});

async function ensurePlan(weddingId: string, eventId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_plans")
    .upsert({ wedding_id: weddingId, event_id: eventId }, { onConflict: "event_id", ignoreDuplicates: true });
  return error?.message ?? null;
}

/** Makes every table and fixture of a template in one action. Offered only on an empty plan. */
export async function applySeatingTemplate(
  eventId: string,
  input: Omit<TemplateInput, "room">,
  layoutId?: string,
): Promise<ActionResult<{ tables: number; fixtures: number }>> {
  const wedding = await requireWedding();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return fail("Check the layout choices");
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const planError = await ensurePlan(wedding.id, eventId);
  if (planError) return fail(planError);
  const shown = await resolveLayout(wedding.id, eventId, layoutId);
  if (!shown.ok) return fail(shown.error);

  const supabase = await createClient();
  const [existing, space] = await Promise.all([
    supabase.from("seating_tables").select("id", { count: "exact", head: true }).eq("layout_id", shown.layout.id).eq("wedding_id", wedding.id),
    firstSpaceOf(wedding.id, shown.layout.id),
  ]);
  if (existing.error) return fail(existing.error.message);
  if (space.error) return fail(space.error.message);
  if ((existing.count ?? 0) > 0) return fail("This plan already has tables. Use + Tables to add more.");

  const layout = buildTemplate({ ...parsed.data, room: { widthCm: space.data?.room_width_cm ?? 2000, depthCm: space.data?.room_depth_cm ?? 1500 } });
  if (layout.tables.length > 0) {
    const { error } = await supabase.from("seating_tables").insert(
      layout.tables.map((t, i) => ({
        wedding_id: wedding.id,
        event_id: eventId,
        layout_id: shown.layout.id,
        label: t.label,
        shape: t.shape,
        capacity: t.capacity,
        sort_order: i + 1,
        pos_x_cm: t.pos_x_cm,
        pos_y_cm: t.pos_y_cm,
        rotation_deg: t.rotation_deg,
      })),
    );
    if (error) return fail(error.message);
  }
  if (layout.fixtures.length > 0) {
    const { error } = await supabase.from("seating_fixtures").insert(
      layout.fixtures.map((f) => ({
        wedding_id: wedding.id,
        event_id: eventId,
        layout_id: shown.layout.id,
        kind: f.kind,
        label: f.label,
        pos_x_cm: f.pos_x_cm,
        pos_y_cm: f.pos_y_cm,
        width_cm: f.width_cm,
        depth_cm: f.depth_cm,
      })),
    );
    if (error) return fail(error.message);
  }
  revalidate(eventId);
  return ok({ tables: layout.tables.length, fixtures: layout.fixtures.length });
}

// ---------------------------------------------------------------------------
// Part B: tables in bulk, duplicate, renumber
// ---------------------------------------------------------------------------
const bulkSchema = z.object({
  count: z.number().int().min(1).max(40),
  shape: z.enum(["round", "long", "square", "head", "sweetheart", "oval", "half_moon", "serpentine"]),
  capacity: z.number().int().min(1).max(60),
});

/** "6 rounds of 10": added in free space near the centre of the room. */
export async function createSeatingTables(eventId: string, input: z.input<typeof bulkSchema>, layoutId?: string): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return fail("Pick 1 to 40 tables, with 1 to 60 seats each");
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const shown = await resolveLayout(wedding.id, eventId, layoutId);
  if (!shown.ok) return fail(shown.error);
  const supabase = await createClient();
  const [tables, space] = await Promise.all([
    supabase.from("seating_tables").select("label, sort_order, pos_x_cm, pos_y_cm").eq("layout_id", shown.layout.id).eq("wedding_id", wedding.id),
    firstSpaceOf(wedding.id, shown.layout.id),
  ]);
  if (tables.error) return fail(tables.error.message);
  if (space.error) return fail(space.error.message);

  const labels = (tables.data ?? []).map((t) => t.label);
  let sort = Math.max(0, ...(tables.data ?? []).map((t) => t.sort_order));
  const w = space.data?.room_width_cm ?? 2000;
  const d = space.data?.room_depth_cm ?? 1500;
  const placed = (tables.data ?? []).filter((t) => t.pos_x_cm !== null && t.pos_y_cm !== null);
  const step = 320;
  const perRow = Math.max(1, Math.floor((w - 300) / step));
  const originY = placed.length ? Math.max(...placed.map((t) => t.pos_y_cm!)) + step : d / 2 - step;

  const rows = Array.from({ length: parsed.data.count }, (_, i) => {
    const label = nextTableLabel(labels);
    labels.push(label);
    sort += 1;
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    return {
      wedding_id: wedding.id,
      event_id: eventId,
      layout_id: shown.layout.id,
      label,
      shape: parsed.data.shape,
      capacity: parsed.data.capacity,
      sort_order: sort,
      pos_x_cm: Math.round(150 + col * step + step / 2),
      pos_y_cm: Math.round(Math.min(d - 150, originY + row * step)),
    };
  });
  const planError = await ensurePlan(wedding.id, eventId);
  if (planError) return fail(planError);
  const { error } = await supabase.from("seating_tables").insert(rows);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ added: rows.length });
}

/** A copy of a table's shape, size and seats, not its guests, just beside it. */
export async function duplicateSeatingTable(tableId: string, eventId: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  if (!uuid.safeParse(tableId).success) return fail("That table doesn't exist");
  const supabase = await createClient();
  const { data: t, error } = await supabase.from("seating_tables").select("*").eq("id", tableId).eq("event_id", eventId).eq("wedding_id", wedding.id).maybeSingle();
  if (error) return fail(error.message);
  if (!t) return fail("That table doesn't exist");
  const { data: all } = await supabase.from("seating_tables").select("label, sort_order").eq("layout_id", t.layout_id).eq("wedding_id", wedding.id);
  const { data, error: insertError } = await supabase
    .from("seating_tables")
    .insert({
      wedding_id: wedding.id,
      event_id: eventId,
      layout_id: t.layout_id,
      space_id: t.space_id,
      label: nextTableLabel((all ?? []).map((x) => x.label)),
      shape: t.shape,
      capacity: t.capacity,
      reserved_seats: t.reserved_seats,
      reserved_note: t.reserved_note,
      ends_seated: t.ends_seated,
      accessible: t.accessible,
      notes: t.notes,
      sort_order: Math.max(0, ...(all ?? []).map((x) => x.sort_order)) + 1,
      pos_x_cm: t.pos_x_cm === null ? null : t.pos_x_cm + 320,
      pos_y_cm: t.pos_y_cm,
      rotation_deg: t.rotation_deg,
      width_cm: t.width_cm,
      length_cm: t.length_cm,
    })
    .select("id")
    .single();
  if (insertError) return fail(insertError.message);
  revalidate(eventId);
  return ok({ id: data.id });
}

/** Renames a table; a number another table already has swaps the two labels. */
export async function renumberSeatingTable(tableId: string, eventId: string, label: string): Promise<ActionResult<{ swapped: boolean }>> {
  const wedding = await requireWedding();
  const clean = z.string().trim().min(1, "Give the table a name").max(60).safeParse(label);
  if (!clean.success) return fail(clean.error.issues[0]?.message ?? "Give the table a name");
  const supabase = await createClient();
  const { data: mine, error: mineError } = await supabase.from("seating_tables").select("layout_id").eq("id", tableId).eq("wedding_id", wedding.id).maybeSingle();
  if (mineError) return fail(mineError.message);
  if (!mine) return fail("That table doesn't exist");
  const { data: tables, error } = await supabase.from("seating_tables").select("id, label").eq("layout_id", mine.layout_id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  const plan = planRenumber(tables ?? [], tableId, clean.data);
  if (!plan) return fail("That table doesn't exist");

  // Labels have no unique index, so the two writes need no placeholder.
  for (const change of plan) {
    const { error: updateError } = await supabase.from("seating_tables").update({ label: change.label }).eq("id", change.id).eq("wedding_id", wedding.id);
    if (updateError) return fail(updateError.message);
  }
  revalidate(eventId);
  return ok({ swapped: plan.length > 1 });
}

// ---------------------------------------------------------------------------
// Part F: considerations; Part I: blocked chairs
// ---------------------------------------------------------------------------
export async function setGuestConsiderations(guestId: string, fields: { needsHighchair?: boolean; usesWheelchair?: boolean }): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const patch: { needs_highchair?: boolean; uses_wheelchair?: boolean } = {};
  if (fields.needsHighchair !== undefined) patch.needs_highchair = fields.needsHighchair;
  if (fields.usesWheelchair !== undefined) patch.uses_wheelchair = fields.usesWheelchair;
  const { error } = await supabase.from("guests").update(patch).eq("id", guestId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidatePath("/seating");
  revalidatePath("/events", "layout");
  return ok(undefined);
}

export async function setChairBlocked(eventId: string, tableId: string, seatIndex: number, blocked: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const chair = z.number().int().min(0).max(59).safeParse(seatIndex);
  if (!chair.success || !uuid.safeParse(tableId).success) return fail("That chair doesn't exist");
  const supabase = await createClient();
  if (blocked) {
    const { data: seated } = await supabase.from("seat_assignments").select("guest_id").eq("table_id", tableId).eq("seat_index", chair.data).eq("wedding_id", wedding.id).maybeSingle();
    if (seated) return fail("Someone is sitting there. Move them first.");
    const { error } = await supabase
      .from("seating_chairs_blocked")
      .upsert({ wedding_id: wedding.id, event_id: eventId, table_id: tableId, seat_index: chair.data }, { onConflict: "table_id,seat_index", ignoreDuplicates: true });
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("seating_chairs_blocked").delete().eq("table_id", tableId).eq("seat_index", chair.data).eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }
  revalidate(eventId);
  return ok(undefined);
}

/**
 * The plan's "Colour chairs by" (spec 57 Q8: one setting for the plan, shared
 * by every collaborator and the exports). `raw` is `parseColourBy`'s form; an
 * empty string is "Nothing".
 */
export async function setSeatingColourBy(eventId: string, raw: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const colour = raw.trim();
  if (colour.length > 80) return fail("That colour setting is too long");
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_plans")
    .upsert({ wedding_id: wedding.id, event_id: eventId, colour_by: colour === "" ? null : colour }, { onConflict: "event_id" });
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}
