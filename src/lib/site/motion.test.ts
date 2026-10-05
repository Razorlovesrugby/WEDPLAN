import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  DEFAULT_MOTION,
  LEVEL_EFFECTS,
  MOTION_EFFECTS,
  MOTION_EFFECT_COPY,
  MOTION_LEVELS,
  MOTION_LEVEL_COPY,
  activeEffects,
  motionAttributes,
  resolveLayout,
  resolveMotion,
  serialiseMotion,
  setLevel,
  toggleEffect,
} from "./motion";

describe("resolveMotion", () => {
  it("is Gentle for a theme saved before motion existed", () => {
    expect(resolveMotion(undefined)).toEqual(DEFAULT_MOTION);
    expect(resolveMotion(null)).toEqual(DEFAULT_MOTION);
    expect(DEFAULT_MOTION.level).toBe("gentle");
  });

  it("never throws, whatever it is given", () => {
    for (const value of ["gentle", 4, [], { level: 9 }, { level: "loud" }, { off: "all" }]) {
      expect(() => resolveMotion(value)).not.toThrow();
      expect(MOTION_LEVELS).toContain(resolveMotion(value).level);
    }
  });

  it("drops effect names it does not know instead of failing", () => {
    // A theme written by a later version of the app, read by this one.
    const settings = resolveMotion({ level: "gentle", off: ["reading_line", "confetti"], on: "everything" });
    expect(settings.off).toEqual(["reading_line"]);
    expect(settings.on).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(resolveMotion({ level: "gentle", off: ["reading_line", "reading_line"] }).off).toEqual(["reading_line"]);
  });
});

describe("activeEffects", () => {
  it("gives each level its own set", () => {
    expect(activeEffects({ level: "gentle", off: [], on: [] })).toEqual(LEVEL_EFFECTS.gentle);
    expect(activeEffects({ level: "cinematic", off: [], on: [] })).toEqual(LEVEL_EFFECTS.cinematic);
  });

  it("makes Cinematic a superset of Gentle", () => {
    for (const effect of LEVEL_EFFECTS.gentle) expect(LEVEL_EFFECTS.cinematic).toContain(effect);
  });

  it("applies overrides from the level's default", () => {
    expect(activeEffects({ level: "gentle", off: ["reading_line"], on: [] })).not.toContain("reading_line");
    expect(activeEffects({ level: "gentle", off: [], on: ["photo_arrival"] })).toContain("photo_arrival");
  });

  it("makes Still mean still: overrides cannot bring an effect back", () => {
    expect(activeEffects({ level: "still", off: [], on: ["section_arrivals", "reading_line"] })).toEqual([]);
  });

  it("lists effects in declared order", () => {
    const effects = activeEffects({ level: "gentle", off: [], on: ["stagger", "photo_arrival"] });
    expect(effects).toEqual(MOTION_EFFECTS.filter((effect) => effects.includes(effect)));
  });
});

describe("motionAttributes", () => {
  it("emits the level and a space-separated effect list", () => {
    expect(motionAttributes({ level: "gentle", off: ["reading_line"], on: [] })).toEqual({
      "data-motion": "gentle",
      "data-fx": "section_arrivals nav_condense",
    });
  });

  it("emits an empty list, not a missing attribute, for Still", () => {
    expect(motionAttributes({ level: "still", off: [], on: [] })["data-fx"]).toBe("");
  });
});

describe("toggling and storing", () => {
  it("turns a running effect off, and back on", () => {
    const off = toggleEffect(DEFAULT_MOTION, "reading_line");
    expect(activeEffects(off)).not.toContain("reading_line");
    const back = toggleEffect(off, "reading_line");
    expect(activeEffects(back)).toContain("reading_line");
    // Back to what the level says: nothing left over to store.
    expect(back).toEqual(DEFAULT_MOTION);
  });

  it("turns an effect the level does not run on", () => {
    const withPhotos = toggleEffect(DEFAULT_MOTION, "photo_arrival");
    expect(withPhotos.on).toEqual(["photo_arrival"]);
    expect(activeEffects(withPhotos)).toContain("photo_arrival");
  });

  it("drops overrides that repeat the level, so a level change is not fought by leftovers", () => {
    // Cinematic with the reading line off, then back to Gentle: Gentle's own
    // reading line is off because that was asked for, and photo_arrival's
    // override says nothing Gentle does not already say.
    const cinematic = setLevel(DEFAULT_MOTION, "cinematic");
    const quiet = toggleEffect(cinematic, "photo_arrival");
    expect(quiet.off).toEqual(["photo_arrival"]);
    expect(setLevel(quiet, "gentle").off).toEqual([]);
  });

  it("stores only the real differences", () => {
    expect(serialiseMotion({ level: "gentle", off: ["photo_arrival"], on: ["section_arrivals"] })).toEqual({
      level: "gentle",
      off: [],
      on: [],
    });
  });
});

describe("the copy", () => {
  it("covers every level and every effect", () => {
    for (const level of MOTION_LEVELS) expect(MOTION_LEVEL_COPY[level].label).not.toBe("");
    for (const effect of MOTION_EFFECTS) expect(MOTION_EFFECT_COPY[effect].label).not.toBe("");
  });
});

describe("resolveLayout", () => {
  it("keeps today's page for anybody who never chose", () => {
    expect(resolveLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(DEFAULT_LAYOUT).toEqual({
      chapterRail: true,
      sectionNumbers: true,
      replyBar: true,
      replyByDate: true,
    });
  });

  it("reads each switch on its own and ignores rubbish", () => {
    expect(resolveLayout({ chapter_rail: false })).toEqual({ ...DEFAULT_LAYOUT, chapterRail: false });
    expect(resolveLayout({ section_numbers: "no" })).toEqual(DEFAULT_LAYOUT);
    expect(resolveLayout({ reply_bar: false, reply_by_date: false })).toEqual({
      ...DEFAULT_LAYOUT,
      replyBar: false,
      replyByDate: false,
    });
  });

  it("gives a switch added later its own default when an older theme lacks it", () => {
    // A theme saved when only the rail and the numbers existed.
    expect(resolveLayout({ chapter_rail: false, section_numbers: false })).toEqual({
      chapterRail: false,
      sectionNumbers: false,
      replyBar: true,
      replyByDate: true,
    });
  });
});
