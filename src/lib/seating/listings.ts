/**
 * The plan as lists (spec 33 §G): by table for the venue, by name for the
 * entrance board, numbers for the caterer, rows for the CSV. One shape for
 * the print page and the export, so the paper and the spreadsheet agree.
 */

import {
  compareBySurname,
  guestName,
  takesAChair,
  type SeatingAssignment,
  type SeatingGuest,
  type SeatingTable,
} from "./model";

export type SeatedGuest = { guest: SeatingGuest; seatIndex: number | null };

export type TableListing = {
  table: SeatingTable;
  /** In chair order, then (for no chair yet) by surname. */
  guests: SeatedGuest[];
  adults: number;
  children: number;
  infants: number;
};

type PlanLike = {
  tables: readonly SeatingTable[];
  guests: readonly SeatingGuest[];
  assignments: readonly SeatingAssignment[];
};

export function tableListings(plan: PlanLike): TableListing[] {
  const guestById = new Map(plan.guests.map((g) => [g.id, g]));
  return plan.tables.map((table) => {
    const guests = plan.assignments
      .filter((a) => a.tableId === table.id && guestById.has(a.guestId))
      .map((a) => ({ guest: guestById.get(a.guestId)!, seatIndex: a.seatIndex }))
      .sort((a, b) => (a.seatIndex ?? 999) - (b.seatIndex ?? 999) || compareBySurname(a.guest, b.guest));
    return {
      table,
      guests,
      adults: guests.filter((s) => s.guest.ageBand === "adult").length,
      children: guests.filter((s) => s.guest.ageBand === "child").length,
      infants: guests.filter((s) => s.guest.ageBand === "infant").length,
    };
  });
}

export type NameEntry = { guest: SeatingGuest; table: SeatingTable; seatIndex: number | null };

/** Everyone seated, alphabetically by surname — the entrance board and escort cards. */
export function nameIndex(plan: PlanLike): NameEntry[] {
  const guestById = new Map(plan.guests.map((g) => [g.id, g]));
  const tableById = new Map(plan.tables.map((t) => [t.id, t]));
  return plan.assignments
    .filter((a) => guestById.has(a.guestId) && tableById.has(a.tableId))
    .map((a) => ({ guest: guestById.get(a.guestId)!, table: tableById.get(a.tableId)!, seatIndex: a.seatIndex }))
    .sort((a, b) => compareBySurname(a.guest, b.guest));
}

/** Place cards in the order they're laid out: table by table, chair by chair. */
export function placeCardOrder(plan: PlanLike): NameEntry[] {
  return tableListings(plan).flatMap((l) => l.guests.map((s) => ({ guest: s.guest, table: l.table, seatIndex: s.seatIndex })));
}

/** Seated non-infant guests plus reserved seats — the number the venue sets chairs for. */
export function chairsNeeded(listing: TableListing): number {
  return listing.guests.filter((s) => takesAChair(s.guest)).length + listing.table.reserved_seats;
}

export const SEATING_CSV_HEADER = [
  "Event",
  "Table",
  "Chair",
  "Guest",
  "Household",
  "Age band",
  "Dietary",
  "Accessibility",
] as const;

export function seatingCsvRows(eventName: string, plan: PlanLike): (string | number)[][] {
  return tableListings(plan).flatMap((l) =>
    l.guests.map((s) => [
      eventName,
      l.table.label,
      s.seatIndex === null ? "" : s.seatIndex + 1,
      guestName(s.guest),
      s.guest.householdName,
      s.guest.ageBand,
      s.guest.dietary ?? "",
      s.guest.accessibility ?? "",
    ]),
  );
}
