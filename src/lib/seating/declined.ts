/**
 * Declined, still in a seat (spec 57 A.2). A guest whose reply for the event
 * is now No (or who can't come any more) and who still has a chair gets a
 * dashed orange outline, and the screen asks whether to free the seat. The
 * seat is never freed without that click, and "Keep for now" hides the card
 * for that guest until their reply changes again. Pure.
 */

import type { SeatingAssignment, SeatingGuest } from "./model";
import { isAttending } from "./tray";

export type DeclinedSeat = { guest: SeatingGuest; tableId: string; seatIndex: number | null };

/** The seated guests who aren't coming and haven't been kept. */
export function declinedSeats(guests: readonly SeatingGuest[], assignments: readonly SeatingAssignment[]): DeclinedSeat[] {
  const byId = new Map(guests.map((g) => [g.id, g]));
  const out: DeclinedSeat[] = [];
  for (const a of assignments) {
    const g = byId.get(a.guestId);
    if (!g || isAttending(g, "yes_pending")) continue;
    if (isKept(a.declineKeptAt ?? null, g.replyChangedAt)) continue;
    out.push({ guest: g, tableId: a.tableId, seatIndex: a.seatIndex });
  }
  return out;
}

/**
 * "Keep for now" holds until the guest's reply changes again: kept at or after
 * the last change means hidden. A guest with no recorded change stays hidden
 * once kept.
 */
export function isKept(keptAt: string | null, replyChangedAt: string | null): boolean {
  if (!keptAt) return false;
  if (!replyChangedAt) return true;
  return Date.parse(keptAt) >= Date.parse(replyChangedAt);
}
