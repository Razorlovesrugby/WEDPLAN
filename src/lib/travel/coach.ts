import type { CoachRunView } from "@/lib/types/database";

/**
 * Coach capacity (spec 14 §7.1).
 *
 * Pure, and tested, because the two things that go wrong here both go wrong
 * quietly: a run with no capacity set behaving as though it were full, and a
 * household changing its reservation being double-counted against the limit.
 */

export type SeatAvailability = {
  /** Null when the run has no capacity set — not zero, and not unlimited. */
  seatsLeft: number | null;
  full: boolean;
  /** "34 of 49 seats taken", or the honest version when nobody has counted. */
  label: string;
};

export function availability(run: Pick<CoachRunView, "capacity" | "seats_taken">): SeatAvailability {
  const taken = Math.max(run.seats_taken, 0);

  if (run.capacity === null) {
    // Nobody has counted the vehicle yet. Saying "0 left" would stop people
    // reserving; saying "unlimited" would oversell it. Say what is known.
    return {
      seatsLeft: null,
      full: false,
      label: taken === 0 ? "No seats reserved yet" : `${taken} ${taken === 1 ? "seat" : "seats"} reserved`,
    };
  }

  const left = Math.max(run.capacity - taken, 0);
  return {
    seatsLeft: left,
    full: left === 0,
    label: `${taken} of ${run.capacity} seats taken`,
  };
}

export type SeatRequest = {
  /** Seats the household wants in total on this run. */
  seats: number;
  /** What they already hold on this run, which the request replaces. */
  existingSeats: number;
  capacity: number | null;
  /** Seats taken across the whole run, INCLUDING this household's existing. */
  seatsTaken: number;
};

export type SeatCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a reservation fits.
 *
 * The subtlety is `existingSeats`: a household holding 4 seats and changing to
 * 5 needs one more seat, not five. Checking the raw request against remaining
 * capacity would refuse a household shrinking its own booking on a full coach,
 * which is both wrong and maddening.
 */
export function canReserve(request: SeatRequest): SeatCheck {
  if (!Number.isInteger(request.seats) || request.seats < 1) {
    return { ok: false, reason: "Choose at least one seat." };
  }
  if (request.seats > 20) {
    return { ok: false, reason: "That's more seats than any one household needs — tell us directly." };
  }
  if (request.capacity === null) return { ok: true };

  const others = Math.max(request.seatsTaken - request.existingSeats, 0);
  const remaining = request.capacity - others;

  if (request.seats > remaining) {
    return {
      ok: false,
      reason:
        remaining <= 0
          ? "The coach is full."
          : `Only ${remaining} ${remaining === 1 ? "seat is" : "seats are"} left.`,
    };
  }
  return { ok: true };
}
