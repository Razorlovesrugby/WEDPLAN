/**
 * The item totals for a plan (spec 57 C.3): what each table style puts on the
 * tables, the décor placed in the room, and the serving utensils the shared
 * courses need, with the couple's final numbers. One function, so the totals
 * list, the florist's list and the hire company's list agree. Pure.
 */

import { computeItems, mergeFinal, type ItemFixture, type ItemLine, type StoredCount, type TableStyle } from "./items";
import type { SeatingTable } from "./model";

export function itemLines(input: {
  tables: readonly SeatingTable[];
  seatedAt: ReadonlyMap<string, number>;
  blockedAt: ReadonlyMap<string, number>;
  styles: readonly TableStyle[];
  fixtures: readonly ItemFixture[];
  customNames: Readonly<Record<string, string>>;
  utensils: number;
  counts: readonly StoredCount[];
}): ItemLine[] {
  const rows = computeItems({
    tables: input.tables.map((t) => ({
      id: t.id,
      shape: t.shape,
      capacity: t.capacity,
      reserved_seats: t.reserved_seats,
      style_id: t.style_id,
      style_changes: t.style_changes,
      seated: input.seatedAt.get(t.id) ?? 0,
      blocked: input.blockedAt.get(t.id) ?? 0,
    })),
    styles: input.styles,
    fixtures: input.fixtures,
    customNames: input.customNames,
    utensils: input.utensils,
  });
  return mergeFinal(rows, input.counts);
}

/** "Seated at" and "blocked at" per table, from a plan's seats and blocked chairs. */
export function tableCounts(
  assignments: readonly { tableId: string }[],
  blocked: readonly { tableId: string }[],
): { seatedAt: Map<string, number>; blockedAt: Map<string, number> } {
  const seatedAt = new Map<string, number>();
  for (const a of assignments) seatedAt.set(a.tableId, (seatedAt.get(a.tableId) ?? 0) + 1);
  const blockedAt = new Map<string, number>();
  for (const b of blocked) blockedAt.set(b.tableId, (blockedAt.get(b.tableId) ?? 0) + 1);
  return { seatedAt, blockedAt };
}
