/**
 * Locking the room (spec 57 Part D). A locked layout's walls, drawing, areas,
 * furniture and décor can't be moved, resized, added or deleted. Seating,
 * freeing seats, table styles and final counts still work. Pure.
 */

export const LOCKED_MESSAGE = "The room is locked. Unlock it to move things.";

/** Lock item (spec 60 A.3): one table or piece of furniture held still, apart from the room's lock. */
export const HELD_MESSAGE = "That item is locked. Unlock it to move, turn, resize or delete it.";

type Row = Record<string, unknown>;
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Row[]) : []);
const pick = (r: Row, keys: readonly string[]) => keys.map((k) => r[k] ?? null);

// What a lock holds still: where things are and how big. Seats, styles, labels, reserved seats and notes are not the room.
const SPACE_KEYS = ["id", "name", "sort_order", "room_width_cm", "room_depth_cm", "background_path", "calibrated", "background_opacity", "drawing"] as const;
const TABLE_KEYS = ["id", "space_id", "shape", "capacity", "pos_x_cm", "pos_y_cm", "rotation_deg", "width_cm", "length_cm", "rows_count", "aisle_cm", "segments", "ends_seated", "table_items", "locked"] as const;
const FIXTURE_KEYS = ["id", "space_id", "kind", "label", "pos_x_cm", "pos_y_cm", "width_cm", "depth_cm", "rotation_deg", "quantity", "vendor_id", "custom_item_id", "marquee_id", "locked", "z"] as const;

/** The part of a plan's state a lock freezes, as text, so two states compare with `===`. */
export function roomPart(state: unknown): string {
  const s = (state ?? {}) as Row;
  const byId = (a: Row, b: Row) => String(a.id).localeCompare(String(b.id));
  return JSON.stringify({
    spaces: rows(s.spaces).sort(byId).map((r) => pick(r, SPACE_KEYS)),
    tables: rows(s.tables).sort(byId).map((r) => pick(r, TABLE_KEYS)),
    fixtures: rows(s.fixtures).sort(byId).map((r) => pick(r, FIXTURE_KEYS)),
  });
}

/** True when putting `next` back over `current` would change the room: an undo under a lock may only change the seating. */
export function roomChanged(current: unknown, next: unknown): boolean {
  return roomPart(current) !== roomPart(next);
}
