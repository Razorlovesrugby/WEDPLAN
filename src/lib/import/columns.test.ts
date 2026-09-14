import { describe, expect, it } from "vitest";
import { detectMapping, parseAgeBand, parseSide, splitName } from "./columns";

describe("detectMapping", () => {
  it("matches the obvious headers", () => {
    expect(detectMapping(["First name", "Last name", "Email"])).toEqual([
      "first_name",
      "last_name",
      "email",
    ]);
  });

  it("ignores case, spacing and punctuation", () => {
    expect(detectMapping(["  E-Mail Address ", "MOBILE"])).toEqual(["email", "phone"]);
  });

  it("leaves unrecognised headers unmapped", () => {
    expect(detectMapping(["First name", "Table number", "Gift"])).toEqual([
      "first_name",
      null,
      null,
    ]);
  });

  it("does not let a substring win", () => {
    // "nickname" contains "name"; matching loosely would map it to first_name
    // and put everyone's nickname in as their legal name.
    expect(detectMapping(["nickname"])).toEqual(["preferred_name"]);
  });

  it("claims each field at most once", () => {
    // Two email columns: the second is left for the user rather than silently
    // overwriting the first.
    expect(detectMapping(["Email", "Email address"])).toEqual(["email", null]);
  });

  it("sends a single name column to first name, where splitName can act on it", () => {
    expect(detectMapping(["Full name"])).toEqual(["first_name"]);
  });
});

describe("splitName", () => {
  it("splits a first and last name", () => {
    expect(splitName("Ama Boateng")).toEqual({ first: "Ama", last: "Boateng" });
  });

  it("keeps everything after the first token together", () => {
    expect(splitName("Anna Maria del Toro")).toEqual({
      first: "Anna",
      last: "Maria del Toro",
    });
  });

  it("leaves a single name without a surname rather than inventing one", () => {
    expect(splitName("Prince")).toEqual({ first: "Prince", last: null });
  });

  it("collapses stray whitespace", () => {
    expect(splitName("  Kofi   Mensah  ")).toEqual({ first: "Kofi", last: "Mensah" });
  });

  it("survives an empty cell", () => {
    expect(splitName("   ")).toEqual({ first: "", last: null });
  });
});

describe("parseAgeBand", () => {
  it("reads the words people actually type", () => {
    expect(parseAgeBand("Child")).toBe("child");
    expect(parseAgeBand("kid")).toBe("child");
    expect(parseAgeBand("infant")).toBe("infant");
    expect(parseAgeBand("Baby")).toBe("infant");
  });

  it("reads a numeric age, because half the files with an Age column hold one", () => {
    expect(parseAgeBand("0")).toBe("infant");
    expect(parseAgeBand("1")).toBe("infant");
    expect(parseAgeBand("2")).toBe("child");
    expect(parseAgeBand("17")).toBe("child");
    expect(parseAgeBand("18")).toBe("adult");
    expect(parseAgeBand("64")).toBe("adult");
  });

  it("defaults to adult, which over-caters rather than under-seats", () => {
    expect(parseAgeBand("")).toBe("adult");
    expect(parseAgeBand("grown up")).toBe("adult");
    expect(parseAgeBand("???")).toBe("adult");
  });
});

describe("parseSide", () => {
  it("reads the common spellings", () => {
    expect(parseSide("bride")).toBe("partner_a");
    expect(parseSide("Groom")).toBe("partner_b");
    expect(parseSide("both")).toBe("both");
    expect(parseSide("work")).toBe("other");
  });

  it("reads spellings with punctuation", () => {
    expect(parseSide("Bride's side")).toBe("partner_a");
    expect(parseSide("Partner A")).toBe("partner_a");
  });

  it("returns null for anything unrecognised rather than guessing", () => {
    // A prefix rule reads this as "a" and labels it the bride's side.
    expect(parseSide("Aunt Margaret's lot")).toBeNull();
    expect(parseSide("Barry's rugby club")).toBeNull();
    expect(parseSide("")).toBeNull();
  });
});
