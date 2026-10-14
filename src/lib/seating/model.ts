/**
 * The seating plan's in-memory shape (spec 33). The query
 * (`src/server/queries/seating.ts`) builds it; everything in `src/lib/seating`
 * reads it. Nothing here touches the database.
 */

import type {
  AgeBand,
  GuestSide,
  RsvpStatus,
  SeatingFixtureRow,
  SeatingPlanRow,
  SeatingRuleRow,
  SeatingTableRow,
} from "@/lib/types/database";

/** One active guest of the wedding, as seen from one event. */
export type SeatingGuest = {
  id: string;
  householdId: string;
  householdName: string;
  firstName: string;
  lastName: string | null;
  preferredName: string | null;
  ageBand: AgeBand;
  side: GuestSide | null;
  dietary: string | null;
  accessibility: string | null;
  plusOneFor: string | null;
  tagIds: string[];
  /** From v_guest_event_invites — never re-derived here (spec 22). */
  invited: boolean;
  /** Told us they can't come, and no Yes since (spec 29 §4.6). */
  excluded: boolean;
  /** This event's RSVP, or null when no row exists yet. */
  rsvp: RsvpStatus | null;
};

export type SeatingAssignment = {
  guestId: string;
  tableId: string;
  seatIndex: number | null;
};

export type SeatingTable = SeatingTableRow;
export type SeatingFixture = SeatingFixtureRow;
export type SeatingRule = SeatingRuleRow;
export type SeatingPlan = SeatingPlanRow;

/** "Ana Ferreira", or the preferred name in place of the first. */
export function guestName(g: Pick<SeatingGuest, "firstName" | "lastName" | "preferredName">): string {
  return [g.preferredName || g.firstName, g.lastName].filter(Boolean).join(" ");
}

/** "Ferreira, Ana" — the entrance board's sort and display. */
export function guestNameSurnameFirst(g: Pick<SeatingGuest, "firstName" | "lastName" | "preferredName">): string {
  const first = g.preferredName || g.firstName;
  return g.lastName ? `${g.lastName}, ${first}` : first;
}

export function compareBySurname(
  a: Pick<SeatingGuest, "firstName" | "lastName" | "preferredName">,
  b: Pick<SeatingGuest, "firstName" | "lastName" | "preferredName">,
): number {
  return guestNameSurnameFirst(a).localeCompare(guestNameSurnameFirst(b), "en-GB", { sensitivity: "base" });
}

/** Infants sit on a lap or in a high chair: they don't take a chair (as v_households.seat_count). */
export function takesAChair(g: Pick<SeatingGuest, "ageBand">): boolean {
  return g.ageBand !== "infant";
}

/** "Table 1", "Table 2"… — one past the highest "Table N" already used, so a deleted Table 3 isn't reissued under someone's feet. */
export function nextTableLabel(existing: readonly string[]): string {
  let max = 0;
  for (const label of existing) {
    const m = /^table\s+(\d+)$/i.exec(label.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Table ${max + 1}`;
}
