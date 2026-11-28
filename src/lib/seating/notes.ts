/**
 * Notes for vendors (spec 59 Part E): where a note is, who it is for, and how a list of them is numbered and filtered for a
 * supplier. Pure.
 */

import { tablePolygon, type Point } from "./geometry";
import type { Note } from "./drawing";
import type { SeatingTable } from "./model";

/** Where a note is in the room: its own place, or its table's centre plus its offset. A note whose table is gone has no place. */
export function notePlace(note: Pick<Note, "x" | "y" | "table_id">, tables: readonly Pick<SeatingTable, "id" | "pos_x_cm" | "pos_y_cm">[]): Point | null {
  if (!note.table_id) return { x: note.x, y: note.y };
  const t = tables.find((x) => x.id === note.table_id);
  if (!t || t.pos_x_cm === null || t.pos_y_cm === null) return null;
  return { x: t.pos_x_cm + note.x, y: t.pos_y_cm + note.y };
}

/** True when `p` is inside the polygon (even-odd). */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The table a point lands on (the topmost, as drawn), if any: a note put there is pinned to it. */
export function tableAt(p: Point, tables: readonly SeatingTable[], spaceId?: string): SeatingTable | null {
  for (const t of [...tables].reverse()) {
    if (spaceId && t.space_id !== spaceId) continue;
    const poly = tablePolygon(t);
    if (poly && pointInPolygon(p, poly)) return t;
  }
  return null;
}

/** A note made at `p`: pinned to the table under it, with an offset from the table's centre, else free in the room. */
export function newNoteAt(p: Point, id: string, tables: readonly SeatingTable[], spaceId?: string): Note {
  const t = tableAt(p, tables, spaceId);
  if (t && t.pos_x_cm !== null && t.pos_y_cm !== null) return { id, text: "New note", vendor_ids: [], table_id: t.id, x: Math.round(p.x - t.pos_x_cm), y: Math.round(p.y - t.pos_y_cm) };
  return { id, text: "New note", vendor_ids: [], table_id: null, x: Math.round(p.x), y: Math.round(p.y) };
}

/** "Everyone", or the vendors it is for by name ("Bloom & Co, Rentals Ltd"). A vendor that has since gone is left out. */
export function addressee(note: Pick<Note, "vendor_ids">, vendors: readonly { id: string; name: string }[]): string {
  if (note.vendor_ids.length === 0) return "Everyone";
  const names = note.vendor_ids.map((id) => vendors.find((v) => v.id === id)?.name).filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(", ") : "Everyone";
}

/**
 * The notes one reader should see: those for everyone and those that name them. With no `vendorId` (the planner, or a share
 * link that isn't for one supplier) they all show, each saying who it is for.
 */
export function notesFor(notes: readonly Note[], vendorId?: string | null): Note[] {
  if (!vendorId) return [...notes];
  return notes.filter((n) => n.vendor_ids.length === 0 || n.vendor_ids.includes(vendorId));
}

export type NumberedNote = Note & { n: number; at: Point; for: string };

/** Numbered 1, 2, 3 in the order they were made, with where they are and who they are for: the pin on the plan and the list beside it. */
export function numberNotes(notes: readonly Note[], tables: readonly SeatingTable[], vendors: readonly { id: string; name: string }[]): NumberedNote[] {
  const out: NumberedNote[] = [];
  for (const note of notes) {
    const at = notePlace(note, tables);
    if (at) out.push({ ...note, n: out.length + 1, at, for: addressee(note, vendors) });
  }
  return out;
}
