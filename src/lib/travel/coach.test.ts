import { describe, expect, it } from "vitest";
import { availability, canReserve } from "./coach";

describe("availability", () => {
  it("reports taken and left against a counted capacity", () => {
    expect(availability({ capacity: 49, seats_taken: 34 })).toEqual({
      seatsLeft: 15,
      full: false,
      label: "34 of 49 seats taken",
    });
  });

  it("is full at capacity", () => {
    expect(availability({ capacity: 49, seats_taken: 49 }).full).toBe(true);
  });

  it("never reports negative seats left", () => {
    // Capacity lowered after reservations were taken is a real sequence.
    expect(availability({ capacity: 40, seats_taken: 49 }).seatsLeft).toBe(0);
    expect(availability({ capacity: 40, seats_taken: 49 }).full).toBe(true);
  });

  it("treats an uncounted run as unknown, not full and not unlimited", () => {
    // "0 left" would stop people reserving; "unlimited" would oversell it.
    const result = availability({ capacity: null, seats_taken: 12 });
    expect(result.seatsLeft).toBeNull();
    expect(result.full).toBe(false);
    expect(result.label).toBe("12 seats reserved");
  });

  it("says something sensible for an empty uncounted run", () => {
    expect(availability({ capacity: null, seats_taken: 0 }).label).toBe("No seats reserved yet");
  });

  it("gets the singular right", () => {
    expect(availability({ capacity: null, seats_taken: 1 }).label).toBe("1 seat reserved");
  });
});

describe("canReserve", () => {
  const base = { existingSeats: 0, capacity: 49, seatsTaken: 0 };

  it("allows a booking that fits", () => {
    expect(canReserve({ ...base, seats: 4 })).toEqual({ ok: true });
  });

  it("refuses more than remains", () => {
    const result = canReserve({ ...base, seats: 4, seatsTaken: 47 });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "Only 2 seats are left." });
  });

  it("says the coach is full rather than 'only 0 seats left'", () => {
    expect(canReserve({ ...base, seats: 1, seatsTaken: 49 })).toMatchObject({
      reason: "The coach is full.",
    });
  });

  it("counts only the difference when a household changes its own booking", () => {
    // The bug this exists for: a household holding 4 of 49 on a full coach
    // trying to change to 5 needs ONE more seat, not five — and trying to
    // change to 3 needs none at all.
    expect(canReserve({ seats: 5, existingSeats: 4, capacity: 49, seatsTaken: 49 })).toMatchObject({
      ok: false,
    });
    expect(canReserve({ seats: 4, existingSeats: 4, capacity: 49, seatsTaken: 49 })).toEqual({
      ok: true,
    });
    expect(canReserve({ seats: 3, existingSeats: 4, capacity: 49, seatsTaken: 49 })).toEqual({
      ok: true,
    });
  });

  it("allows any reasonable number when nobody has counted the coach", () => {
    expect(canReserve({ seats: 6, existingSeats: 0, capacity: null, seatsTaken: 100 })).toEqual({
      ok: true,
    });
  });

  it("rejects zero, negatives and fractions", () => {
    for (const seats of [0, -1, 1.5, Number.NaN]) {
      expect(canReserve({ ...base, seats }).ok, String(seats)).toBe(false);
    }
  });

  it("rejects an absurd number even with no capacity set", () => {
    expect(canReserve({ seats: 500, existingSeats: 0, capacity: null, seatsTaken: 0 }).ok).toBe(false);
  });

  it("tolerates seatsTaken being behind existingSeats", () => {
    // Can happen mid-transaction or with a stale read; must not produce a
    // negative "others" and silently allow overbooking.
    expect(canReserve({ seats: 2, existingSeats: 5, capacity: 4, seatsTaken: 0 })).toEqual({ ok: true });
  });
});
