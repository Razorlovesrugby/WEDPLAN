import { describe, expect, it } from "vitest";
import {
  FAQ_FEATURED_LIMIT,
  faqItems,
  flag,
  groupByTag,
  rows,
  splitFaq,
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

describe("splitFaq", () => {
  const make = (n: number, featuredAt: number[] = []) =>
    Array.from({ length: n }, (_, i) => ({
      q: `Q${i}`,
      a: "",
      featured: featuredAt.includes(i),
      tags: [],
    }));

  it("collapses nothing when there are few enough questions", () => {
    // Collapsing three questions is pure friction.
    const { featured, rest } = splitFaq(make(FAQ_FEATURED_LIMIT));
    expect(featured).toHaveLength(FAQ_FEATURED_LIMIT);
    expect(rest).toEqual([]);
  });

  it("shows the first six when nobody has chosen", () => {
    const { featured, rest } = splitFaq(make(10));
    expect(featured.map((f) => f.q)).toEqual(["Q0", "Q1", "Q2", "Q3", "Q4", "Q5"]);
    expect(rest).toHaveLength(4);
  });

  it("honours an explicit choice over document order", () => {
    const { featured, rest } = splitFaq(make(10, [7, 9]));
    expect(featured.map((f) => f.q)).toEqual(["Q7", "Q9"]);
    expect(rest).toHaveLength(8);
    expect(rest.map((r) => r.q)).not.toContain("Q7");
  });

  it("caps an over-enthusiastic explicit choice at the limit", () => {
    const { featured, rest } = splitFaq(make(12, [0, 1, 2, 3, 4, 5, 6, 7]));
    expect(featured).toHaveLength(FAQ_FEATURED_LIMIT);
    // The two that did not make the cut are still reachable, not lost.
    expect(rest).toHaveLength(12 - FAQ_FEATURED_LIMIT);
  });
});

describe("groupByTag", () => {
  it("groups by first tag, preserving first-seen order", () => {
    const items = [
      { q: "a", a: "", featured: false, tags: ["Travel"] },
      { q: "b", a: "", featured: false, tags: ["Gifts"] },
      { q: "c", a: "", featured: false, tags: ["Travel"] },
    ];
    expect(groupByTag(items).map((g) => g.tag)).toEqual(["Travel", "Gifts"]);
    expect(groupByTag(items)[0]?.items.map((i) => i.q)).toEqual(["a", "c"]);
  });

  it("puts untagged items in their own null group", () => {
    const groups = groupByTag([{ q: "a", a: "", featured: false, tags: [] }]);
    expect(groups).toEqual([{ tag: null, items: [{ q: "a", a: "", featured: false, tags: [] }] }]);
  });
});



