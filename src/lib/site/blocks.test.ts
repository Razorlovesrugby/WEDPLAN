import { describe, expect, it } from "vitest";
import {
  BLOCKS,
  blockNavItems,
  BLOCK_TYPES,
  STARTER_LAYOUTS,
  isBlockType,
  pageNotes,
  palletableBlocks,
  sectionNumbers,
  typesAtLimit,
  visibleBlocks,
  type SiteBlock,
} from "./blocks";

const block = (over: Partial<SiteBlock> = {}): SiteBlock => ({
  id: crypto.randomUUID(),
  type: "prose",
  payload: {},
  style: {},
  visible: true,
  audience: "everyone",
  ...over,
});

describe("the catalogue", () => {
  it("defines every type it lists, and lists every type it defines", () => {
    for (const type of BLOCK_TYPES) expect(BLOCKS[type]?.type).toBe(type);
    expect(Object.keys(BLOCKS).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("only offers style controls that exist", () => {
    const known = new Set(["width", "background", "align", "shape", "embed"]);
    for (const def of Object.values(BLOCKS)) {
      for (const style of def.styles) expect(known.has(style), `${def.type}: ${style}`).toBe(true);
    }
  });

  it("offers the embed switch only where there is a third party to load", () => {
    // Q1: an embed is opt-in per block. Anything else offering the switch
    // would be offering a switch that does nothing.
    const withEmbed = Object.values(BLOCKS).filter((def) => def.styles.includes("embed"));
    expect(withEmbed.map((def) => def.type).sort()).toEqual(["map", "playlist"]);
  });

  it("recognises its own types and nothing else", () => {
    expect(isBlockType("hero")).toBe(true);
    expect(isBlockType("nonsense")).toBe(false);
    expect(isBlockType("")).toBe(false);
  });

  it("starts every starter layout from real blocks", () => {
    for (const layout of STARTER_LAYOUTS) {
      expect(layout.types.length).toBeGreaterThan(3);
      for (const type of layout.types) expect(isBlockType(type)).toBe(true);
    }
  });

  it("never puts two of a once-only block in a starter layout", () => {
    for (const layout of STARTER_LAYOUTS) {
      const counts = new Map<string, number>();
      for (const type of layout.types) counts.set(type, (counts.get(type) ?? 0) + 1);
      for (const [type, count] of counts) {
        const max = BLOCKS[type as keyof typeof BLOCKS].max;
        if (max !== undefined) expect(count, `${layout.id}: ${type}`).toBeLessThanOrEqual(max);
      }
    }
  });
});

describe("visibleBlocks", () => {
  it("drops hidden blocks for everybody", () => {
    const blocks = [block({ visible: false }), block()];
    expect(visibleBlocks(blocks, true)).toHaveLength(1);
    expect(visibleBlocks(blocks, false)).toHaveLength(1);
  });

  it("keeps an invited-only block off the shared site", () => {
    const blocks = [block({ audience: "invited" })];
    expect(visibleBlocks(blocks, false)).toHaveLength(0);
    expect(visibleBlocks(blocks, true)).toHaveLength(1);
  });

  it("keeps a public-only block off a household's own page", () => {
    // "Find my invitation" is noise to somebody already holding their link.
    const blocks = [block({ audience: "public_only" })];
    expect(visibleBlocks(blocks, true)).toHaveLength(0);
    expect(visibleBlocks(blocks, false)).toHaveLength(1);
  });

  it("keeps the order it was given", () => {
    const a = block({ type: "hero" });
    const b = block({ type: "schedule" });
    const c = block({ type: "footer" });
    expect(visibleBlocks([a, b, c], false).map((x) => x.type)).toEqual([
      "hero",
      "schedule",
      "footer",
    ]);
  });
});

describe("typesAtLimit", () => {
  it("is empty for a page with room", () => {
    expect(typesAtLimit([block({ type: "photo_band" })]).size).toBe(0);
  });

  it("names a once-only type that is already used", () => {
    expect(typesAtLimit([block({ type: "hero" })]).has("hero")).toBe(true);
  });

  it("never limits a type that has no limit", () => {
    const bands = [1, 2, 3, 4].map(() => block({ type: "photo_band" }));
    expect(typesAtLimit(bands).has("photo_band")).toBe(false);
  });

  it("counts hidden blocks too — the row still exists", () => {
    expect(typesAtLimit([block({ type: "hero", visible: false })]).has("hero")).toBe(true);
  });
});

describe("pageNotes", () => {
  it("says nothing about an empty page", () => {
    // Nothing to advise on yet; the starter layouts handle that case.
    expect(pageNotes([])).toEqual([]);
  });

  it("notices a thin page", () => {
    const notes = pageNotes([block({ type: "hero" }), block({ type: "rsvp" })]);
    expect(notes.some((note) => note.tone === "thin")).toBe(true);
  });

  it("notices a missing schedule", () => {
    const blocks = [
      block({ type: "hero" }),
      block({ type: "story" }),
      block({ type: "gallery" }),
      block({ type: "rsvp" }),
      block({ type: "footer" }),
    ];
    expect(pageNotes(blocks).some((note) => note.text.includes("schedule"))).toBe(true);
  });

  it("notices three photo blocks in a row", () => {
    const blocks = [
      block({ type: "hero" }),
      block({ type: "photo_band" }),
      block({ type: "gallery" }),
      block({ type: "photo_text" }),
      block({ type: "schedule" }),
      block({ type: "rsvp" }),
    ];
    expect(pageNotes(blocks).some((note) => note.tone === "bloated")).toBe(true);
  });

  it("ignores hidden blocks when judging the page", () => {
    const blocks = [
      block({ type: "hero" }),
      block({ type: "photo_band", visible: false }),
      block({ type: "gallery", visible: false }),
      block({ type: "photo_text", visible: false }),
      block({ type: "schedule" }),
      block({ type: "rsvp" }),
      block({ type: "footer" }),
    ];
    expect(pageNotes(blocks).some((note) => note.tone === "bloated")).toBe(false);
  });

  it("says nothing at all about a sensible page", () => {
    const blocks = [
      block({ type: "hero" }),
      block({ type: "countdown" }),
      block({ type: "story" }),
      block({ type: "schedule" }),
      block({ type: "travel" }),
      block({ type: "faq" }),
      block({ type: "rsvp" }),
      block({ type: "footer" }),
    ];
    expect(pageNotes(blocks)).toEqual([]);
  });
});

describe("blockNavItems", () => {
  it("lists the destinations and skips the decoration", () => {
    const blocks = [
      block({ type: "hero" }),
      block({ type: "photo_band" }),
      block({ type: "schedule" }),
      block({ type: "faq" }),
      block({ type: "footer" }),
    ];
    expect(blockNavItems(blocks)).toEqual([
      { href: "#schedule", label: "The weekend" },
      { href: "#faq", label: "Questions" },
    ]);
  });

  it("lists a repeated type once — that is where the anchor lands", () => {
    const blocks = [block({ type: "gallery" }), block({ type: "gallery" })];
    expect(blockNavItems(blocks)).toHaveLength(1);
  });
});

describe("sectionNumbers — the eyebrow above each section", () => {
  it("numbers the destinations and skips the punctuation", () => {
    const marks = sectionNumbers([
      block({ id: "a", type: "hero" }),
      block({ id: "b", type: "schedule" }),
      block({ id: "c", type: "photo_band" }),
      block({ id: "d", type: "rsvp" }),
    ]);
    // A hero is not somewhere you arrive, and a photo band is rhythm.
    expect([...marks.keys()]).toEqual(["b", "d"]);
    expect(marks.get("b")).toEqual({ number: "01", label: "The weekend" });
    expect(marks.get("d")).toEqual({ number: "02", label: "Your reply" });
  });

  it("closes the gap when a block is removed from the list", () => {
    // Numbers are computed, never stored (spec 25 Answered, question 6): a
    // guest counting 01, 02, 04 wonders what they missed.
    const marks = sectionNumbers([
      block({ id: "b", type: "schedule" }),
      block({ id: "d", type: "rsvp" }),
      block({ id: "e", type: "faq" }),
    ]);
    expect(marks.get("e")?.number).toBe("03");

    const fewer = sectionNumbers([block({ id: "b", type: "schedule" }), block({ id: "e", type: "faq" })]);
    expect(fewer.get("e")?.number).toBe("02");
  });

  it("pads to two digits", () => {
    expect(sectionNumbers([block({ id: "b", type: "schedule" })]).get("b")?.number).toBe("01");
  });

  it("numbers two blocks of the same type separately", () => {
    const marks = sectionNumbers([
      block({ id: "a", type: "prose" }),
      block({ id: "b", type: "schedule" }),
    ]);
    // prose has no eyebrow — the planner writes its own heading.
    expect([...marks.keys()]).toEqual(["b"]);
  });

  it("is empty for a page of nothing but photographs", () => {
    expect(sectionNumbers([block({ type: "photo_band" }), block({ type: "photo_text" })]).size).toBe(0);
  });
});

describe("palletableBlocks", () => {
  it("hides the deprecated countdown but keeps it in the catalogue", () => {
    // Removing the type would blank the countdown on every revision already
    // published — toBlock() drops what it does not recognise.
    expect(palletableBlocks().some((def) => def.type === "countdown")).toBe(false);
    expect(BLOCKS.countdown).toBeDefined();
    expect(BLOCK_TYPES).toContain("countdown");
  });

  it("offers the guestbook", () => {
    expect(palletableBlocks().some((def) => def.type === "guestbook")).toBe(true);
  });
});

describe("the page break band", () => {
  it("is punctuation, so it is never numbered and never in the nav", () => {
    // Two bands and two destinations: the page still reads 01, 02.
    const marks = sectionNumbers([
      block({ id: "a", type: "schedule" }),
      block({ id: "b", type: "page_break" }),
      block({ id: "c", type: "rsvp" }),
      block({ id: "d", type: "page_break" }),
    ]);
    expect([...marks.keys()]).toEqual(["a", "c"]);
    expect(marks.get("c")?.number).toBe("02");

    expect(
      blockNavItems([block({ type: "page_break" }), block({ type: "rsvp" })]).map((i) => i.label),
    ).toEqual(["Will you be there?"]);
  });

  it("is repeatable — a long page wants more than one", () => {
    const blocks = [block({ type: "page_break" }), block({ type: "page_break" })];
    expect(typesAtLimit(blocks).has("page_break")).toBe(false);
    expect(BLOCKS.page_break.max).toBeUndefined();
  });

  it("is offered in the palette", () => {
    expect(palletableBlocks().map((def) => def.type)).toContain("page_break");
  });
});
