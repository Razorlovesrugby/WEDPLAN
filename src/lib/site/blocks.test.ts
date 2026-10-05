import { describe, expect, it } from "vitest";
import {
  BLOCKS,
  BLOCK_TYPES,
  STARTER_LAYOUTS,
  blockAnchor,
  blockHeading,
  blockLabel,
  chapterName,
  customHeading,
  defaultHeading,
  isBlockType,
  isTitled,
  isFoldedIntoSchedule,
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
    const known = new Set(["width", "background", "align", "shape", "embed", "lightbox", "variant", "enter"]);
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
  it("drops hidden blocks", () => {
    const blocks = [block({ visible: false }), block()];
    expect(visibleBlocks(blocks)).toHaveLength(1);
  });

  it("no longer reads a block's stored audience (spec 28 §7a.4)", () => {
    // There is no shared page, so every reader is invited. An old value must
    // neither hide a block from a guest nor be rewritten.
    const blocks = [
      block({ audience: "everyone" }),
      block({ audience: "invited" }),
      block({ audience: "public_only" }),
    ];
    expect(visibleBlocks(blocks)).toHaveLength(3);
  });

  it("keeps the order it was given", () => {
    const a = block({ type: "hero" });
    const b = block({ type: "schedule" });
    const c = block({ type: "footer" });
    expect(visibleBlocks([a, b, c]).map((x) => x.type)).toEqual([
      "hero",
      "schedule",
      "footer",
    ]);
  });
});

describe("On the day, folded into The weekend (spec 28 §5.3)", () => {
  it("is dropped from a page that has The weekend, so the notes print once", () => {
    const blocks = [block({ type: "schedule" }), block({ type: "on_the_day" }), block({ type: "faq" })];
    expect(visibleBlocks(blocks).map((b) => b.type)).toEqual(["schedule", "faq"]);
  });

  it("still renders on a page with no weekend section", () => {
    // A published revision can hold one; dropping it would lose the notes.
    const blocks = [block({ type: "hero" }), block({ type: "on_the_day" })];
    expect(visibleBlocks(blocks).map((b) => b.type)).toEqual(["hero", "on_the_day"]);
  });

  it("is not folded away by a weekend section that is itself hidden", () => {
    const blocks = [block({ type: "schedule", visible: false }), block({ type: "on_the_day" })];
    expect(visibleBlocks(blocks).map((b) => b.type)).toEqual(["on_the_day"]);
    expect(isFoldedIntoSchedule(blocks[1]!, blocks)).toBe(false);
  });

  it("leaves no gap in the section numbers", () => {
    const blocks = visibleBlocks([
      block({ type: "schedule" }),
      block({ type: "on_the_day" }),
      block({ type: "faq" }),
    ]);
    expect([...sectionNumbers(blocks).values()].map((mark) => mark.number)).toEqual(["01", "02"]);
  });

  it("tells the editor which row is folded", () => {
    const schedule = block({ type: "schedule" });
    const day = block({ type: "on_the_day" });
    expect(isFoldedIntoSchedule(day, [schedule, day])).toBe(true);
    expect(isFoldedIntoSchedule(schedule, [schedule, day])).toBe(false);
  });

  it("is deprecated, so the palette cannot add another and no starter layout does", () => {
    expect(BLOCKS.on_the_day.deprecated).toBe(true);
    expect(palletableBlocks().map((def) => def.type)).not.toContain("on_the_day");
    for (const layout of STARTER_LAYOUTS) expect(layout.types).not.toContain("on_the_day");
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
  it("is punctuation, so it is never numbered", () => {
    // Two bands and two destinations: the page still reads 01, 02.
    const marks = sectionNumbers([
      block({ id: "a", type: "schedule" }),
      block({ id: "b", type: "page_break" }),
      block({ id: "c", type: "rsvp" }),
      block({ id: "d", type: "page_break" }),
    ]);
    expect([...marks.keys()]).toEqual(["a", "c"]);
    expect(marks.get("c")?.number).toBe("02");
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

describe("titles and labels the planner can change (spec 28 §7.2)", () => {
  it("draws the block's own default until a title is written", () => {
    expect(blockHeading(block({ type: "faq" }))).toBe("Questions");
    expect(blockHeading(block({ type: "schedule" }))).toBe("You're invited to");
    expect(blockHeading(block({ type: "rsvp" }))).toBe("Will you be there?");
  });

  it("draws the planner's title in its place, and clearing it goes back", () => {
    expect(blockHeading(block({ type: "faq", payload: { heading: "Good to know" } }))).toBe("Good to know");
    expect(blockHeading(block({ type: "faq", payload: { heading: "   " } }))).toBe("Questions");
    expect(customHeading(block({ type: "faq", payload: { heading: "   " } }))).toBeNull();
  });

  it("draws nothing at all when the title is switched off", () => {
    const off = block({ type: "faq", payload: { heading: "Good to know", hide_heading: true } });
    expect(blockHeading(off)).toBe("");
  });

  it("has no heading by default on a block that was always untitled", () => {
    // Words and Photo and words are headed only when somebody writes one.
    expect(defaultHeading("prose")).toBe("");
    expect(blockHeading(block({ type: "prose" }))).toBe("");
    expect(blockHeading(block({ type: "prose", payload: { heading: "A note about the kids" } }))).toBe(
      "A note about the kids",
    );
  });

  it("never falls back to a block's NAME as its heading", () => {
    // A photo band used to print the words "Photo band" above the photograph.
    expect(isTitled("photo_band")).toBe(false);
    expect(blockHeading(block({ type: "photo_band", payload: { heading: "Ignored" } }))).toBe("");
    for (const type of BLOCK_TYPES) {
      if (!isTitled(type)) expect(blockHeading(block({ type })), type).toBe("");
    }
  });

  it("keeps the map and the playlist headings they always had", () => {
    expect(blockHeading(block({ type: "map" }))).toBe("Where");
    expect(blockHeading(block({ type: "playlist" }))).toBe("The playlist");
  });

  it("labels a section with the planner's words, else its category", () => {
    expect(blockLabel(block({ type: "faq" }))).toBe("Questions");
    expect(blockLabel(block({ type: "faq", payload: { eyebrow: "Good to know" } }))).toBe("Good to know");
    // Not a destination: a label cannot make punctuation a chapter.
    expect(blockLabel(block({ type: "photo_band", payload: { eyebrow: "Nope" } }))).toBeNull();
  });

  it("numbers by position whatever the labels say, so a rename leaves no gap", () => {
    const a = block({ id: "a", type: "story", payload: { eyebrow: "How it began" } });
    const b = block({ id: "b", type: "faq" });
    const marks = sectionNumbers([a, b]);
    expect(marks.get("a")).toEqual({ number: "01", label: "How it began" });
    expect(marks.get("b")).toEqual({ number: "02", label: "Questions" });
  });

  it("does not number a section whose title is switched off, so there is no gap", () => {
    const a = block({ id: "a", type: "story" });
    const quiet = block({ id: "b", type: "dress_code", payload: { hide_heading: true } });
    const c = block({ id: "c", type: "faq" });
    const marks = sectionNumbers([a, quiet, c]);
    expect([...marks.keys()]).toEqual(["a", "c"]);
    expect(marks.get("c")?.number).toBe("02");
  });

  it("names a chapter by its title, then its label, then its category", () => {
    expect(chapterName(block({ type: "faq" }))).toBe("Questions");
    expect(chapterName(block({ type: "faq", payload: { eyebrow: "FAQ" } }))).toBe("FAQ");
    expect(chapterName(block({ type: "faq", payload: { eyebrow: "FAQ", heading: "Good to know" } }))).toBe(
      "Good to know",
    );
  });

  it("does not take a title off a block that cannot have one", () => {
    expect(customHeading(block({ type: "hero", payload: { heading: "x" } }))).toBeNull();
  });
});

describe("anchors (spec 28 §9.6)", () => {
  it("keeps a once-only block's anchor as its type, so #rsvp still lands", () => {
    expect(blockAnchor(block({ type: "rsvp" }))).toBe("rsvp");
    expect(blockAnchor(block({ type: "faq" }))).toBe("faq");
  });

  it("gives each repeatable block an anchor of its own", () => {
    const first = block({ id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", type: "dress_code" });
    const second = block({ id: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb", type: "dress_code" });
    expect(blockAnchor(first)).not.toBe(blockAnchor(second));
    expect(blockAnchor(first)).toBe("dress_code-11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("is a function of the block alone, so reordering never moves it", () => {
    const one = block({ id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa", type: "gallery" });
    const two = block({ id: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb", type: "gallery" });
    expect(blockAnchor(two)).toBe(blockAnchor({ ...two }));
    expect([one, two].map(blockAnchor)).toEqual([two, one].map(blockAnchor).reverse());
  });
});
