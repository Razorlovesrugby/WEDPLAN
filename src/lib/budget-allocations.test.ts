import { describe, expect, it } from "vitest";
import { SUGGESTED_ALLOCATIONS, SUGGESTED_TOTAL_PCT, suggestAllocations, suggestionFor } from "./budget-allocations";

describe("SUGGESTED_ALLOCATIONS", () => {
  it("is a legal set of percentages", () => {
    for (const s of SUGGESTED_ALLOCATIONS) {
      expect(s.pct).toBeGreaterThan(0);
      expect(s.pct).toBeLessThanOrEqual(100);
    }
  });

  it("does not exceed the whole budget", () => {
    expect(SUGGESTED_TOTAL_PCT).toBeLessThanOrEqual(100);
  });
});

describe("suggestionFor", () => {
  it("matches a category by its exact name", () => {
    expect(suggestionFor("Catering")?.pct).toBe(20);
  });

  it("ignores case, spacing and punctuation", () => {
    expect(suggestionFor("  venue & hire ")?.pct).toBe(20);
    expect(suggestionFor("PHOTOGRAPHY & VIDEO")?.pct).toBe(12);
  });

  it("matches a category named something close enough", () => {
    expect(suggestionFor("Flowers")?.name).toBe("Flowers & styling");
    expect(suggestionFor("The bar")?.name).toBe("Drinks");
    expect(suggestionFor("Photographer")?.name).toBe("Photography & video");
  });

  it("returns null rather than guessing at something it doesn't recognise", () => {
    expect(suggestionFor("Fireworks")).toBeNull();
    expect(suggestionFor("")).toBeNull();
  });
});

describe("suggestAllocations", () => {
  it("fills only the categories that have no percentage yet", () => {
    const result = suggestAllocations([
      { id: "1", name: "Venue", allocation_pct: null },
      { id: "2", name: "Catering", allocation_pct: 25 },
      { id: "3", name: "Drinks", allocation_pct: null },
    ]);
    expect(result).toEqual([
      { id: "1", name: "Venue", pct: 20 },
      { id: "3", name: "Drinks", pct: 10 },
    ]);
  });

  it("leaves an unrecognised category alone", () => {
    expect(suggestAllocations([{ id: "1", name: "Fireworks", allocation_pct: null }])).toEqual([]);
  });

  it("suggests nothing when every category is already allocated", () => {
    expect(
      suggestAllocations([
        { id: "1", name: "Venue", allocation_pct: 20 },
        { id: "2", name: "Catering", allocation_pct: 20 },
      ]),
    ).toEqual([]);
  });

  it("treats a zero percentage as set, not as missing", () => {
    expect(suggestAllocations([{ id: "1", name: "Venue", allocation_pct: 0 }])).toEqual([]);
  });
});
