import { describe, expect, it } from "vitest";
import {
  FAQ_FEATURED_LIMIT,
  NO_COUNTS,
  faqItems,
  flag,
  groupByTag,
  hasContent,
  navItems,
  resolveSections,
  rows,
  splitFaq,
  text,
  type SiteContentRow,
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

describe("hasContent", () => {
  it("always renders the hero and the RSVP pointer", () => {
    // The hero carries the names; the RSVP pointer is why most guests opened
    // the site. Neither should need filling in first.
    expect(hasContent("hero", null)).toBe(true);
    expect(hasContent("rsvp", null)).toBe(true);
  });

  it("hides a schedule with an intro but no events", () => {
    // The case this whole function exists for: a heading over nothing.
    expect(hasContent("schedule", { intro: "Here's the weekend" }, NO_COUNTS)).toBe(false);
    expect(hasContent("schedule", null, { ...NO_COUNTS, events: 1 })).toBe(true);
  });

  it("shows the gallery for either images or a published board", () => {
    expect(hasContent("gallery", null, NO_COUNTS)).toBe(false);
    expect(hasContent("gallery", null, { ...NO_COUNTS, boards: 1 })).toBe(true);
    expect(hasContent("gallery", null, { ...NO_COUNTS, galleryImages: 3 })).toBe(true);
  });

  it("hides an empty FAQ and shows one with a question", () => {
    expect(hasContent("faq", { items: [] })).toBe(false);
    expect(hasContent("faq", { items: [{ a: "no question" }] })).toBe(false);
    expect(hasContent("faq", { items: [{ q: "Parking?" }] })).toBe(true);
  });

  it("only shows the countdown when it is switched on", () => {
    expect(hasContent("countdown", null)).toBe(false);
    expect(hasContent("countdown", { enabled: true })).toBe(true);
  });

  it("accepts the legacy travel payload", () => {
    // /w shipped with travel.body before this spec; a site already carrying
    // one must not lose its section on upgrade.
    expect(hasContent("travel", { body: "Take the M5." })).toBe(true);
  });

  it("shows travel and stays on their rows alone", () => {
    // After 0017 the content lives in its own tables, so a coach run with no
    // intro written is still a travel section worth rendering.
    expect(hasContent("travel", null, { ...NO_COUNTS, travelOptions: 1 })).toBe(true);
    expect(hasContent("stays", null, { ...NO_COUNTS, stays: 2 })).toBe(true);
    expect(hasContent("travel", null, NO_COUNTS)).toBe(false);
    expect(hasContent("stays", null, NO_COUNTS)).toBe(false);
  });
});

describe("resolveSections", () => {
  const row = (key: string, payload: unknown, sort = 0, visible = true): SiteContentRow => ({
    block_key: key,
    payload,
    sort_order: sort,
    visible,
  });

  it("drops sections with nothing in them", () => {
    const sections = resolveSections([row("story", { body: "   " }), row("faq", { items: [] })]);
    expect(sections.map((s) => s.key)).toEqual(["hero", "rsvp"]);
  });

  it("honours visible = false", () => {
    const sections = resolveSections([row("story", { body: "We met in 2019." }, 0, false)]);
    expect(sections.map((s) => s.key)).not.toContain("story");
  });

  it("ignores a block_key that is not a section", () => {
    // `theme` is configuration, and an unknown key is from a newer editor.
    const sections = resolveSections([row("theme", { preset: "script" }), row("nonsense", { a: 1 })]);
    expect(sections.map((s) => s.key)).toEqual(["hero", "rsvp"]);
  });

  it("orders by the row's sort_order", () => {
    const sections = resolveSections([
      row("faq", { items: [{ q: "Parking?" }] }, 1),
      row("story", { body: "We met in 2019." }, 2),
    ]);
    expect(sections.map((s) => s.key)).toEqual(["hero", "faq", "story", "rsvp"]);
  });

  it("falls back to the designed order for rows nobody has saved", () => {
    // A half-configured site still reads top to bottom.
    const sections = resolveSections([row("story", { body: "x" }, 20)], { ...NO_COUNTS, events: 2 });
    expect(sections.map((s) => s.key)).toEqual(["hero", "story", "schedule", "rsvp"]);
  });
});

describe("navItems", () => {
  it("lists only what rendered, and only what is a destination", () => {
    const sections = resolveSections(
      [
        { block_key: "story", payload: { body: "We met in 2019." }, sort_order: 20 },
        { block_key: "footer", payload: { note: "See you there" }, sort_order: 110 },
      ],
      { ...NO_COUNTS, events: 1 },
    );
    expect(navItems(sections)).toEqual([
      { href: "#story", label: "Our story" },
      { href: "#schedule", label: "The weekend" },
      { href: "#rsvp", label: "RSVP" },
    ]);
  });

  it("is empty of a section that was dropped for being empty", () => {
    const sections = resolveSections([{ block_key: "faq", payload: { items: [] }, sort_order: 90 }]);
    expect(navItems(sections).map((n) => n.label)).not.toContain("Questions");
  });
});
