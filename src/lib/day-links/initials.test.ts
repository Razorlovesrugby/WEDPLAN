import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("takes the two names", () => {
    expect(initialsOf("Aroha & Sam")).toBe("A&S");
    expect(initialsOf("Alex and Sam")).toBe("A&S");
    expect(initialsOf("Alex & Sam's wedding")).toBe("A&S");
  });
  it("falls back to the first letters of a single name", () => {
    expect(initialsOf("Okonkwo")).toBe("OK");
    expect(initialsOf("")).toBe("WP");
  });
});
