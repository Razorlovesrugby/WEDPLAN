import { describe, expect, it } from "vitest";
import { monogramFromName } from "./names";

describe("monogramFromName", () => {
  it("splits on the usual joiners", () => {
    for (const name of ["Alex & Sam", "Alex and Sam", "Alex + Sam", "Alex&Sam"]) {
      expect(monogramFromName(name), name).toEqual({ left: "A", right: "S" });
    }
  });

  it("strips the words people put around a name", () => {
    expect(monogramFromName("The Alex & Sam Wedding")).toEqual({ left: "A", right: "S" });
    expect(monogramFromName("Alex and Sam's wedding")).toEqual({ left: "A", right: "S" });
    expect(monogramFromName("Our wedding — Alex & Sam")).toEqual({ left: "A", right: "S" });
  });

  it("takes the first letter of any alphabet", () => {
    // [A-Z] would drop these to the fallback, which is a worse outcome than a
    // monogram that is simply in the couple's own script.
    expect(monogramFromName("Åsa & Øyvind")).toEqual({ left: "Å", right: "Ø" });
    expect(monogramFromName("Ада & Борис")).toEqual({ left: "А", right: "Б" });
  });

  it("uses surnames when that is how the name was written", () => {
    expect(monogramFromName("Okonkwo & Baptiste")).toEqual({ left: "O", right: "B" });
  });

  it("returns null rather than half a monogram", () => {
    // A lone "A" is worse than the theme's ampersand fallback.
    for (const name of ["Alex", "The Wedding", "", "   ", null, undefined, "!!! & ???"]) {
      expect(monogramFromName(name), String(name)).toBeNull();
    }
  });

  it("ignores anything past the second name", () => {
    expect(monogramFromName("Alex & Sam & Jo")).toEqual({ left: "A", right: "S" });
  });
});
