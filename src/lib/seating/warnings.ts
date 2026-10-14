/**
 * Seating warnings (spec 33 §B.2). Computed from the loaded plan, never
 * stored, and NEVER blocking: the couple will deliberately override some of
 * these, and the job is to remember the rules for them across nine rounds of
 * revision, not to argue.
 */

import {
  NEAR_CM,
  fixturePolygon,
  polygonDistance,
  polygonsOverlap,
  tablePolygon,
} from "./geometry";
import {
  guestName,
  takesAChair,
  type SeatingAssignment,
  type SeatingFixture,
  type SeatingGuest,
  type SeatingRule,
  type SeatingTable,
} from "./model";
import { isAttending, type TrayMode } from "./tray";

export type WarningKind =
  | "over_capacity"
  | "declined_seated"
  | "unanswered_seated"
  | "child_away"
  | "plus_one_split"
  | "together"
  | "apart"
  | "near"
  | "near_unplaced"
  | "avoid_table"
  | "accessible"
  | "chair_off_table"
  | "overlap";

export type SeatingWarning = {
  kind: WarningKind;
  /** Informational lines are shown, but not counted as problems. */
  severity: "warning" | "info";
  /** Every table the warning concerns (one, or two for a pair split). */
  tableIds: string[];
  guestIds: string[];
  message: string;
};

export type WarningInput = {
  tables: readonly SeatingTable[];
  fixtures?: readonly SeatingFixture[];
  guests: readonly SeatingGuest[];
  assignments: readonly SeatingAssignment[];
  rules: readonly SeatingRule[];
  trayMode: TrayMode;
};

export type TableOccupancy = {
  tableId: string;
  /** Guests at the table (active guests only), infants included. */
  guestIds: string[];
  /** Chairs taken: non-infant guests plus reserved seats. */
  chairsTaken: number;
  free: number;
};

export type SeatingSummary = {
  attending: number;
  seated: number;
  unseated: number;
  emptyChairs: number;
  overCapacityTables: number;
  problems: number;
};

/**
 * Who sits where, considering only guests that still exist (an assignment
 * row for a soft-deleted guest survives in the database but not here).
 */
export function occupancy(
  tables: readonly SeatingTable[],
  guests: readonly SeatingGuest[],
  assignments: readonly SeatingAssignment[],
): Map<string, TableOccupancy> {
  const guestById = new Map(guests.map((g) => [g.id, g]));
  const out = new Map<string, TableOccupancy>();
  for (const t of tables) {
    out.set(t.id, { tableId: t.id, guestIds: [], chairsTaken: t.reserved_seats, free: 0 });
  }
  for (const a of assignments) {
    const g = guestById.get(a.guestId);
    const o = out.get(a.tableId);
    if (!g || !o) continue;
    o.guestIds.push(g.id);
    if (takesAChair(g)) o.chairsTaken += 1;
  }
  for (const t of tables) {
    const o = out.get(t.id)!;
    o.free = Math.max(0, t.capacity - o.chairsTaken);
  }
  return out;
}

function namesOf(ids: readonly string[], guestById: Map<string, SeatingGuest>): string {
  const names = ids.map((id) => guestById.get(id)).filter(Boolean).map((g) => guestName(g!));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function computeWarnings(input: WarningInput): SeatingWarning[] {
  const { tables, guests, assignments, rules, trayMode } = input;
  const fixtures = input.fixtures ?? [];
  const guestById = new Map(guests.map((g) => [g.id, g]));
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const live = assignments.filter((a) => guestById.has(a.guestId) && tableById.has(a.tableId));
  const tableOf = new Map(live.map((a) => [a.guestId, a.tableId]));
  const occ = occupancy(tables, guests, live);
  const out: SeatingWarning[] = [];
  const label = (id: string) => tableById.get(id)?.label ?? "a table";

  // Over capacity.
  for (const t of tables) {
    const o = occ.get(t.id)!;
    if (o.chairsTaken > t.capacity) {
      out.push({
        kind: "over_capacity",
        severity: "warning",
        tableIds: [t.id],
        guestIds: [],
        message: `${t.label} has ${o.chairsTaken} for ${t.capacity} seats`,
      });
    }
  }

  // Declined / no longer coming / no longer invited, but still seated; and
  // seated before answering (only worth saying once the tray is on Yes only).
  for (const a of live) {
    const g = guestById.get(a.guestId)!;
    if (!g.invited || g.excluded || g.rsvp === "no") {
      const why = !g.invited ? "is no longer invited" : g.rsvp === "no" ? "has declined" : "has said they can't come";
      out.push({
        kind: "declined_seated",
        severity: "warning",
        tableIds: [a.tableId],
        guestIds: [g.id],
        message: `${guestName(g)} ${why} but is still at ${label(a.tableId)}`,
      });
    } else if (trayMode === "yes" && !isAttending(g, "yes")) {
      out.push({
        kind: "unanswered_seated",
        severity: "info",
        tableIds: [a.tableId],
        guestIds: [g.id],
        message: `${guestName(g)} hasn't answered yet`,
      });
    }
  }

  // Chairs past the end of a table that has since shrunk.
  for (const a of live) {
    const t = tableById.get(a.tableId)!;
    if (a.seatIndex !== null && a.seatIndex >= t.capacity) {
      out.push({
        kind: "chair_off_table",
        severity: "warning",
        tableIds: [t.id],
        guestIds: [a.guestId],
        message: `${guestName(guestById.get(a.guestId)!)} is in chair ${a.seatIndex + 1} of a ${t.capacity}-seat table`,
      });
    }
  }

  // Children away from every seated adult of their household.
  const seatedAdultsByHousehold = new Map<string, Set<string>>();
  for (const a of live) {
    const g = guestById.get(a.guestId)!;
    if (g.ageBand !== "adult") continue;
    const set = seatedAdultsByHousehold.get(g.householdId) ?? new Set<string>();
    set.add(a.tableId);
    seatedAdultsByHousehold.set(g.householdId, set);
  }
  for (const a of live) {
    const g = guestById.get(a.guestId)!;
    if (g.ageBand === "adult") continue;
    const adultTables = seatedAdultsByHousehold.get(g.householdId);
    if (adultTables && adultTables.size > 0 && !adultTables.has(a.tableId)) {
      out.push({
        kind: "child_away",
        severity: "warning",
        tableIds: [a.tableId, ...adultTables],
        guestIds: [g.id],
        message: `${guestName(g)} is away from the rest of ${g.householdName}`,
      });
    }
  }

  // Plus-ones apart from the guest they came with.
  for (const a of live) {
    const g = guestById.get(a.guestId)!;
    if (!g.plusOneFor) continue;
    const other = tableOf.get(g.plusOneFor);
    if (other && other !== a.tableId) {
      out.push({
        kind: "plus_one_split",
        severity: "warning",
        tableIds: [a.tableId, other],
        guestIds: [g.id, g.plusOneFor],
        message: `${namesOf([g.id, g.plusOneFor], guestById)} came together but are at different tables`,
      });
    }
  }

  // Rules.
  for (const r of rules) {
    const ta = tableOf.get(r.guest_a);
    const tb = r.guest_b ? tableOf.get(r.guest_b) : undefined;
    const pair = r.guest_b ? [r.guest_a, r.guest_b] : [r.guest_a];
    switch (r.kind) {
      case "together":
        if (ta && tb && ta !== tb) {
          out.push({
            kind: "together", severity: "warning", tableIds: [ta, tb], guestIds: pair,
            message: `${namesOf(pair, guestById)} should sit together`,
          });
        }
        break;
      case "apart":
        if (ta && tb && ta === tb) {
          out.push({
            kind: "apart", severity: "warning", tableIds: [ta], guestIds: pair,
            message: `${namesOf(pair, guestById)} should be at different tables`,
          });
        }
        break;
      case "near": {
        if (!ta || !tb || ta === tb) break;
        const pa = tablePolygon(tableById.get(ta)!);
        const pb = tablePolygon(tableById.get(tb)!);
        if (!pa || !pb) {
          out.push({
            kind: "near_unplaced", severity: "info", tableIds: [ta, tb], guestIds: pair,
            message: `Can't check ${namesOf(pair, guestById)} are near each other until both tables are placed in the room`,
          });
        } else if (polygonDistance(pa, pb) > NEAR_CM) {
          out.push({
            kind: "near", severity: "warning", tableIds: [ta, tb], guestIds: pair,
            message: `${namesOf(pair, guestById)} should be at neighbouring tables`,
          });
        }
        break;
      }
      case "avoid_table":
        if (ta && ta === r.table_id) {
          out.push({
            kind: "avoid_table", severity: "warning", tableIds: [ta], guestIds: pair,
            message: `${namesOf(pair, guestById)} shouldn't be at ${label(ta)}`,
          });
        }
        break;
      case "accessible":
        if (ta && !tableById.get(ta)!.accessible) {
          out.push({
            kind: "accessible", severity: "warning", tableIds: [ta], guestIds: pair,
            message: `${namesOf(pair, guestById)} needs an accessible table`,
          });
        }
        break;
    }
  }

  // Overlaps in the room: table/table and table/fixture.
  const placed = tables
    .map((t) => ({ t, poly: tablePolygon(t) }))
    .filter((x): x is { t: SeatingTable; poly: NonNullable<ReturnType<typeof tablePolygon>> } => x.poly !== null);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (polygonsOverlap(placed[i]!.poly, placed[j]!.poly)) {
        out.push({
          kind: "overlap", severity: "warning", tableIds: [placed[i]!.t.id, placed[j]!.t.id], guestIds: [],
          message: `${placed[i]!.t.label} overlaps ${placed[j]!.t.label}`,
        });
      }
    }
    for (const f of fixtures) {
      if (polygonsOverlap(placed[i]!.poly, fixturePolygon(f))) {
        out.push({
          kind: "overlap", severity: "warning", tableIds: [placed[i]!.t.id], guestIds: [],
          message: `${placed[i]!.t.label} overlaps the ${(f.label ?? f.kind.replace("_", " ")).toLowerCase()}`,
        });
      }
    }
  }

  return out;
}

export function summarise(input: WarningInput, warnings: readonly SeatingWarning[]): SeatingSummary {
  const attendingIds = new Set(input.guests.filter((g) => isAttending(g, input.trayMode)).map((g) => g.id));
  const guestIds = new Set(input.guests.map((g) => g.id));
  const tableIds = new Set(input.tables.map((t) => t.id));
  const seatedIds = new Set(
    input.assignments.filter((a) => guestIds.has(a.guestId) && tableIds.has(a.tableId)).map((a) => a.guestId),
  );
  const occ = occupancy(input.tables, input.guests, input.assignments);
  let empty = 0;
  let over = 0;
  for (const t of input.tables) {
    const o = occ.get(t.id)!;
    empty += o.free;
    if (o.chairsTaken > t.capacity) over += 1;
  }
  return {
    attending: attendingIds.size,
    seated: seatedIds.size,
    unseated: [...attendingIds].filter((id) => !seatedIds.has(id)).length,
    emptyChairs: empty,
    overCapacityTables: over,
    problems: warnings.filter((w) => w.severity === "warning").length,
  };
}

/** Warnings grouped by every table they concern. */
export function warningsByTable(warnings: readonly SeatingWarning[]): Map<string, SeatingWarning[]> {
  const out = new Map<string, SeatingWarning[]>();
  for (const w of warnings) {
    for (const id of new Set(w.tableIds)) {
      const list = out.get(id) ?? [];
      list.push(w);
      out.set(id, list);
    }
  }
  return out;
}

/** Guests seated who shouldn't be — what "Return all declined to the tray" moves. */
export function declinedSeatedGuestIds(warnings: readonly SeatingWarning[]): string[] {
  return [...new Set(warnings.filter((w) => w.kind === "declined_seated").flatMap((w) => w.guestIds))];
}
