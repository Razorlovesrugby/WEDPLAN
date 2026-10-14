/**
 * Who belongs in the unseated tray (spec 33 §A.2), and how it's grouped and
 * filtered. Pure — the page and its tests share it.
 */

import type { GuestSide } from "@/lib/types/database";
import { compareBySurname, guestName, type SeatingAssignment, type SeatingGuest } from "./model";

/**
 * `yes`: only people who said Yes. `yes_pending`: also people who haven't
 * answered — for drafting before RSVPs land. Q2: the default is `yes_pending`
 * until the first Yes for this event arrives, then `yes`.
 */
export type TrayMode = "yes" | "yes_pending";

export function defaultTrayMode(guests: readonly SeatingGuest[]): TrayMode {
  return guests.some((g) => g.invited && g.rsvp === "yes") ? "yes" : "yes_pending";
}

/**
 * Should this person have a seat at this event? Invited, not flagged as
 * unable to come, and — depending on the mode — a Yes, or anything but a No.
 */
export function isAttending(g: SeatingGuest, mode: TrayMode): boolean {
  if (!g.invited || g.excluded) return false;
  if (g.rsvp === "no") return false;
  if (mode === "yes") return g.rsvp === "yes";
  return true;
}

export type TrayFilter = {
  tagId?: string | null;
  side?: GuestSide | null;
  query?: string | null;
};

export function matchesFilter(g: SeatingGuest, f: TrayFilter): boolean {
  if (f.tagId && !g.tagIds.includes(f.tagId)) return false;
  if (f.side && g.side !== f.side) return false;
  const q = f.query?.trim().toLowerCase();
  if (q) {
    const hay = `${guestName(g)} ${g.firstName} ${g.householdName}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export type TrayHousehold = {
  householdId: string;
  householdName: string;
  guests: SeatingGuest[];
};

/**
 * The tray: attending, unseated, matching the filter — grouped by household,
 * households by name. A household shows only its members still unseated, so
 * dragging the header seats exactly who is left.
 */
export function trayHouseholds(
  guests: readonly SeatingGuest[],
  assignments: readonly SeatingAssignment[],
  mode: TrayMode,
  filter: TrayFilter = {},
): TrayHousehold[] {
  const seated = new Set(assignments.map((a) => a.guestId));
  const byHousehold = new Map<string, TrayHousehold>();
  for (const g of guests) {
    if (seated.has(g.id) || !isAttending(g, mode) || !matchesFilter(g, filter)) continue;
    let h = byHousehold.get(g.householdId);
    if (!h) {
      h = { householdId: g.householdId, householdName: g.householdName, guests: [] };
      byHousehold.set(g.householdId, h);
    }
    h.guests.push(g);
  }
  const out = [...byHousehold.values()];
  for (const h of out) h.guests.sort(compareBySurname);
  return out.sort((a, b) => a.householdName.localeCompare(b.householdName, "en-GB", { sensitivity: "base" }));
}
