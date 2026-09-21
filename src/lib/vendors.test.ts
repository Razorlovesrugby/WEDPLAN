import { describe, expect, it } from "vitest";
import {
  committedWithoutBudget,
  isVendorStage,
  matchesVendorFilter,
  readVendorFilter,
  sortVendors,
  stageIsCommitted,
  STAGE_LABEL,
  VENDOR_STAGES,
  type VendorLike,
} from "./vendors";

const vendor = (over: Partial<VendorLike> = {}): VendorLike => ({
  id: "v1",
  name: "Bloom & Co",
  stage: "researching",
  category_id: "c1",
  category_name: "Flowers",
  primary_contact_name: "Ada",
  archived_at: null,
  budget_line_count: 0,
  ...over,
});

describe("the stage list", () => {
  it("labels every stage it declares", () => {
    for (const stage of VENDOR_STAGES) {
      expect(STAGE_LABEL[stage]).toBeTruthy();
    }
    expect(Object.keys(STAGE_LABEL)).toHaveLength(VENDOR_STAGES.length);
  });

  it("recognises its own values and nothing else", () => {
    expect(isVendorStage("booked")).toBe(true);
    expect(isVendorStage("ghosted")).toBe(false);
  });

  it("treats booked, deposit paid and complete as committed", () => {
    expect(stageIsCommitted("booked")).toBe(true);
    expect(stageIsCommitted("deposit_paid")).toBe(true);
    expect(stageIsCommitted("complete")).toBe(true);
    expect(stageIsCommitted("shortlisted")).toBe(false);
    expect(stageIsCommitted("declined")).toBe(false);
  });
});

describe("readVendorFilter", () => {
  it("reads a filter off the URL", () => {
    expect(readVendorFilter({ stage: "booked", category: "c1", q: " bloom " })).toEqual({
      stage: "booked",
      category: "c1",
      q: "bloom",
      archived: false,
    });
  });

  it("drops an unknown stage rather than matching nothing", () => {
    // A stale bookmark should show the list, not an empty screen with no
    // explanation of why.
    expect(readVendorFilter({ stage: "ghosted" }).stage).toBeNull();
  });

  it("treats archived as a mode", () => {
    expect(readVendorFilter({ archived: "1" }).archived).toBe(true);
    expect(readVendorFilter({}).archived).toBe(false);
  });
});

describe("matchesVendorFilter", () => {
  it("hides archived vendors from the default list", () => {
    const archived = vendor({ archived_at: "2026-01-01T00:00:00Z" });
    expect(matchesVendorFilter(archived, { archived: false })).toBe(false);
    expect(matchesVendorFilter(vendor(), { archived: false })).toBe(true);
  });

  it("shows ONLY archived vendors in the archived list", () => {
    // Mixing them is how a vendor you archived last month turns up in a count
    // you trusted.
    const archived = vendor({ archived_at: "2026-01-01T00:00:00Z" });
    expect(matchesVendorFilter(archived, { archived: true })).toBe(true);
    expect(matchesVendorFilter(vendor(), { archived: true })).toBe(false);
  });

  it("filters by stage and category", () => {
    expect(matchesVendorFilter(vendor({ stage: "booked" }), { stage: "booked" })).toBe(true);
    expect(matchesVendorFilter(vendor({ stage: "booked" }), { stage: "declined" })).toBe(false);
    expect(matchesVendorFilter(vendor(), { category: "c1" })).toBe(true);
    expect(matchesVendorFilter(vendor(), { category: "c2" })).toBe(false);
  });

  it("searches the name, the category and the primary contact", () => {
    expect(matchesVendorFilter(vendor(), { q: "bloom" })).toBe(true);
    expect(matchesVendorFilter(vendor(), { q: "FLOWERS" })).toBe(true);
    expect(matchesVendorFilter(vendor(), { q: "ada" })).toBe(true);
    expect(matchesVendorFilter(vendor(), { q: "cake" })).toBe(false);
  });

  it("returns everything when nothing is set", () => {
    expect(matchesVendorFilter(vendor(), {})).toBe(true);
  });
});

describe("sortVendors", () => {
  it("groups by category, then stage order, then name", () => {
    const sorted = sortVendors([
      vendor({ id: "c", name: "Zed Cakes", category_name: "Cake", stage: "researching" }),
      vendor({ id: "b", name: "Bloom", category_name: "Flowers", stage: "booked" }),
      vendor({ id: "a", name: "Aster", category_name: "Flowers", stage: "researching" }),
    ]);
    expect(sorted.map((v) => v.id)).toEqual(["c", "a", "b"]);
  });

  it("puts uncategorised vendors last", () => {
    const sorted = sortVendors([
      vendor({ id: "none", category_name: null }),
      vendor({ id: "flowers", category_name: "Flowers" }),
    ]);
    expect(sorted.map((v) => v.id)).toEqual(["flowers", "none"]);
  });

  it("sorts declined below every live stage", () => {
    const sorted = sortVendors([
      vendor({ id: "declined", stage: "declined" }),
      vendor({ id: "complete", stage: "complete" }),
    ]);
    // Declined is not a step on the way to booking somebody; it is where a
    // record goes to stop being a live option.
    expect(sorted.map((v) => v.id)).toEqual(["complete", "declined"]);
  });

  it("does not mutate its input", () => {
    const list = [vendor({ id: "b", name: "B" }), vendor({ id: "a", name: "A" })];
    sortVendors(list);
    expect(list.map((v) => v.id)).toEqual(["b", "a"]);
  });
});

describe("committedWithoutBudget", () => {
  it("finds vendors we have booked with no money set aside", () => {
    const found = committedWithoutBudget([
      vendor({ id: "booked-no-budget", stage: "booked", budget_line_count: 0 }),
      vendor({ id: "booked-budgeted", stage: "booked", budget_line_count: 2 }),
      vendor({ id: "researching", stage: "researching", budget_line_count: 0 }),
    ]);
    expect(found.map((v) => v.id)).toEqual(["booked-no-budget"]);
  });

  it("ignores archived vendors", () => {
    const found = committedWithoutBudget([
      vendor({ stage: "booked", budget_line_count: 0, archived_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(found).toEqual([]);
  });
});
