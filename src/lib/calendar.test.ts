import { describe, expect, it } from "vitest";
import { monthGrid, monthLabel, monthStart, monthWeeks, shiftMonth } from "./calendar";

describe("monthStart", () => {
  it("normalises any date in the month to its 1st", () => {
    expect(monthStart("2027-06-17")).toBe("2027-06-01");
    expect(monthStart("2027-06-01")).toBe("2027-06-01");
  });
});

describe("shiftMonth", () => {
  it("moves forward and back, landing on the 1st", () => {
    expect(shiftMonth("2027-06-17", 1)).toBe("2027-07-01");
    expect(shiftMonth("2027-06-17", -1)).toBe("2027-05-01");
  });

  it("crosses a year boundary in both directions", () => {
    expect(shiftMonth("2027-12-05", 1)).toBe("2028-01-01");
    expect(shiftMonth("2027-01-05", -1)).toBe("2026-12-01");
  });
});

describe("monthGrid", () => {
  it("starts on a Monday and ends on a Sunday", () => {
    const cells = monthGrid("2027-06-17");
    expect(new Date(cells[0]!.date).getUTCDay()).toBe(new Date("2027-06-07").getUTCDay());
    // Every row is 7 long, so the grid always starts Mon and ends Sun by construction —
    // assert the day-of-week directly via a known Monday/Sunday pair instead.
    const first = cells[0]!.date;
    const last = cells[cells.length - 1]!.date;
    expect(dow(first)).toBe(1); // Monday
    expect(dow(last)).toBe(0); // Sunday
  });

  it("includes every day of the target month, each marked inMonth", () => {
    const cells = monthGrid("2027-02-10"); // Feb 2027, not a leap year: 28 days
    const inMonthDates = cells.filter((c) => c.inMonth).map((c) => c.date);
    expect(inMonthDates).toEqual(
      Array.from({ length: 28 }, (_, i) => `2027-02-${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("pads leading/trailing days from neighbouring months, marked not inMonth", () => {
    const cells = monthGrid("2027-02-10");
    const leading = cells.filter((c) => c.date < "2027-02-01");
    const trailing = cells.filter((c) => c.date > "2027-02-28");
    expect(leading.every((c) => !c.inMonth)).toBe(true);
    expect(trailing.every((c) => !c.inMonth)).toBe(true);
  });

  it("always produces a whole number of weeks", () => {
    for (const month of ["2027-01-01", "2027-02-01", "2027-06-01", "2027-08-01"]) {
      expect(monthGrid(month).length % 7).toBe(0);
    }
  });

  it("a month that already starts on Monday adds no leading padding", () => {
    // 2027-11-01 is a Monday.
    const cells = monthGrid("2027-11-01");
    expect(cells[0]!.date).toBe("2027-11-01");
  });
});

describe("monthWeeks", () => {
  it("groups the grid into rows of 7", () => {
    const weeks = monthWeeks("2027-06-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat()).toEqual(monthGrid("2027-06-01"));
  });
});

describe("monthLabel", () => {
  it("renders a human month/year label", () => {
    expect(monthLabel("2027-06-17")).toBe("June 2027");
  });
});

function dow(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}
