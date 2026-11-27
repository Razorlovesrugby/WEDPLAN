"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FIXTURE_DEFAULTS, normaliseDegrees } from "@/lib/seating/geometry";
import { nextTableLabel } from "@/lib/seating/model";
import { LOCKED_MESSAGE } from "@/lib/seating/lock";
import { requireWedding } from "@/server/queries/wedding";
import { resolveLayout, resolveSpace } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * Whole-selection writes for the Room view (spec 59 §9): move, copy and delete
 * many tables and fixtures at once. Each is checked as a whole before anything
 * is written: the layout is the one on screen, it isn't locked, and every item
 * named is in it; one stale or foreign id refuses the lot, never half.
 *
 * PostgREST has no multi-statement transaction, so after the checks a failed
 * later statement puts the earlier ones back (moves restore the positions they
 * read; copies delete what they made; a delete re-creates the fixtures it took).
 */

const uuid = z.string().uuid();
const MAX_ITEMS = 500;
const coord = z.number().finite().min(-100_000).max(100_000);

const kindSchema = z.enum(["table", "fixture"]);
const refSchema = z.object({ kind: kindSchema, id: uuid });
const placeSchema = refSchema.extend({ x: coord, y: coord, rotation: z.number().finite().optional() });

/** Every fixture kind the plan knows, from the same table the Library and the sizes come from; the database's own enum has the last word. */
const fixtureKind = z.enum(Object.keys(FIXTURE_DEFAULTS) as [string, ...string[]]);
const MAX_STAMPED = 60;

const STALE = "The plan changed while you were working. Nothing was changed; try again.";

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/seating`);
  revalidatePath(`/events/${eventId}/seating/print`);
  revalidatePath("/seating");
}

/** Guests can see their table once the reveal date has passed: their pages must follow a deleted table. */
async function revalidateGuestPagesIfRevealed(eventId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("seating_plans").select("reveal_at").eq("event_id", eventId).maybeSingle();
  if (data?.reveal_at && new Date(data.reveal_at) <= new Date()) revalidatePath("/w", "layout");
}

const idsOf = (items: { kind: "table" | "fixture"; id: string }[], kind: "table" | "fixture") => items.filter((i) => i.kind === kind).map((i) => i.id);

/** The layout, usable for a write: it exists, is this event's and isn't locked. */
async function writableLayout(eventId: string, layoutId: string | undefined) {
  const wedding = await requireWedding();
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return { ok: false, error: layout.error } as const;
  if (layout.layout.lockedAt) return { ok: false, error: LOCKED_MESSAGE } as const;
  return { ok: true, wedding, layout: layout.layout } as const;
}

/**
 * Moves (and turns) many tables and fixtures in one go. `x` and `y` are each
 * item's new centre. Nothing moves unless every item is in this layout.
 */
export async function moveSeatingItems(
  eventId: string,
  layoutId: string | undefined,
  moves: { kind: "table" | "fixture"; id: string; x: number; y: number; rotation?: number }[],
): Promise<ActionResult<{ moved: number }>> {
  const parsed = z.array(placeSchema).min(1).max(MAX_ITEMS).safeParse(moves);
  if (!parsed.success) return fail("That's not a move");
  if (new Set(parsed.data.map((m) => `${m.kind}:${m.id}`)).size !== parsed.data.length) return fail("That's not a move");
  const ctx = await writableLayout(eventId, layoutId);
  if (!ctx.ok) return fail(ctx.error);

  const supabase = await createClient();
  const tableIds = idsOf(parsed.data, "table");
  const fixtureIds = idsOf(parsed.data, "fixture");
  const [tables, fixtures] = await Promise.all([
    tableIds.length
      ? supabase.from("seating_tables").select("id, pos_x_cm, pos_y_cm, rotation_deg").in("id", tableIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id)
      : Promise.resolve({ data: [], error: null }),
    fixtureIds.length
      ? supabase.from("seating_fixtures").select("id, pos_x_cm, pos_y_cm, rotation_deg").in("id", fixtureIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tables.error) return fail(tables.error.message);
  if (fixtures.error) return fail(fixtures.error.message);
  if ((tables.data?.length ?? 0) !== tableIds.length || (fixtures.data?.length ?? 0) !== fixtureIds.length) return fail(STALE);

  // A table's x and y are nullable (not on the floor yet); a moved one always has both.
  const before = new Map<string, { kind: "table" | "fixture"; x: number | null; y: number | null; rotation: number }>();
  for (const t of tables.data ?? []) before.set(`table:${t.id}`, { kind: "table", x: t.pos_x_cm, y: t.pos_y_cm, rotation: t.rotation_deg });
  for (const f of fixtures.data ?? []) before.set(`fixture:${f.id}`, { kind: "fixture", x: f.pos_x_cm, y: f.pos_y_cm, rotation: f.rotation_deg });

  const write = (kind: "table" | "fixture", id: string, to: { x: number | null; y: number | null; rotation?: number }) =>
    supabase
      .from(kind === "table" ? "seating_tables" : "seating_fixtures")
      .update({
        pos_x_cm: to.x === null ? null : Math.round(to.x),
        pos_y_cm: to.y === null ? null : Math.round(to.y),
        ...(to.rotation === undefined ? {} : { rotation_deg: normaliseDegrees(to.rotation) }),
      } as never)
      .eq("id", id)
      .eq("wedding_id", ctx.wedding.id)
      .eq("layout_id", ctx.layout.id);

  const results = await Promise.all(parsed.data.map((m) => write(m.kind, m.id, m).then((r) => ({ m, error: r.error }))));
  const failed = results.find((r) => r.error);
  if (failed) {
    // Put back what did move, so a selection is never left half-shifted.
    await Promise.all(
      results
        .filter((r) => !r.error)
        .map((r) => {
          const was = before.get(`${r.m.kind}:${r.m.id}`)!;
          return write(r.m.kind, r.m.id, { x: was.x, y: was.y, rotation: was.rotation });
        }),
    );
    return fail(failed.error!.message);
  }
  revalidate(eventId);
  return ok({ moved: parsed.data.length });
}

/**
 * Copies tables and fixtures. Each `x`/`y` is where the copy's centre goes (an
 * offset for Duplicate, the cursor for Paste); `spaceId` is the room it lands
 * in, which may differ from the original's (copy and paste between rooms of one
 * layout). Table copies take the shape, size and style but no guests, and a
 * fresh name.
 */
export async function duplicateSeatingItems(
  eventId: string,
  layoutId: string | undefined,
  input: { spaceId?: string; items: { kind: "table" | "fixture"; id: string; x: number; y: number; rotation?: number }[] },
): Promise<ActionResult<{ tables: string[]; fixtures: string[] }>> {
  const parsed = z
    .object({ spaceId: uuid.optional(), items: z.array(placeSchema).min(1).max(MAX_ITEMS) })
    .safeParse(input);
  if (!parsed.success) return fail("That's not something to copy");
  const ctx = await writableLayout(eventId, layoutId);
  if (!ctx.ok) return fail(ctx.error);
  const space = await resolveSpace(ctx.wedding.id, ctx.layout.id, parsed.data.spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data) return fail("That room isn't part of this layout");

  const supabase = await createClient();
  const tableIds = [...new Set(idsOf(parsed.data.items, "table"))];
  const fixtureIds = [...new Set(idsOf(parsed.data.items, "fixture"))];
  const [tables, fixtures, labels] = await Promise.all([
    tableIds.length ? supabase.from("seating_tables").select("*").in("id", tableIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id) : Promise.resolve({ data: [], error: null }),
    fixtureIds.length ? supabase.from("seating_fixtures").select("*").in("id", fixtureIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id) : Promise.resolve({ data: [], error: null }),
    supabase.from("seating_tables").select("label, sort_order").eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id),
  ]);
  if (tables.error) return fail(tables.error.message);
  if (fixtures.error) return fail(fixtures.error.message);
  if (labels.error) return fail(labels.error.message);
  if ((tables.data?.length ?? 0) !== tableIds.length || (fixtures.data?.length ?? 0) !== fixtureIds.length) return fail(STALE);

  const tableById = new Map((tables.data ?? []).map((t) => [t.id, t]));
  const fixtureById = new Map((fixtures.data ?? []).map((f) => [f.id, f]));
  const taken = (labels.data ?? []).map((t) => t.label);
  let sort = Math.max(0, ...(labels.data ?? []).map((t) => t.sort_order));

  const tableRows = parsed.data.items
    .filter((i) => i.kind === "table")
    .map((i) => {
      const s = tableById.get(i.id)!;
      const label = nextTableLabel(taken);
      taken.push(label);
      sort += 1;
      return {
        wedding_id: ctx.wedding.id,
        event_id: eventId,
        layout_id: ctx.layout.id,
        space_id: space.data!.id,
        label,
        shape: s.shape,
        capacity: s.capacity,
        reserved_seats: s.reserved_seats,
        reserved_note: s.reserved_note,
        ends_seated: s.ends_seated,
        accessible: s.accessible,
        sort_order: sort,
        notes: s.notes,
        pos_x_cm: Math.round(i.x),
        pos_y_cm: Math.round(i.y),
        rotation_deg: i.rotation === undefined ? s.rotation_deg : normaliseDegrees(i.rotation),
        width_cm: s.width_cm,
        length_cm: s.length_cm,
        rows_count: s.rows_count,
        aisle_cm: s.aisle_cm,
        segments: s.segments,
        style_id: s.style_id,
        style_changes: s.style_changes,
        // Typed platter counts are that table's own decision; the copy starts from the suggestion.
        platter_counts: null,
      };
    });
  const fixtureRows = parsed.data.items
    .filter((i) => i.kind === "fixture")
    .map((i) => {
      const s = fixtureById.get(i.id)!;
      return {
        wedding_id: ctx.wedding.id,
        event_id: eventId,
        layout_id: ctx.layout.id,
        space_id: space.data!.id,
        kind: s.kind,
        label: s.label,
        pos_x_cm: Math.round(i.x),
        pos_y_cm: Math.round(i.y),
        width_cm: s.width_cm,
        depth_cm: s.depth_cm,
        rotation_deg: i.rotation === undefined ? s.rotation_deg : normaliseDegrees(i.rotation),
        quantity: s.quantity,
        vendor_id: s.vendor_id,
        custom_item_id: s.custom_item_id,
        marquee_id: s.marquee_id,
      };
    });

  const madeTables = tableRows.length ? await supabase.from("seating_tables").insert(tableRows).select("id") : { data: [], error: null };
  if (madeTables.error) return fail(madeTables.error.message);
  const madeFixtures = fixtureRows.length ? await supabase.from("seating_fixtures").insert(fixtureRows).select("id") : { data: [], error: null };
  if (madeFixtures.error) {
    // The tables were made but the fixtures weren't: take the tables back so a paste is all or nothing.
    const ids = (madeTables.data ?? []).map((t) => t.id);
    if (ids.length) await supabase.from("seating_tables").delete().in("id", ids).eq("wedding_id", ctx.wedding.id);
    return fail(madeFixtures.error.message);
  }
  revalidate(eventId);
  return ok({ tables: (madeTables.data ?? []).map((t) => t.id), fixtures: (madeFixtures.data ?? []).map((f) => f.id) });
}

/**
 * Deletes tables and fixtures. A table's guests go back to the tray (their
 * seats cascade). Refused whole when any item isn't in this layout.
 */
export async function deleteSeatingItems(
  eventId: string,
  layoutId: string | undefined,
  items: { kind: "table" | "fixture"; id: string }[],
): Promise<ActionResult<{ deleted: number }>> {
  const parsed = z.array(refSchema).min(1).max(MAX_ITEMS).safeParse(items);
  if (!parsed.success) return fail("That's not something to delete");
  const ctx = await writableLayout(eventId, layoutId);
  if (!ctx.ok) return fail(ctx.error);

  const supabase = await createClient();
  const tableIds = [...new Set(idsOf(parsed.data, "table"))];
  const fixtureIds = [...new Set(idsOf(parsed.data, "fixture"))];
  const [tables, fixtures] = await Promise.all([
    tableIds.length ? supabase.from("seating_tables").select("id").in("id", tableIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id) : Promise.resolve({ data: [], error: null }),
    fixtureIds.length ? supabase.from("seating_fixtures").select("*").in("id", fixtureIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id) : Promise.resolve({ data: [], error: null }),
  ]);
  if (tables.error) return fail(tables.error.message);
  if (fixtures.error) return fail(fixtures.error.message);
  if ((tables.data?.length ?? 0) !== tableIds.length || (fixtures.data?.length ?? 0) !== fixtureIds.length) return fail(STALE);

  // Fixtures first: if the tables then fail, the fixtures (all there is to them is the row) can be put back.
  if (fixtureIds.length) {
    const { error } = await supabase.from("seating_fixtures").delete().in("id", fixtureIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id);
    if (error) return fail(error.message);
  }
  if (tableIds.length) {
    const { error } = await supabase.from("seating_tables").delete().in("id", tableIds).eq("wedding_id", ctx.wedding.id).eq("layout_id", ctx.layout.id);
    if (error) {
      if (fixtures.data?.length) await supabase.from("seating_fixtures").insert(fixtures.data);
      return fail(error.message);
    }
  }
  revalidate(eventId);
  if (tableIds.length) await revalidateGuestPagesIfRevealed(eventId);
  return ok({ deleted: tableIds.length + fixtureIds.length });
}

/**
 * Puts many fixtures down in one write: Stamp along a line (spec 59 Part C).
 * One insert, so a line of thirty candles is one undo step and one round trip,
 * and either all of them are there or none.
 */
export async function createSeatingFixtures(
  eventId: string,
  layoutId: string | undefined,
  input: {
    spaceId?: string;
    items: { kind: string; x: number; y: number; width_cm: number; depth_cm: number; label?: string | null; custom_item_id?: string | null; marquee_id?: string | null }[];
  },
): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = z
    .object({
      spaceId: uuid.optional(),
      items: z
        .array(
          z.object({
            kind: fixtureKind,
            x: coord,
            y: coord,
            width_cm: z.number().int().min(20).max(5000),
            depth_cm: z.number().int().min(20).max(5000),
            label: z.string().trim().max(60).nullable().optional(),
            custom_item_id: uuid.nullable().optional(),
            marquee_id: uuid.nullable().optional(),
          }),
        )
        .min(1)
        .max(MAX_STAMPED),
    })
    .safeParse(input);
  if (!parsed.success) return fail("That doesn't fit in the room");
  // The database insists a custom item is named and nothing else names one, and only a marquee names a template.
  for (const i of parsed.data.items) {
    if ((i.kind === "custom") !== Boolean(i.custom_item_id)) return fail("Pick which of your own items that is");
    if (i.marquee_id && i.kind !== "marquee") return fail("Only a marquee can name a marquee template");
  }
  const ctx = await writableLayout(eventId, layoutId);
  if (!ctx.ok) return fail(ctx.error);
  const space = await resolveSpace(ctx.wedding.id, ctx.layout.id, parsed.data.spaceId);
  if (space.error) return fail(space.error.message);
  if (!space.data) return fail("That room isn't part of this layout");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_fixtures")
    .insert(
      parsed.data.items.map((i) => ({
        wedding_id: ctx.wedding.id,
        event_id: eventId,
        layout_id: ctx.layout.id,
        space_id: space.data!.id,
        kind: i.kind as never,
        pos_x_cm: Math.round(i.x),
        pos_y_cm: Math.round(i.y),
        width_cm: i.width_cm,
        depth_cm: i.depth_cm,
        label: i.label || null,
        custom_item_id: i.custom_item_id ?? null,
        marquee_id: i.marquee_id ?? null,
      })),
    )
    .select("id");
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ ids: (data ?? []).map((f) => f.id) });
}
