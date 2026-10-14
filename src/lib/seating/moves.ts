import type { SeatingAssignment } from "./model";

/**
 * The same swap rule `assignGuests` applies on the server, applied locally so
 * the screen moves the instant a chip is dropped. The server's answer replaces
 * this on the next refresh; a failure puts the old list back.
 */
export function applyMove(
  current: readonly SeatingAssignment[],
  guestIds: readonly string[],
  tableId: string | null,
  seatIndex: number | null | undefined,
): SeatingAssignment[] {
  const ids = new Set(guestIds);
  if (tableId === null) return current.filter((a) => !ids.has(a.guestId));

  if (seatIndex !== undefined && seatIndex !== null && guestIds.length === 1) {
    const mover = guestIds[0]!;
    const from = current.find((a) => a.guestId === mover);
    const occupant = current.find((a) => a.tableId === tableId && a.seatIndex === seatIndex && a.guestId !== mover);
    let next = current.filter((a) => a.guestId !== mover);
    if (occupant) {
      next = next.filter((a) => a.guestId !== occupant.guestId);
      if (from) next.push({ guestId: occupant.guestId, tableId: from.tableId, seatIndex: from.seatIndex });
    }
    next.push({ guestId: mover, tableId, seatIndex });
    return next;
  }

  const prev = new Map(current.map((a) => [a.guestId, a]));
  return [
    ...current.filter((a) => !ids.has(a.guestId)),
    ...guestIds.map((guestId) => {
      const p = prev.get(guestId);
      return { guestId, tableId, seatIndex: p && p.tableId === tableId ? p.seatIndex : null };
    }),
  ];
}
