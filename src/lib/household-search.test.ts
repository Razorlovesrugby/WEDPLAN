import { describe, expect, it } from "vitest";
import { searchHouseholds } from "./household-search";

const households = [
  { id: "1", display_name: "The Okonkwo family", address: "12 Rugby Lane" },
  { id: "2", display_name: "Sam & Priya", address: null },
  { id: "3", display_name: "Aunt Margaret's lot", address: "4 Church Street" },
];

describe("searchHouseholds", () => {
  it("returns everything for a blank query", () => {
    expect(searchHouseholds(households, "")).toHaveLength(3);
    expect(searchHouseholds(households, "   ")).toHaveLength(3);
  });

  it("matches the display name, case-insensitively", () => {
    expect(searchHouseholds(households, "okonkwo").map((h) => h.id)).toEqual(["1"]);
    expect(searchHouseholds(households, "SAM")).toHaveLength(1);
  });

  it("matches the address", () => {
    expect(searchHouseholds(households, "church street").map((h) => h.id)).toEqual(["3"]);
  });

  it("does not throw on a household with no address", () => {
    expect(searchHouseholds(households, "priya")).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchHouseholds(households, "nobody here")).toHaveLength(0);
  });
});
