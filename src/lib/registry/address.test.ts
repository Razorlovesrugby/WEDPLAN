import { describe, expect, it } from "vitest";
import { addressForCopy, addressLines, hasAddress } from "./address";

describe("addressLines", () => {
  it("builds the lines a courier needs and drops blanks", () => {
    expect(
      addressLines({ recipient_name: "Ray & Olivia", line1: "1 Test St", line2: "", city: "Wellington", postcode: "6011", country: "New Zealand" }),
    ).toEqual(["Ray & Olivia", "1 Test St", "Wellington 6011", "New Zealand"]);
  });
  it("is empty for nothing, or for a country alone", () => {
    expect(addressLines(null)).toEqual([]);
    expect(addressLines({ country: "New Zealand" })).toEqual([]);
    expect(hasAddress({ country: "New Zealand" })).toBe(false);
  });
  it("copies as plain lines", () => {
    expect(addressForCopy({ line1: "1 Test St", city: "Wellington", country: "New Zealand" })).toBe("1 Test St\nWellington\nNew Zealand");
  });
});
