"use client";

import { useTransition } from "react";
import { freeDeclinedSeat, keepDeclinedSeat } from "@/server/actions/seating-workspace";
import { declinedSeats } from "@/lib/seating/declined";
import { guestName } from "@/lib/seating/model";
import { useSeating } from "./seating-state";

/**
 * "Name can't come any more. Free seat N?" (spec 57 A.2). Never frees a seat
 * on its own: a guest who has stopped coming keeps the chair, with a dashed
 * orange outline, until someone clicks.
 */
export function DeclinedSeats() {
  const { eventId, layoutId, data, assignments, tableById, track, refresh, setError } = useSeating();
  const [pending, startTransition] = useTransition();
  const cards = declinedSeats(data.guests, assignments);
  if (cards.length === 0) return null;
  return (
    <section aria-label="Guests who can't come any more" className="space-y-1.5">
      {cards.map(({ guest, tableId, seatIndex }) => {
        const where = `${tableById.get(tableId)?.label ?? "a table"}${seatIndex === null ? "" : `, seat ${seatIndex + 1}`}`;
        return (
          <div key={guest.id} className="flex flex-wrap items-center gap-2 rounded border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900" role="status">
            <span className="flex-1">
              <strong>{guestName(guest)}</strong> can&rsquo;t come any more. Free {where}?
            </span>
            <button
              type="button"
              className="btn py-1"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await track(`Freed ${guestName(guest)}'s seat`, () => freeDeclinedSeat(eventId, guest.id, layoutId));
                  if (!r.ok) setError(r.error);
                  refresh();
                })
              }
            >
              Free the seat
            </button>
            <button
              type="button"
              className="btn py-1"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await keepDeclinedSeat(eventId, guest.id, layoutId);
                  if (!r.ok) setError(r.error);
                  refresh();
                })
              }
            >
              Keep for now
            </button>
          </div>
        );
      })}
    </section>
  );
}
