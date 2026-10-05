import { describe, expect, it } from "vitest";
import {
  faqItems,
  flag,
  rows,
  text,
} from "./sections";

describe("text", () => {
  it("trims and returns a string", () => {
    expect(text({ intro: "  hello  " }, "intro")).toBe("hello");
  });

  it("treats whitespace-only as nothing, not as content", () => {
    // Otherwise a section someone cleared by selecting-all and hitting space
    // renders its heading over an empty paragraph.
    expect(text({ intro: "   " }, "intro")).toBeNull();
    expect(text({ intro: "" }, "intro")).toBeNull();
  });

  it("is null for the wrong type or a missing key", () => {
    expect(text({ intro: 42 }, "intro")).toBeNull();
    expect(text({}, "intro")).toBeNull();
    expect(text(null, "intro")).toBeNull();
    expect(text("not an object", "intro")).toBeNull();
    expect(text([], "intro")).toBeNull();
  });
});

describe("flag", () => {
  it("reads booleans and falls back for anything else", () => {
    expect(flag({ enabled: true }, "enabled")).toBe(true);
    expect(flag({ enabled: "true" }, "enabled")).toBe(false);
    expect(flag({}, "enabled", true)).toBe(true);
    expect(flag(null, "enabled", true)).toBe(true);
  });
});

describe("rows", () => {
  it("keeps only object entries", () => {
    expect(rows({ items: [{ a: 1 }, "no", null, 5, { b: 2 }] }, "items")).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it("is empty for a non-array", () => {
    expect(rows({ items: { a: 1 } }, "items")).toEqual([]);
    expect(rows(null, "items")).toEqual([]);
  });
});

describe("faqItems", () => {
  it("reads questions, answers, tags and the featured flag", () => {
    expect(
      faqItems({ items: [{ q: "Dress code?", a: "Lounge suits.", featured: true, tags: ["The day"] }] }),
    ).toEqual([{ q: "Dress code?", a: "Lounge suits.", featured: true, tags: ["The day"] }]);
  });

  it("drops an item with no question", () => {
    // An answer with nothing to answer renders as a floating paragraph.
    expect(faqItems({ items: [{ a: "Lounge suits." }, { q: "  ", a: "x" }] })).toEqual([]);
  });

  it("tolerates a missing answer", () => {
    // Half-written is a normal state for a FAQ being filled in.
    expect(faqItems({ items: [{ q: "Parking?" }] })).toEqual([
      { q: "Parking?", a: "", featured: false, tags: [] },
    ]);
  });

  it("drops non-string and blank tags", () => {
    expect(faqItems({ items: [{ q: "x", tags: ["Travel", 3, "", null] }] })[0]?.tags).toEqual([
      "Travel",
    ]);
  });
});

