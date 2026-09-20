import { describe, expect, it } from "vitest";
import {
  allocationEstimate,
  applyGst,
  categoryTarget,
  componentServings,
  componentTotal,
  computeCurrent,
  consumptionTotal,
  effectiveEstimated,
  estimateSource,
  filled,
  itemAllocation,
  pctOf,
  sectionAllocation,
  variance,
} from "./budget";

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

describe("applyGst", () => {
  it("leaves an inclusive amount unchanged", () => {
    expect(applyGst(80000, "inclusive")).toBe(80000);
  });

  it("adds 15% to an exclusive amount", () => {
    expect(applyGst(80000, "exclusive")).toBe(92000);
  });

  it("rounds to the nearest minor unit", () => {
    expect(applyGst(333, "exclusive")).toBe(383); // 382.95 -> 383
  });
});

describe("computeCurrent — GST (spec 18)", () => {
  it("defaults to inclusive (no change) when gstTreatment is omitted", () => {
    expect(
      computeCurrent({ quantityBasis: "flat", unitPrice: null, estimated: null, quoted: null, contracted: 80000 }, seedCounts),
    ).toBe(80000);
  });

  it("grosses up a flat item's contracted figure by 15% when exclusive", () => {
    expect(
      computeCurrent(
        { quantityBasis: "flat", unitPrice: null, estimated: null, quoted: null, contracted: 80000, gstTreatment: "exclusive" },
        seedCounts,
      ),
    ).toBe(92000);
  });

  it("grosses up a per_adult item's live total by 15% when exclusive", () => {
    expect(
      computeCurrent(
        { quantityBasis: "per_adult", unitPrice: 6000, estimated: null, quoted: null, contracted: null, gstTreatment: "exclusive" },
        seedCounts,
      ),
    ).toBe(69000); // 6000 * 10 adults = 60000, * 1.15 = 69000
  });

  it("grosses up a manual item's quantity * unit_price by 15% when exclusive", () => {
    expect(
      computeCurrent(
        {
          quantityBasis: "manual",
          unitPrice: 2500,
          estimated: null,
          quoted: null,
          contracted: null,
          quantity: 12,
          gstTreatment: "exclusive",
        },
        seedCounts,
      ),
    ).toBe(34500); // 30000 * 1.15
  });

  it("grosses up a consumption item's summed total by 15% when exclusive", () => {
    const components = [
      { guestBasis: "per_adult" as const, servingsPerGuestPerHour: 1.5, durationHours: 4, pricePerServing: 500, wastageBufferPct: 0 },
    ];
    const exclTotal = computeCurrent(
      { quantityBasis: "consumption", unitPrice: null, estimated: null, quoted: null, contracted: null, gstTreatment: "exclusive" },
      seedCounts,
      components,
    );
    expect(exclTotal).toBe(applyGst(consumptionTotal(components, seedCounts), "exclusive"));
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

// ---------------------------------------------------------------------------
// Allocation (spec 19)
// ---------------------------------------------------------------------------

describe("pctOf", () => {
  it("takes a percentage in whole minor units", () => {
    expect(pctOf(4_000_000, 12)).toBe(480_000); // 12% of $40,000 = $4,800
    expect(pctOf(320_000, 80)).toBe(256_000); // 80% of $3,200 = $2,560
  });

  it("allows a fractional percentage", () => {
    expect(pctOf(4_000_000, 12.5)).toBe(500_000);
  });

  it("rounds to the cent rather than carrying a fraction", () => {
    expect(pctOf(3333, 33.33)).toBe(1111); // 1110.89...
    expect(pctOf(1, 50)).toBe(1); // 0.5 rounds up, not to 0
  });
});

describe("categoryTarget / itemAllocation", () => {
  it("resolves the planner's own worked example", () => {
    const drinks = categoryTarget(4_000_000, 8); // 8% of $40,000
    expect(drinks).toBe(320_000);
    const alcohol = itemAllocation(drinks, 80);
    const nonAlcoholic = itemAllocation(drinks, 10);
    const glassware = itemAllocation(drinks, 10);
    expect([alcohol, nonAlcoholic, glassware]).toEqual([256_000, 32_000, 32_000]);
    expect(alcohol! + nonAlcoholic! + glassware!).toBe(drinks);
  });

  it("is null when the overall budget is unset", () => {
    expect(categoryTarget(null, 12)).toBeNull();
    expect(itemAllocation(categoryTarget(null, 12), 80)).toBeNull();
  });

  it("is null when the category has no percentage", () => {
    expect(categoryTarget(4_000_000, null)).toBeNull();
    expect(itemAllocation(categoryTarget(4_000_000, null), 80)).toBeNull();
  });

  it("is null when the line has no percentage", () => {
    expect(itemAllocation(categoryTarget(4_000_000, 8), null)).toBeNull();
  });
});

describe("allocationEstimate", () => {
  it("is the allocation itself for a GST-inclusive line", () => {
    expect(allocationEstimate(256_000, "inclusive")).toBe(256_000);
    expect(allocationEstimate(256_000)).toBe(256_000);
  });

  it("divides by 1.15 for a GST-exclusive line, so the line lands on its allocation", () => {
    const allocated = 460_000; // $4,600 all-in
    const estimate = allocationEstimate(allocated, "exclusive");
    expect(estimate).toBe(400_000); // $4,000 + 15% GST = $4,600
    expect(applyGst(estimate!, "exclusive")).toBe(allocated);
  });

  it("lands within a cent when the gross-up doesn't round-trip exactly", () => {
    const allocated = 100_000;
    const estimate = allocationEstimate(allocated, "exclusive");
    expect(estimate).toBe(86_957);
    // Integer minor units can't always round-trip a 15% uplift — one cent.
    expect(Math.abs(applyGst(estimate!, "exclusive") - allocated)).toBeLessThanOrEqual(1);
  });

  it("is null without an allocation", () => {
    expect(allocationEstimate(null, "exclusive")).toBeNull();
    expect(allocationEstimate(undefined)).toBeNull();
  });
});

describe("effectiveEstimated / estimateSource", () => {
  const base = { quantityBasis: "flat" as const, unitPrice: null, quoted: null, contracted: null };

  it("prefers a typed estimate over the allocation", () => {
    const item = { ...base, estimated: 300_000, allocatedAmount: 256_000 };
    expect(effectiveEstimated(item)).toBe(300_000);
    expect(estimateSource(item)).toBe("entered");
  });

  it("falls back to the allocation when no estimate is typed", () => {
    const item = { ...base, estimated: null, allocatedAmount: 256_000 };
    expect(effectiveEstimated(item)).toBe(256_000);
    expect(estimateSource(item)).toBe("allocation");
  });

  it("is null when there is neither", () => {
    const item = { ...base, estimated: null };
    expect(effectiveEstimated(item)).toBeNull();
    expect(estimateSource(item)).toBe("none");
  });
});

describe("computeCurrent with an allocation", () => {
  const flat = { quantityBasis: "flat" as const, unitPrice: null, estimated: null, quoted: null, contracted: null };

  it("uses the allocation as a flat line's estimate when none is typed", () => {
    expect(computeCurrent({ ...flat, allocatedAmount: 256_000 }, seedCounts)).toBe(256_000);
  });

  it("lets a typed estimate win over the allocation", () => {
    expect(computeCurrent({ ...flat, estimated: 300_000, allocatedAmount: 256_000 }, seedCounts)).toBe(300_000);
  });

  it("still prefers quoted and contracted over both", () => {
    expect(computeCurrent({ ...flat, quoted: 280_000, allocatedAmount: 256_000 }, seedCounts)).toBe(280_000);
    expect(
      computeCurrent({ ...flat, quoted: 280_000, contracted: 275_000, allocatedAmount: 256_000 }, seedCounts),
    ).toBe(275_000);
  });

  it("lands a GST-exclusive flat line on its allocation rather than 15% above it", () => {
    expect(
      computeCurrent({ ...flat, allocatedAmount: 460_000, gstTreatment: "exclusive" }, seedCounts),
    ).toBe(460_000);
  });

  it("does not feed a per_adult line — the allocation is a target there, not an input", () => {
    expect(
      computeCurrent(
        { quantityBasis: "per_adult", unitPrice: 4500, estimated: null, quoted: null, contracted: null, allocatedAmount: 999_999 },
        seedCounts,
      ),
    ).toBe(45_000);
  });

  it("does not feed a consumption line either", () => {
    const wine = {
      guestBasis: "per_adult" as const,
      servingsPerGuestPerHour: 1.5,
      durationHours: 4,
      pricePerServing: 500,
      wastageBufferPct: 0,
    };
    expect(
      computeCurrent(
        { quantityBasis: "consumption", unitPrice: null, estimated: null, quoted: null, contracted: null, allocatedAmount: 999_999 },
        seedCounts,
        [wine],
      ),
    ).toBe(30_000);
  });

  it("is unchanged from today's behaviour when no allocation is resolvable", () => {
    expect(computeCurrent({ ...flat, estimated: 100 }, seedCounts)).toBe(100);
    expect(computeCurrent({ ...flat }, seedCounts)).toBe(0);
  });
});

describe("variance", () => {
  it("reports over against the allocation, in money and percent", () => {
    expect(variance(510_000, 480_000)).toEqual({ amount: 30_000, pct: 6.25 });
  });

  it("reports under as a negative", () => {
    expect(variance(450_000, 480_000)).toEqual({ amount: -30_000, pct: -6.25 });
  });

  it("reports exactly on target as zero", () => {
    expect(variance(480_000, 480_000)).toEqual({ amount: 0, pct: 0 });
  });

  it("has no percentage against a zero allocation, but still has an amount", () => {
    expect(variance(1000, 0)).toEqual({ amount: 1000, pct: null });
  });

  it("is null with no allocation at all", () => {
    expect(variance(1000, null)).toBeNull();
  });
});

describe("sectionAllocation", () => {
  const target = 320_000; // Drinks: 8% of a $40,000 budget

  it("answers the planner's own question — 38 + 30 + 42 does not add to 100", () => {
    const result = sectionAllocation(
      [{ allocationPct: 38 }, { allocationPct: 30 }, { allocationPct: 42 }],
      target,
    );
    expect(result.allocatedPct).toBe(110);
    expect(result.allocatedAmount).toBe(352_000); // 121600 + 96000 + 134400
    expect(result.remainingPct).toBe(-10);
    expect(result.remainingAmount).toBe(-32_000); // $320 over-allocated
  });

  it("reports what's left when the section is under-allocated", () => {
    const result = sectionAllocation(
      [{ allocationPct: 38 }, { allocationPct: 30 }, { allocationPct: 22 }],
      target,
    );
    expect(result.allocatedPct).toBe(90);
    expect(result.remainingPct).toBe(10);
    expect(result.remainingAmount).toBe(32_000);
  });

  it("reports exactly 100% as nothing remaining, not as over", () => {
    const result = sectionAllocation([{ allocationPct: 60 }, { allocationPct: 40 }], target);
    expect(result.allocatedPct).toBe(100);
    expect(result.remainingPct).toBe(0);
    expect(result.remainingAmount).toBe(0);
  });

  it("counts lines with no percentage separately rather than blending them in", () => {
    const result = sectionAllocation(
      [{ allocationPct: 38 }, { allocationPct: null }, { allocationPct: undefined }],
      target,
    );
    expect(result.allocatedPct).toBe(38);
    expect(result.withPct).toBe(1);
    expect(result.withoutPct).toBe(2);
  });

  it("distinguishes a section of un-percentaged lines from an empty one", () => {
    const none = sectionAllocation([{ allocationPct: null }, { allocationPct: null }], target);
    expect(none).toMatchObject({ allocatedPct: 0, withPct: 0, withoutPct: 2 });
    const empty = sectionAllocation([], target);
    expect(empty).toMatchObject({ allocatedPct: 0, withPct: 0, withoutPct: 0 });
  });

  it("still sums percentages with no category target, leaving every amount null", () => {
    const result = sectionAllocation([{ allocationPct: 38 }, { allocationPct: 30 }], null);
    expect(result.allocatedPct).toBe(68);
    expect(result.remainingPct).toBe(32);
    expect(result.allocatedAmount).toBeNull();
    expect(result.remainingAmount).toBeNull();
  });

  it("sums fractional percentages without float drift", () => {
    expect(sectionAllocation([{ allocationPct: 12.5 }, { allocationPct: 12.5 }], target).allocatedPct).toBe(25);
    expect(
      sectionAllocation([{ allocationPct: 0.1 }, { allocationPct: 0.2 }], target).allocatedPct,
    ).toBe(0.3);
  });

  it("sums each line's own rounded allocation, matching what the rows show", () => {
    // 33.33% of 3333c rounds to 1111 per line; three of them is 3333, not
    // round(3333 * 99.99%) = 3333 — they agree here, and the point is that
    // the figure is built from the same per-line numbers the rows print.
    const result = sectionAllocation(
      [{ allocationPct: 33.33 }, { allocationPct: 33.33 }, { allocationPct: 33.33 }],
      3333,
    );
    expect(result.allocatedAmount).toBe(1111 * 3);
    expect(result.allocatedPct).toBe(99.99);
  });
});

describe("zero is not a figure", () => {
  const seedCountsLocal = { adult: 10, child: 1, seat: 11 };
  const flat = { quantityBasis: "flat" as const, unitPrice: null, estimated: null, quoted: null, contracted: null };

  it("treats a stored 0 as unset", () => {
    expect(filled(0)).toBeNull();
    expect(filled(null)).toBeNull();
    expect(filled(undefined)).toBeNull();
    expect(filled(7700)).toBe(7700);
  });

  it("does not let a zero contracted mask a real quote", () => {
    // The reported bug: quoted $7,700, contracted typed as 0, current read $0.
    expect(
      computeCurrent({ ...flat, estimated: 770_000, quoted: 770_000, contracted: 0 }, seedCountsLocal),
    ).toBe(770_000);
  });

  it("does not let a zero quote mask a real estimate", () => {
    expect(computeCurrent({ ...flat, estimated: 500_000, quoted: 0 }, seedCountsLocal)).toBe(500_000);
  });

  it("falls through a zero estimate to the line's allocation", () => {
    const item = { ...flat, estimated: 0, allocatedAmount: 256_000 };
    expect(effectiveEstimated(item)).toBe(256_000);
    expect(estimateSource(item)).toBe("allocation");
    expect(computeCurrent(item, seedCountsLocal)).toBe(256_000);
  });

  it("still reports zero when every figure really is empty", () => {
    expect(computeCurrent({ ...flat, estimated: 0, quoted: 0, contracted: 0 }, seedCountsLocal)).toBe(0);
  });

  it("reports the line over its allocation once the quote is the current figure", () => {
    // The screenshot's line: allocated $4,900, quoted $7,700, contracted 0.
    const current = computeCurrent({ ...flat, quoted: 770_000, contracted: 0, allocatedAmount: 490_000 }, seedCountsLocal);
    expect(variance(current, 490_000)).toEqual({ amount: 280_000, pct: 57.14 });
  });
});
