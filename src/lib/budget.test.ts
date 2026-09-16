import { describe, expect, it } from "vitest";
import { componentServings, componentTotal, computeCurrent, consumptionTotal } from "./budget";

// Mirrors the tier-A counts in the shared seed (supabase/seed.sql): 10
// adults, 1 child, 11 seats in the wedding's top tier — see
// supabase/tests/03_budget.sql for the same numbers asserted against
// v_budget_items / v_budget_summary directly.
const seedCounts = { adult: 10, child: 1, seat: 11 };

describe("computeCurrent", () => {
  it("falls back through contracted, then quoted, then estimated for a flat item", () => {
    expect(
      computeCurrent({ quantityBasis: "flat", unitPrice: null, estimated: 100, quoted: 200, contracted: 300 }, seedCounts),
    ).toBe(300);
    expect(
      computeCurrent({ quantityBasis: "flat", unitPrice: null, estimated: 100, quoted: 200, contracted: null }, seedCounts),
    ).toBe(200);
    expect(
      computeCurrent({ quantityBasis: "flat", unitPrice: null, estimated: 100, quoted: null, contracted: null }, seedCounts),
    ).toBe(100);
    expect(
      computeCurrent({ quantityBasis: "flat", unitPrice: null, estimated: null, quoted: null, contracted: null }, seedCounts),
    ).toBe(0);
  });

  it("scales a per_adult item with the live adult count, ignoring estimated/quoted/contracted", () => {
    expect(
      computeCurrent(
        { quantityBasis: "per_adult", unitPrice: 4500, estimated: 1, quoted: 1, contracted: 1 },
        seedCounts,
      ),
    ).toBe(45000);
  });

  it("scales a per_child item with the live child count", () => {
    expect(
      computeCurrent({ quantityBasis: "per_child", unitPrice: 2000, estimated: null, quoted: null, contracted: null }, seedCounts),
    ).toBe(2000);
  });

  it("scales a per_seat item with adults plus children", () => {
    expect(
      computeCurrent({ quantityBasis: "per_seat", unitPrice: 6000, estimated: null, quoted: null, contracted: null }, seedCounts),
    ).toBe(66000);
  });

  it("scales a manual item by its own quantity, not a guest count", () => {
    expect(
      computeCurrent(
        { quantityBasis: "manual", unitPrice: 2500, estimated: null, quoted: null, contracted: null, quantity: 12 },
        seedCounts,
      ),
    ).toBe(30000); // 12 centrepieces at £25
  });

  it("allows a decimal manual quantity", () => {
    expect(
      computeCurrent(
        { quantityBasis: "manual", unitPrice: 6000, estimated: null, quoted: null, contracted: null, quantity: 2.5 },
        seedCounts,
      ),
    ).toBe(15000); // 2.5 hours at £60/hr
  });

  it("defaults a manual item's quantity to 1 when not set", () => {
    expect(
      computeCurrent(
        { quantityBasis: "manual", unitPrice: 4500, estimated: null, quoted: null, contracted: null, quantity: null },
        seedCounts,
      ),
    ).toBe(4500);
    expect(
      computeCurrent(
        { quantityBasis: "manual", unitPrice: 4500, estimated: null, quoted: null, contracted: null },
        seedCounts,
      ),
    ).toBe(4500);
  });

  it("uses whatever count a caller already scoped to one event, same math either way", () => {
    const eventCounts = { adult: 4, child: 0, seat: 4 };
    expect(
      computeCurrent({ quantityBasis: "per_seat", unitPrice: 6000, estimated: null, quoted: null, contracted: null }, eventCounts),
    ).toBe(24000);
  });

  it("sums consumption components instead of reading unit_price", () => {
    const components = [
      { guestBasis: "per_adult" as const, servingsPerGuestPerHour: 1.5, durationHours: 4, pricePerServing: 500, wastageBufferPct: 0 },
      { guestBasis: "per_seat" as const, servingsPerGuestPerHour: 1, durationHours: 4, pricePerServing: 150, wastageBufferPct: 0 },
    ];
    expect(
      computeCurrent({ quantityBasis: "consumption", unitPrice: null, estimated: 999, quoted: 999, contracted: 999 }, seedCounts, components),
    ).toBe(consumptionTotal(components, seedCounts));
  });
});

describe("consumption components", () => {
  it("rounds servings up — you can't buy a fractional bottle", () => {
    const component = {
      guestBasis: "per_adult" as const,
      servingsPerGuestPerHour: 1.5,
      durationHours: 4,
      pricePerServing: 500,
      wastageBufferPct: 0,
    };
    // 1.5 * 4 * 10 = 60 exactly — bump durationHours to force a fraction.
    expect(componentServings({ ...component, durationHours: 4.1 }, seedCounts)).toBe(62); // ceil(61.5)
    expect(componentTotal({ ...component, durationHours: 4.1 }, seedCounts)).toBe(62 * 500);
  });

  it("applies the wastage buffer before rounding", () => {
    const component = {
      guestBasis: "per_seat" as const,
      servingsPerGuestPerHour: 1,
      durationHours: 4,
      pricePerServing: 150,
      wastageBufferPct: 0.1,
    };
    // 1 * 4 * 11 * 1.1 = 48.4
    expect(componentServings(component, seedCounts)).toBe(49);
  });

  it("sums independently-priced components for the parent item's total", () => {
    const wine = {
      guestBasis: "per_adult" as const,
      servingsPerGuestPerHour: 1.5,
      durationHours: 4,
      pricePerServing: 500,
      wastageBufferPct: 0,
    };
    const softDrinks = {
      guestBasis: "per_seat" as const,
      servingsPerGuestPerHour: 1,
      durationHours: 4,
      pricePerServing: 150,
      wastageBufferPct: 0,
    };
    const expected = componentTotal(wine, seedCounts) + componentTotal(softDrinks, seedCounts);
    expect(consumptionTotal([wine, softDrinks], seedCounts)).toBe(expected);
  });

  it("returns zero for no components", () => {
    expect(consumptionTotal([], seedCounts)).toBe(0);
  });
});
