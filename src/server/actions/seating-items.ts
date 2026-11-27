"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FIXTURE_DEFAULTS } from "@/lib/seating/geometry";
import { HELD_MESSAGE, LOCKED_MESSAGE } from "@/lib/seating/lock";
import { FIXTURE_LIMITS, TABLE_LIMITS } from "@/lib/seating/resize";
import { requireWedding } from "@/server/queries/wedding";
import { resolveLayout } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * Whole-selection writes for the Room view (spec 59 §9, spec 60 A.5): move, resize, copy, delete, stamp, lock and
 * reorder many tables and fixtures at once. Each is one call to `seating_apply_items`, one database transaction that
 * either does all of it or none of it. It is refused whole when the layout is locked, is not this event's, an item named
 * is not in it, an item is held (Lock item), or, for a move or resize that names where each item started, the server's
 * copy has since changed (spec 60 E.2).
 */

const uuid = z.string().uuid();
const MAX_ITEMS = 500;
const coord = z.number().finite().min(-100_000).max(100_000);

const kindSchema = z.enum(["table", "fixture"]);
const refSchema = z.object({ kind: kindSchema, id: uuid });
/** Where an item was when the screen last saw it: a move or resize from anywhere else is refused (E.2). */
const fromSchema = z.object({ x: coord, y: coord, rotation: z.number().finite().optional(), width: z.number().int().optional(), depth: z.number().int().optional() });
const placeSchema = refSchema.extend({ x: coord, y: coord, rotation: z.number().finite().optional() });
const moveSchema = placeSchema.extend({ from: fromSchema.optional() });

/** Every fixture kind the plan knows, from the same table the Library and the sizes come from; the database's own enum has the last word. */
const fixtureKind = z.enum(Object.keys(FIXTURE_DEFAULTS) as [string, ...string[]]);
const MAX_STAMPED = 60;

const STALE_PLAN = "The plan changed while you were working. Nothing was changed; try again.";

/** What each refusal from the database function says to a person. */
const REFUSALS: Record<string, string> = {
  seating_room_locked: LOCKED_MESSAGE,
  seating_item_locked: HELD_MESSAGE,
  seating_item_missing: STALE_PLAN,
  seating_layout_not_found: "That layout isn't part of this event any more. Refresh the page.",
  seating_space_not_found: "That room isn't part of this layout",
  seating_shape_not_resizable: "That shape's size is set in the table's form, not by dragging",
  seating_stale: "Someone changed this plan while you were working. Nothing was changed; the plan is up to date now.",
};

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

type Applied = { count: number; tables: string[]; fixtures: string[] };

/** The layout on screen, checked, then one call to the database function. */
async function apply(eventId: string, layoutId: string | undefined, op: string, items: Record<string, unknown>[], spaceId?: string): Promise<ActionResult<Applied>> {
  const wedding = await requireWedding();
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  if (layout.layout.lockedAt) return fail(LOCKED_MESSAGE);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seating_apply_items", {
    p_event_id: eventId,
    p_layout_id: layout.layout.id,
    p_op: op,
    p_items: items,
    p_space_id: spaceId ?? null,
  });
  if (error) return fail(REFUSALS[error.message] ?? error.message);
  revalidate(eventId);
  return ok(data);
}

const unique = (items: { kind: string; id: string }[]) => new Set(items.map((i) => `${i.kind}:${i.id}`)).size === items.length;

/**
 * Moves (and turns) many tables and fixtures in one go. `x` and `y` are each item's new centre; `from` is where the
 * screen last saw it, and a move from anywhere else is refused whole (spec 60 E.2).
 */
export async function moveSeatingItems(
  eventId: string,
  layoutId: string | undefined,
  moves: { kind: "table" | "fixture"; id: string; x: number; y: number; rotation?: number; from?: { x: number; y: number; rotation?: number; width?: number; depth?: number } }[],
): Promise<ActionResult<{ moved: number }>> {
  const parsed = z.array(moveSchema).min(1).max(MAX_ITEMS).safeParse(moves);
  if (!parsed.success || !unique(parsed.data)) return fail("That's not a move");
  const r = await apply(eventId, layoutId, "move", parsed.data);
  return r.ok ? ok({ moved: r.data.count }) : r;
}

/**
 * Resizes one table or fixture: dragging a handle changes the size and, because the opposite edge stays put, the centre
 * too, so both are written together. Only the shapes whose drawing follows their size can be resized this way; a round or
 * square table has one size (its diameter or side).
 */
export async function resizeSeatingItem(
  eventId: string,
  layoutId: string | undefined,
  input: { kind: "table" | "fixture"; id: string; x: number; y: number; width: number; depth: number; from?: { x: number; y: number; rotation?: number; width?: number; depth?: number } },
): Promise<ActionResult> {
  const parsed = refSchema.extend({ x: coord, y: coord, width: z.number().int(), depth: z.number().int(), from: fromSchema.optional() }).safeParse(input);
  if (!parsed.success) return fail("That's not a size");
  const limits = parsed.data.kind === "table" ? TABLE_LIMITS : FIXTURE_LIMITS;
  const { width, depth } = parsed.data;
  if (width < limits.min || width > limits.max || depth < limits.min || depth > limits.max) return fail(`Sizes run from ${limits.min} cm to ${limits.max} cm`);
  const r = await apply(eventId, layoutId, "resize", [parsed.data]);
  return r.ok ? ok(undefined) : r;
}

/**
 * Copies tables and fixtures. Each `x`/`y` is where the copy's centre goes (an offset for Duplicate, the cursor for
 * Paste); `spaceId` is the room it lands in, which may differ from the original's (copy and paste between rooms of one
 * layout). Table copies take the shape, size, style and items but no guests, and a fresh name; a copy is never locked.
 */
export async function duplicateSeatingItems(
  eventId: string,
  layoutId: string | undefined,
  input: { spaceId?: string; items: { kind: "table" | "fixture"; id: string; x: number; y: number; rotation?: number }[] },
): Promise<ActionResult<{ tables: string[]; fixtures: string[] }>> {
  const parsed = z.object({ spaceId: uuid.optional(), items: z.array(placeSchema).min(1).max(MAX_ITEMS) }).safeParse(input);
  if (!parsed.success) return fail("That's not something to copy");
  const r = await apply(eventId, layoutId, "copy", parsed.data.items, parsed.data.spaceId);
  return r.ok ? ok({ tables: r.data.tables, fixtures: r.data.fixtures }) : r;
}

/** Deletes tables and fixtures. A table's guests go back to the tray (their seats cascade). Refused whole when any item isn't in this layout or is held. */
export async function deleteSeatingItems(
  eventId: string,
  layoutId: string | undefined,
  items: { kind: "table" | "fixture"; id: string }[],
): Promise<ActionResult<{ deleted: number }>> {
  const parsed = z.array(refSchema).min(1).max(MAX_ITEMS).safeParse(items);
  if (!parsed.success || !unique(parsed.data)) return fail("That's not something to delete");
  const r = await apply(eventId, layoutId, "delete", parsed.data);
  if (!r.ok) return r;
  if (parsed.data.some((i) => i.kind === "table")) await revalidateGuestPagesIfRevealed(eventId);
  return ok({ deleted: r.data.count });
}

/** Lock item and Unlock item (spec 60 A.3). Seating guests at a held table still works. */
export async function setSeatingItemsLocked(
  eventId: string,
  layoutId: string | undefined,
  items: { kind: "table" | "fixture"; id: string }[],
  locked: boolean,
): Promise<ActionResult> {
  const parsed = z.array(refSchema).min(1).max(MAX_ITEMS).safeParse(items);
  if (!parsed.success || !unique(parsed.data)) return fail("That's not something to lock");
  const r = await apply(eventId, layoutId, "lock", parsed.data.map((i) => ({ ...i, locked })));
  return r.ok ? ok(undefined) : r;
}

/** Bring to front and Send to back among furniture and décor (spec 60 A.4). Tables always draw above both, so only fixtures are ordered. */
export async function orderSeatingItems(
  eventId: string,
  layoutId: string | undefined,
  fixtureIds: string[],
  where: "front" | "back",
): Promise<ActionResult> {
  const parsed = z.array(uuid).min(1).max(MAX_ITEMS).safeParse(fixtureIds);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) return fail("That's not something to reorder");
  const r = await apply(eventId, layoutId, where, parsed.data.map((id) => ({ kind: "fixture", id })));
  return r.ok ? ok(undefined) : r;
}

/**
 * Puts many fixtures down in one write: Stamp along a line (spec 59 Part C). One transaction, so a line of thirty candles
 * is one undo step and one round trip, and either all of them are there or none.
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
  const r = await apply(
    eventId,
    layoutId,
    "stamp",
    parsed.data.items.map((i) => ({ kind: "fixture", fixture_kind: i.kind, x: i.x, y: i.y, width: i.width_cm, depth: i.depth_cm, label: i.label ?? null, custom_item_id: i.custom_item_id ?? null, marquee_id: i.marquee_id ?? null })),
    parsed.data.spaceId,
  );
  return r.ok ? ok({ ids: r.data.fixtures }) : r;
}

/** Stamp along a line of tables: one transaction too, so a row of tables is all there or not at all. */
export async function createSeatingTables(
  eventId: string,
  layoutId: string | undefined,
  input: { spaceId?: string; items: { shape: string; capacity: number; reserved_seats?: number; x: number; y: number }[] },
): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = z
    .object({
      spaceId: uuid.optional(),
      items: z
        .array(z.object({ shape: z.enum(["round", "long", "square", "head", "sweetheart", "oval", "half_moon", "serpentine"]), capacity: z.number().int().min(1).max(60), reserved_seats: z.number().int().min(0).max(60).optional(), x: coord, y: coord }))
        .min(1)
        .max(MAX_STAMPED),
    })
    .safeParse(input);
  if (!parsed.success) return fail("That doesn't fit in the room");
  if (parsed.data.items.some((i) => (i.reserved_seats ?? 0) > i.capacity)) return fail("Reserved seats can't be more than the table's seats");
  const r = await apply(eventId, layoutId, "stamp", parsed.data.items.map((i) => ({ kind: "table", ...i })), parsed.data.spaceId);
  return r.ok ? ok({ ids: r.data.tables }) : r;
}
