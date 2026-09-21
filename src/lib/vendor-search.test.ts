import { describe, expect, it } from "vitest";
import { findExactVendor, searchVendors } from "./vendor-search";
import type { VendorLike } from "./vendors";

const vendor = (over: Partial<VendorLike> = {}): VendorLike => ({
  id: "v1",
  name: "The Old Barn",
  stage: "booked",
  category_id: "c1",
  category_name: "Venue",
  primary_contact_name: "Ada Okonkwo",
  ...over,
});

describe("searchVendors", () => {
  const list = [
    vendor(),
    vendor({ id: "v2", name: "Bloom & Co", category_name: "Flowers", primary_contact_name: "Jo" }),
  ];

  it("matches the name", () => {
    expect(searchVendors(list, "barn").map((v) => v.id)).toEqual(["v1"]);
  });

  it("matches the category — people ask 'who was the florist'", () => {
    expect(searchVendors(list, "flowers").map((v) => v.id)).toEqual(["v2"]);
  });

  it("matches the primary contact", () => {
    expect(searchVendors(list, "okonkwo").map((v) => v.id)).toEqual(["v1"]);
  });

  it("ignores case and surrounding space", () => {
    expect(searchVendors(list, "  BLOOM ").map((v) => v.id)).toEqual(["v2"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchVendors(list, "   ")).toHaveLength(2);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchVendors(list, "photographer")).toEqual([]);
  });
});

describe("findExactVendor", () => {
  const list = [vendor(), vendor({ id: "v2", name: "Old Barn" })];

  it("matches only an exact name, ignoring case and space", () => {
    expect(findExactVendor(list, "  the old barn ")?.id).toBe("v1");
  });

  it("does NOT match a near-miss", () => {
    // Deliberate: this app owns a trigram matcher and does not use it here.
    // "The Old Barn" and "Old Barn" are as likely to be two suppliers as one,
    // and a budget line's vendor name was typed by the planner in this app
    // rather than imported from a relative's spreadsheet.
    expect(findExactVendor(list, "The Olde Barn")).toBeNull();
    expect(findExactVendor([vendor()], "Old Barn")).toBeNull();
  });

  it("is null for an empty name", () => {
    expect(findExactVendor(list, "  ")).toBeNull();
  });
});
