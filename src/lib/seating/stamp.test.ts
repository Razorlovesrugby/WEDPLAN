import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "./plan-settings";
import {
  MAX_FAVOURITES,
  MAX_STAMPS,
  RECENT_MAX,
  choiceForKey,
  defaultStep,
  lineStops,
  moveFavourite,
  parseRefs,
  pushRecent,
  repeatStops,
  stampChoices,
  toggleFavourite,
} from "./stamp";

describe("favourites", () => {
  it("are starred in order and unstarred in place", () => {
    let f: string[] = [];
    f = toggleFavourite(f, "candles");
    f = toggleFavourite(f, "round");
    f = toggleFavourite(f, "custom:abc");
    expect(f).toEqual(["candles", "round", "custom:abc"]);
    expect(toggleFavourite(f, "round")).toEqual(["candles", "custom:abc"]);
  });

  it("stop growing at the limit rather than dropping one", () => {
    const full = Array.from({ length: MAX_FAVOURITES }, (_, i) => `x${i}`);
    expect(toggleFavourite(full, "new")).toEqual(full);
    expect(toggleFavourite(full, "x3")).toHaveLength(MAX_FAVOURITES - 1);
  });

  it("reorder: dragging one to a new place", () => {
    const f = ["a", "b", "c", "d"];
    expect(moveFavourite(f, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveFavourite(f, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveFavourite(f, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveFavourite(f, "zzz", 1)).toEqual(f);
  });

  it("are read defensively from stored settings", () => {
    expect(parseRefs(["a", "a", " b ", "", 3, null, "x".repeat(81)])).toEqual(["a", "b"]);
    expect(parseRefs("nope")).toEqual([]);
    expect(parseRefs(undefined)).toEqual([]);
    expect(parseRefs(Array.from({ length: 100 }, (_, i) => `r${i}`))).toHaveLength(MAX_FAVOURITES);
  });

  it("live in the plan settings, and a plan with none reads as none", () => {
    expect(DEFAULT_SETTINGS.favourites).toEqual([]);
    expect(parseSettings({ favourites: ["candles", "custom:1"] }).favourites).toEqual(["candles", "custom:1"]);
    expect(parseSettings({}).favourites).toEqual([]);
    expect(parseSettings(null).favourites).toEqual([]);
    // The thresholds are untouched by them.
    expect(parseSettings({ favourites: ["a"], tallCm: 40 }).tallCm).toBe(40);
  });
});

describe("recent", () => {
  it("keeps the last six, newest first, each once", () => {
    let r: string[] = [];
    for (const ref of ["a", "b", "c", "d", "e", "f", "g"]) r = pushRecent(r, ref);
    expect(r).toEqual(["g", "f", "e", "d", "c", "b"]);
    expect(r).toHaveLength(RECENT_MAX);
    expect(pushRecent(r, "d")).toEqual(["d", "g", "f", "e", "c", "b"]);
  });
});

describe("keys 1 to 9 while stamping", () => {
  it("pick favourites first, then recent ones not already favourites", () => {
    const choices = stampChoices(["candles", "round"], ["lantern", "candles", "plant"]);
    expect(choices).toEqual(["candles", "round", "lantern", "plant"]);
    expect(choiceForKey("1", choices)).toBe("candles");
    expect(choiceForKey("3", choices)).toBe("lantern");
    expect(choiceForKey("5", choices)).toBeNull();
    expect(choiceForKey("0", choices)).toBeNull();
    expect(choiceForKey("a", choices)).toBeNull();
  });

  it("stop at nine", () => {
    const fav = Array.from({ length: 12 }, (_, i) => `f${i}`);
    expect(stampChoices(fav, ["r"])).toHaveLength(9);
    expect(choiceForKey("9", stampChoices(fav, []))).toBe("f8");
  });
});

describe("stamping along a line", () => {
  it("defaults to the item's width plus 20 cm", () => {
    expect(defaultStep(60)).toBe(80);
    expect(defaultStep(40)).toBe(60);
  });

  it("puts the first at the start and the rest every step, the last on the end if it lands there, none past it", () => {
    const stops = lineStops({ x: 100, y: 100 }, { x: 500, y: 100 }, 80);
    expect(stops.map((p) => p.x)).toEqual([100, 180, 260, 340, 420, 500]);
    expect(stops.every((p) => p.y === 100)).toBe(true);
  });

  it("stops short of an end the step doesn't reach", () => {
    const stops = lineStops({ x: 0, y: 0 }, { x: 350, y: 0 }, 100);
    expect(stops.map((p) => p.x)).toEqual([0, 100, 200, 300]);
  });

  it("follows a diagonal drag at the same spacing", () => {
    const stops = lineStops({ x: 0, y: 0 }, { x: 300, y: 400 }, 100);
    expect(stops).toHaveLength(6);
    expect(Math.hypot(stops[1]!.x, stops[1]!.y)).toBeCloseTo(100);
    expect(stops[5]!.x).toBeCloseTo(300);
    expect(stops[5]!.y).toBeCloseTo(400);
  });

  it("a drag shorter than one step is a single stamp, and a zero drag too", () => {
    expect(lineStops({ x: 10, y: 10 }, { x: 40, y: 10 }, 80)).toEqual([{ x: 10, y: 10 }]);
    expect(lineStops({ x: 10, y: 10 }, { x: 10, y: 10 }, 80)).toEqual([{ x: 10, y: 10 }]);
  });

  it("never makes more than the cap, however long the drag or small the step", () => {
    expect(lineStops({ x: 0, y: 0 }, { x: 20000, y: 0 }, 5)).toHaveLength(MAX_STAMPS);
  });

  it("won't use a step too small to be real", () => {
    expect(lineStops({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toHaveLength(21);
    expect(lineStops({ x: 0, y: 0 }, { x: 100, y: 0 }, -5)).toHaveLength(21);
  });
});

describe("repeat", () => {
  it("makes N more across, each a gap clear of the one before", () => {
    const stops = repeatStops({ x: 100, y: 200 }, { w: 60, h: 20 }, 3, 40, "across");
    expect(stops).toEqual([
      { x: 200, y: 200 },
      { x: 300, y: 200 },
      { x: 400, y: 200 },
    ]);
  });

  it("or down, by the item's depth", () => {
    expect(repeatStops({ x: 100, y: 200 }, { w: 60, h: 20 }, 2, 30, "down")).toEqual([
      { x: 100, y: 250 },
      { x: 100, y: 300 },
    ]);
  });

  it("a negative gap doesn't pull them onto each other, and counts are bounded", () => {
    expect(repeatStops({ x: 0, y: 0 }, { w: 50, h: 50 }, 1, -100, "across")).toEqual([{ x: 50, y: 0 }]);
    expect(repeatStops({ x: 0, y: 0 }, { w: 50, h: 50 }, 0, 10, "across")).toEqual([]);
    expect(repeatStops({ x: 0, y: 0 }, { w: 50, h: 50 }, 5000, 10, "across")).toHaveLength(MAX_STAMPS);
  });
});
