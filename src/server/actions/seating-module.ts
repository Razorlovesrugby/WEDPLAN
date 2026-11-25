"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestName } from "@/lib/format";
import { dietarySummary, type DietaryNeed } from "@/lib/dietary";
import { clampTapTime } from "@/lib/day-links/state";
import { resolveDayLink, type ResolvedDayLink } from "@/server/day-links/resolve";
import { fail, ok, type ActionResult } from "./result";

/**
 * The Seating module of a day link (spec 53 Part I). Reads one event's plan
 * through the link's token; writes are exactly four: mark arrived, unmark,
 * move a guest to a spare chair, and seat a walk-in as a reserved seat with a
 * note. A public link never creates a guest. Other guests appear by display
 * name only, and the only guest note shown is `vendor_note` (spec 52 §4.3).
 */

const REFUSED: Record<string, string> = {
  throttled: "Too many tries. Wait a few minutes and try again.",
  expired: "This link has stopped working.",
  off: "This link has been turned off.",
};

type Authorised = { ctx: ResolvedDayLink; eventId: string };

async function authorise(token: string): Promise<Authorised | ActionResult<never>> {
  if (typeof token !== "string" || token.length < 40 || token.length > 64) return fail("This link isn't valid.");
  const resolved = await resolveDayLink(token);
  if (!resolved.ok) return fail(REFUSED[resolved.reason] ?? "This link isn't valid.");
  const { link, wedding } = resolved.context;
  if (!link.modules.includes("seating")) return fail("Seating isn't switched on for this link.");

  const configured = (link.module_config as { seating?: { event_id?: string } })?.seating?.event_id;
  const supabase = createAdminClient();
  if (configured) {
    const { data } = await supabase.from("events").select("id").eq("id", configured).eq("wedding_id", wedding.id).maybeSingle();
    if (data) return { ctx: resolved.context, eventId: data.id };
  }
  // Otherwise the first event with a seating plan switched on.
  const { data: event, error } = await supabase
    .from("events")
    .select("id")
    .eq("wedding_id", wedding.id)
    .eq("has_seating", true)
    .order("sort_order")
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!event) return fail("There's no seating plan to show yet.");
  return { ctx: resolved.context, eventId: event.id };
}

export type SeatingModuleGuest = {
  id: string;
  name: string;
  tableId: string;
  tableLabel: string;
  seat: number | null;
  mates: string[];
  vendorNote: string | null;
  /** The structured dietary tags only ("Allergy: Peanuts. Vegetarian"), never the free-text note (spec 52 §4.3, spec 57 Part H). */
  dietary: string | null;
  arrived: boolean;
};

/** `spare` are the empty, unblocked chair numbers (0-based); `free` is how many places are really left. */
export type SeatingModuleTable = { id: string; label: string; spare: number[]; free: number };

export type SeatingModuleData = {
  guests: SeatingModuleGuest[];
  tables: SeatingModuleTable[];
  arrived: number;
  expected: number;
  loadedAt: string;
};

export async function loadSeatingModule(token: string): Promise<ActionResult<SeatingModuleData>> {
  const auth = await authorise(token);
  if (!("ctx" in auth)) return auth;
  const { ctx, eventId } = auth;
  const supabase = createAdminClient();
  const weddingId = ctx.wedding.id;

  const [tables, assignments, blocked, checkins] = await Promise.all([
    // The live layout only (spec 57 Part G): a draft is never what the day runs on.
    supabase.from("v_live_seating_tables").select("id, label, capacity, reserved_seats, sort_order").eq("wedding_id", weddingId).eq("event_id", eventId).order("sort_order").order("label"),
    supabase.from("v_live_seat_assignments").select("guest_id, table_id, seat_index").eq("wedding_id", weddingId).eq("event_id", eventId),
    supabase.from("seating_chairs_blocked").select("table_id, seat_index").eq("wedding_id", weddingId).eq("event_id", eventId),
    supabase.from("seating_checkins").select("guest_id").eq("wedding_id", weddingId).eq("event_id", eventId),
  ]);
  for (const r of [tables, assignments, blocked, checkins]) if (r.error) return fail(r.error.message);

  const guestIds = (assignments.data ?? []).map((a) => a.guest_id);
  const needs = guestIds.length
    ? await supabase.from("guest_dietary_needs").select("guest_id, tag, is_allergy, other_text").eq("wedding_id", weddingId).in("guest_id", guestIds)
    : { data: [], error: null };
  if (needs.error) return fail(needs.error.message);
  const needsBy = new Map<string, DietaryNeed[]>();
  for (const n of needs.data ?? []) needsBy.set(n.guest_id, [...(needsBy.get(n.guest_id) ?? []), { tag: n.tag, isAllergy: n.is_allergy, otherText: n.other_text }]);
  const guests = guestIds.length
    ? await supabase.from("guests").select("id, first_name, last_name, preferred_name, vendor_note, age_band, uses_wheelchair").eq("wedding_id", weddingId).is("deleted_at", null).in("id", guestIds)
    : { data: [], error: null };
  if (guests.error) return fail(guests.error.message);
  const guestById = new Map((guests.data ?? []).map((g) => [g.id, g]));
  const tableById = new Map((tables.data ?? []).map((t) => [t.id, t]));
  const arrived = new Set((checkins.data ?? []).map((c) => c.guest_id));

  const seatedHere = (assignments.data ?? []).filter((a) => guestById.has(a.guest_id) && tableById.has(a.table_id));
  const byTable = new Map<string, typeof seatedHere>();
  for (const a of seatedHere) byTable.set(a.table_id, [...(byTable.get(a.table_id) ?? []), a]);

  const out: SeatingModuleGuest[] = seatedHere.map((a) => {
    const g = guestById.get(a.guest_id)!;
    const t = tableById.get(a.table_id)!;
    return {
      id: g.id,
      name: guestName(g),
      tableId: t.id,
      tableLabel: t.label,
      seat: a.seat_index,
      mates: (byTable.get(t.id) ?? []).filter((x) => x.guest_id !== g.id).map((x) => guestName(guestById.get(x.guest_id)!)).sort((x, y) => x.localeCompare(y, "en-GB")),
      vendorNote: g.vendor_note,
      dietary: dietarySummary(needsBy.get(g.id) ?? []) || null,
      arrived: arrived.has(g.id),
    };
  });

  const blockedKeys = new Set((blocked.data ?? []).filter((b) => tableById.has(b.table_id)).map((b) => `${b.table_id}:${b.seat_index}`));
  const moduleTables: SeatingModuleTable[] = (tables.data ?? []).map((t) => {
    const taken = new Set((byTable.get(t.id) ?? []).filter((a) => a.seat_index !== null).map((a) => a.seat_index!));
    const usable = Math.max(0, t.capacity - t.reserved_seats);
    const spare: number[] = [];
    for (let i = 0; i < usable; i++) if (!taken.has(i) && !blockedKeys.has(`${t.id}:${i}`)) spare.push(i);
    // Guests seated at the table with no chair chosen use up spare chairs too.
    const noChair = (byTable.get(t.id) ?? []).filter((a) => a.seat_index === null).length;
    return { id: t.id, label: t.label, spare, free: Math.max(0, spare.length - noChair) };
  });

  return ok({
    guests: out.sort((a, b) => a.name.localeCompare(b.name, "en-GB")),
    tables: moduleTables,
    arrived: out.filter((g) => g.arrived).length,
    expected: out.length,
    loadedAt: new Date().toISOString(),
  });
}

async function record(ctx: ResolvedDayLink, kind: string, payload: Record<string, unknown>, tappedAt: string): Promise<string | null> {
  const { error } = await createAdminClient().from("day_activity").insert({
    wedding_id: ctx.wedding.id,
    link_id: ctx.link.id,
    vendor_id: ctx.link.vendor_id,
    guest_id: ctx.link.guest_id,
    person_id: ctx.link.person_id,
    kind,
    payload,
    tapped_at: tappedAt,
  });
  return error?.message ?? null;
}

const idSchema = z.string().uuid();

async function seatedAt(ctx: ResolvedDayLink, eventId: string, guestId: string) {
  const { data, error } = await createAdminClient()
    .from("v_live_seat_assignments")
    .select("guest_id, table_id, seat_index")
    .eq("wedding_id", ctx.wedding.id)
    .eq("event_id", eventId)
    .eq("guest_id", guestId)
    .maybeSingle();
  return { data, error };
}

/** A tap marks a guest here. Idempotent: marking someone already here is not an error. */
export async function seatMarkArrived(token: string, guestId: string, tappedAtInput?: string): Promise<ActionResult> {
  const auth = await authorise(token);
  if (!("ctx" in auth)) return auth;
  if (!idSchema.safeParse(guestId).success) return fail("Unknown guest");
  const { ctx, eventId } = auth;
  const seat = await seatedAt(ctx, eventId, guestId);
  if (seat.error) return fail(seat.error.message);
  if (!seat.data) return fail("That guest isn't on the plan.");
  const tappedAt = clampTapTime(tappedAtInput);
  const { error } = await createAdminClient()
    .from("seating_checkins")
    .upsert(
      { wedding_id: ctx.wedding.id, event_id: eventId, guest_id: guestId, arrived_at: tappedAt, by_label: ctx.link.label },
      { onConflict: "event_id,guest_id", ignoreDuplicates: true },
    );
  if (error) return fail(error.message);
  const problem = await record(ctx, "seat_arrived", { guest_id: guestId }, tappedAt);
  return problem ? fail(problem) : ok(undefined);
}

export async function seatUnmarkArrived(token: string, guestId: string, tappedAtInput?: string): Promise<ActionResult> {
  const auth = await authorise(token);
  if (!("ctx" in auth)) return auth;
  if (!idSchema.safeParse(guestId).success) return fail("Unknown guest");
  const { ctx, eventId } = auth;
  const { error } = await createAdminClient().from("seating_checkins").delete().eq("wedding_id", ctx.wedding.id).eq("event_id", eventId).eq("guest_id", guestId);
  if (error) return fail(error.message);
  const problem = await record(ctx, "seat_unarrived", { guest_id: guestId }, clampTapTime(tappedAtInput));
  return problem ? fail(problem) : ok(undefined);
}

/** Moves a seated guest to a spare chair (or a table with no chair chosen). */
export async function moveGuestOnTheDay(token: string, guestId: string, tableId: string, seatIndex: number | null, tappedAtInput?: string): Promise<ActionResult> {
  const auth = await authorise(token);
  if (!("ctx" in auth)) return auth;
  if (!idSchema.safeParse(guestId).success || !idSchema.safeParse(tableId).success) return fail("Unknown guest or table");
  const chair = seatIndex === null ? null : z.number().int().min(0).max(59).safeParse(seatIndex);
  if (chair && !chair.success) return fail("That chair doesn't exist");
  const { ctx, eventId } = auth;
  const supabase = createAdminClient();

  const seat = await seatedAt(ctx, eventId, guestId);
  if (seat.error) return fail(seat.error.message);
  if (!seat.data) return fail("That guest isn't on the plan.");

  const { data: table, error: tableError } = await supabase.from("v_live_seating_tables").select("id, label, capacity, reserved_seats, layout_id").eq("id", tableId).eq("wedding_id", ctx.wedding.id).eq("event_id", eventId).maybeSingle();
  if (tableError) return fail(tableError.message);
  if (!table) return fail("That table isn't on the plan.");

  if (chair) {
    if (chair.data >= table.capacity - table.reserved_seats) return fail("That chair isn't available.");
    const [taken, blocked] = await Promise.all([
      supabase.from("seat_assignments").select("guest_id").eq("table_id", tableId).eq("seat_index", chair.data).maybeSingle(),
      supabase.from("seating_chairs_blocked").select("seat_index").eq("table_id", tableId).eq("seat_index", chair.data).maybeSingle(),
    ]);
    if (taken.error) return fail(taken.error.message);
    if (blocked.error) return fail(blocked.error.message);
    if (taken.data && taken.data.guest_id !== guestId) return fail("Someone is already in that chair.");
    if (blocked.data) return fail("That chair is out of use.");
  }

  if (!chair) {
    // A table with no chair chosen still has to have room: seated guests and blocked chairs against the usable seats.
    const [assigned, blockedChairs] = await Promise.all([
      supabase.from("seat_assignments").select("guest_id").eq("table_id", tableId),
      supabase.from("seating_chairs_blocked").select("seat_index").eq("table_id", tableId),
    ]);
    if (assigned.error) return fail(assigned.error.message);
    if (blockedChairs.error) return fail(blockedChairs.error.message);
    const others = (assigned.data ?? []).filter((a) => a.guest_id !== guestId).length;
    if (others + (blockedChairs.data ?? []).length >= table.capacity - table.reserved_seats) return fail(`${table.label} is full.`);
  }

  const { error } = await supabase
    .from("seat_assignments")
    .upsert(
      { wedding_id: ctx.wedding.id, event_id: eventId, layout_id: table.layout_id, guest_id: guestId, table_id: tableId, seat_index: chair ? chair.data : null },
      { onConflict: "guest_id,layout_id" },
    );
  if (error) return fail(error.message);
  const problem = await record(ctx, "seat_moved", { guest_id: guestId, table_id: tableId, table: table.label, seat: chair ? chair.data + 1 : null }, clampTapTime(tappedAtInput));
  return problem ? fail(problem) : ok(undefined);
}

/** A walk-in takes a spare chair as a reserved seat with a note. No guest record is ever made from a public link. */
export async function seatWalkIn(token: string, tableId: string, note: string, tappedAtInput?: string): Promise<ActionResult> {
  const auth = await authorise(token);
  if (!("ctx" in auth)) return auth;
  const cleanNote = z.string().trim().min(1, "Say who it's for").max(80).safeParse(note);
  if (!cleanNote.success || !idSchema.safeParse(tableId).success) return fail("Say who it's for, in a few words");
  const { ctx, eventId } = auth;
  const supabase = createAdminClient();

  const { data: table, error } = await supabase.from("v_live_seating_tables").select("id, label, capacity, reserved_seats, reserved_note").eq("id", tableId).eq("wedding_id", ctx.wedding.id).eq("event_id", eventId).maybeSingle();
  if (error) return fail(error.message);
  if (!table) return fail("That table isn't on the plan.");

  const [assigned, blocked] = await Promise.all([
    supabase.from("seat_assignments").select("seat_index").eq("table_id", tableId),
    supabase.from("seating_chairs_blocked").select("seat_index").eq("table_id", tableId),
  ]);
  if (assigned.error) return fail(assigned.error.message);
  if (blocked.error) return fail(blocked.error.message);
  const spare = table.capacity - table.reserved_seats - (assigned.data ?? []).length - (blocked.data ?? []).length;
  if (spare < 1) return fail(`${table.label} has no spare chair.`);

  const joined = [table.reserved_note, cleanNote.data].filter(Boolean).join("; ").slice(0, 200);
  const { data: updated, error: updateError } = await supabase
    .from("seating_tables")
    .update({ reserved_seats: table.reserved_seats + 1, reserved_note: joined })
    .eq("id", tableId)
    .eq("reserved_seats", table.reserved_seats)
    .select("id");
  if (updateError) return fail(updateError.message);
  if (!updated?.length) return fail("Someone else just changed that table. Try again.");
  const problem = await record(ctx, "seat_walk_in", { table_id: tableId, table: table.label, note: cleanNote.data }, clampTapTime(tappedAtInput));
  return problem ? fail(problem) : ok(undefined);
}
