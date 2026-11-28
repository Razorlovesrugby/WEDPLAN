import { describe, expect, it } from "vitest";
import { countItems, effectiveRules, hasTabletop, newItemId, nudgeItems, parseItemRules, parseTableItems, pasteItems, ruleItems, rulePositions, snapOnTable, toCm, toFractions } from "./table-items";

const long = (capacity: number, ends_seated = false) => ({ shape: "long", capacity, ends_seated });
const round = (capacity: number) => ({ shape: "round", capacity });

describe("parseTableItems (spec 59 D.1)", () => {
  it("keeps good items and drops what isn't one", () => {
    const items = parseTableItems([
      { id: "a", kind: "candles", along: 0.1, across: -0.2, rotation: 370 },
      { id: "b", kind: "nonsense", along: 0, across: 0 },
      { id: "c", kind: "dish", ref: "dish1", label: "  Lamb  ", along: 9, across: -9 },
      { id: "a", kind: "sign", along: 0, across: 0 },
      { kind: "sign", along: 0, across: 0 },
      { id: "d", kind: "sign", along: "x", across: 0 },
      "junk",
    ]);
    expect(items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(items[0]).toMatchObject({ along: 0.1, across: -0.2, rotation: 10 });
    expect(items[1]).toMatchObject({ ref: "dish1", label: "Lamb", along: 0.5, across: -0.5 });
  });
  it("is empty for anything that isn't a list, and stops at 200", () => {
    expect(parseTableItems(null)).toEqual([]);
    expect(parseTableItems({})).toEqual([]);
    expect(parseTableItems(Array.from({ length: 250 }, (_, i) => ({ id: `i${i}`, kind: "candles", along: 0, across: 0 })))).toHaveLength(200);
  });
  it("makes fresh ids", () => {
    const taken = new Set(["a"]);
    const id = newItemId(taken);
    expect(id).not.toBe("a");
    expect(id.length).toBeLessThanOrEqual(40);
  });
});

describe("parseItemRules (D.2)", () => {
  it("reads a rule's number and end, and clamps them", () => {
    const rules = parseItemRules([
      { id: "r1", kind: "dish", ref: "d1", rule: "every_n_seats", n: 3 },
      { id: "r2", kind: "arrangement", rule: "one_end", end: "foot" },
      { id: "r3", kind: "candles", rule: "n_per_table", n: 500 },
      { id: "r4", kind: "candles", rule: "teleport" },
      { id: "r1", kind: "candles", rule: "centre" },
    ]);
    expect(rules.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(rules[0]).toMatchObject({ n: 3, ref: "d1" });
    expect(rules[1]).toMatchObject({ end: "foot" });
    expect(rules[2]!.n).toBe(60);
  });
  it("a one_end rule defaults to the head end", () => {
    expect(parseItemRules([{ id: "x", kind: "candles", rule: "one_end" }])[0]!.end).toBe("head");
  });
});

describe("rulePositions: a long table, chairs both sides", () => {
  // Capacity 10, no seats at the ends: 5 chairs a side.
  it("every 3 seats: groups of three then two along one side, each serving both sides", () => {
    const p = rulePositions(long(10), { rule: "every_n_seats", n: 3 });
    expect(p).toHaveLength(2);
    expect(p.map((x) => x.serves)).toEqual([6, 4]);
    expect(p[0]!.along).toBeCloseTo(-0.2, 3);
    expect(p[1]!.along).toBeCloseTo(0.3, 3);
    expect(p.every((x) => x.across === 0)).toBe(true);
  });
  it("every seat's worth is one position per N when N divides the side", () => {
    expect(rulePositions(long(12), { rule: "every_n_seats", n: 2 })).toHaveLength(3);
  });
  it("N per table, evenly spaced", () => {
    const p = rulePositions(long(10), { rule: "n_per_table", n: 3 });
    expect(p.map((x) => x.along)).toEqual([-0.333, 0, 0.333]);
  });
  it("at each end, at one end (head or foot) and in the centre", () => {
    expect(rulePositions(long(10), { rule: "each_end" }).map((x) => x.along)).toEqual([-0.46, 0.46]);
    expect(rulePositions(long(10), { rule: "one_end", end: "head" }).map((x) => x.along)).toEqual([0.46]);
    expect(rulePositions(long(10), { rule: "one_end", end: "foot" }).map((x) => x.along)).toEqual([-0.46]);
    expect(rulePositions(long(10), { rule: "centre" })).toEqual([{ along: 0, across: 0, rotation: 0 }]);
  });
  it("at each seat: one per chair, down both sides", () => {
    const p = rulePositions(long(10), { rule: "each_seat" });
    expect(p).toHaveLength(10);
    expect(p.filter((x) => x.across < 0)).toHaveLength(5);
  });
  it("seats at the ends take two chairs off each side's count", () => {
    expect(rulePositions(long(12, true), { rule: "each_seat" })).toHaveLength(10); // (12 - 2) / 2 = 5 a side
  });
  it("a banquet run counts both sides too", () => {
    expect(rulePositions({ shape: "banquet", capacity: 20 }, { rule: "every_n_seats", n: 5 }).map((x) => x.serves)).toEqual([10, 10]);
  });
});

describe("rulePositions: one-sided, round and oval", () => {
  it("a head table is seated on one side: N counts chairs along it and each position serves just those", () => {
    const p = rulePositions({ shape: "head", capacity: 6 }, { rule: "every_n_seats", n: 3 });
    expect(p.map((x) => x.serves)).toEqual([3, 3]);
  });
  it("a round table: every 3 seats counts chairs in order round it", () => {
    const p = rulePositions(round(8), { rule: "every_n_seats", n: 3 });
    expect(p.map((x) => x.serves)).toEqual([3, 3, 2]);
    // Every position is on the ring inside the place settings, nowhere near the table's edge.
    expect(p.every((x) => Math.hypot(x.along, x.across) > 0.25 && Math.hypot(x.along, x.across) < 0.35)).toBe(true);
  });
  it("a round table with one centrepiece is in the centre", () => {
    expect(rulePositions(round(8), { rule: "n_per_table", n: 1 })).toEqual([{ along: 0, across: 0, rotation: 0 }]);
    expect(rulePositions(round(8), { rule: "centre" })).toHaveLength(1);
  });
  it("N per table goes round the ring, evenly", () => {
    const p = rulePositions(round(10), { rule: "n_per_table", n: 4 });
    expect(p).toHaveLength(4);
    expect(p[0]).toMatchObject({ along: 0, across: -0.3 }); // the first at the top
  });
  it("one position per chair, a bud vase a place", () => {
    expect(rulePositions(round(8), { rule: "each_seat" })).toHaveLength(8);
    expect(rulePositions({ shape: "oval", capacity: 10 }, { rule: "each_seat" })).toHaveLength(10);
  });
  it("a ceremony row has no tabletop", () => {
    expect(hasTabletop("rows")).toBe(false);
    expect(rulePositions({ shape: "rows", capacity: 40 }, { rule: "each_seat" })).toEqual([]);
  });
  it("every position stays on the table, for every shape and rule", () => {
    const shapes = ["round", "square", "oval", "long", "head", "sweetheart", "half_moon", "serpentine", "banquet"];
    for (const shape of shapes) {
      for (const rule of ["every_n_seats", "n_per_table", "each_end", "one_end", "centre", "each_seat"] as const) {
        for (const capacity of [1, 2, 6, 8, 20]) {
          const ps = rulePositions({ shape, capacity }, { rule, n: 3, end: "head" });
          for (const p of ps) {
            expect(Math.abs(p.along)).toBeLessThanOrEqual(0.5);
            expect(Math.abs(p.across)).toBeLessThanOrEqual(0.5);
          }
          expect(ps.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("rules on a table", () => {
  it("turns rules into items with stable ids, and carries the dish", () => {
    const items = ruleItems(long(10), parseItemRules([{ id: "r1", kind: "dish", ref: "d1", rule: "every_n_seats", n: 3 }]));
    expect(items.map((i) => i.id)).toEqual(["rule:r1:0", "rule:r1:1"]);
    expect(items.every((i) => i.kind === "dish" && i.ref === "d1" && i.fromRule === "r1")).toBe(true);
  });
  it("a per-table override replaces the style's whole list; none means the style's", () => {
    const style = parseItemRules([{ id: "s", kind: "candles", rule: "centre" }]);
    const own = parseItemRules([{ id: "o", kind: "sign", rule: "centre" }]);
    expect(effectiveRules(style, null)).toBe(style);
    expect(effectiveRules(style, own)).toBe(own);
    expect(effectiveRules(style, [])).toEqual([]);
  });
  it("counts what a table carries, placed and ruled, by kind and dish", () => {
    const placed = parseTableItems([{ id: "a", kind: "candles", along: 0, across: 0 }, { id: "b", kind: "dish", ref: "d1", along: 0, across: 0 }]);
    const ruled = ruleItems(long(10), parseItemRules([{ id: "r", kind: "dish", ref: "d1", rule: "n_per_table", n: 2 }]));
    const c = countItems(placed, ruled);
    expect(c.get("candles")).toBe(1);
    expect(c.get("dish:d1")).toBe(3);
  });
});

describe("placing by hand", () => {
  const t = { shape: "long", capacity: 10, ends_seated: false, length: 300, width: 90 };
  it("snaps to the centre line, the ends and the points opposite each chair", () => {
    expect(snapOnTable(t, { along: 0.003, across: 0.004 })).toMatchObject({ kind: "centre" });
    expect(snapOnTable(t, { along: 0.46, across: 0.01 })).toMatchObject({ kind: "end", along: 0.46 });
    // Opposite the second chair along one side (5 chairs a side: centres at -0.4, -0.2, 0, 0.2, 0.4), on the near side.
    expect(snapOnTable(t, { along: -0.2, across: 0.262 })).toMatchObject({ kind: "chair", along: -0.2, across: 0.26 });
  });
  it("snaps to nothing when nothing is close", () => {
    expect(snapOnTable(t, { along: -0.07, across: 0.15 })).toBeNull();
  });
  it("a round table snaps to the points between its chairs' places", () => {
    const r = { shape: "round", capacity: 8, length: 150, width: 150 };
    const s = snapOnTable(r, { along: 0, across: 0.005 });
    expect(s?.kind).toBe("centre");
  });
  it("converts between centimetres and fractions, keeping items on the table", () => {
    expect(toFractions({ length: 300, width: 90 }, { x: 75, y: -18 })).toEqual({ along: 0.25, across: -0.2 });
    expect(toFractions({ length: 300, width: 90 }, { x: 9000, y: 0 })).toEqual({ along: 0.5, across: 0 });
    expect(toCm({ length: 300, width: 90 }, { along: 0.25, across: -0.2 })).toEqual({ x: 75, y: -18 });
  });
  it("pasting onto another table keeps the relative place with fresh ids", () => {
    const items = parseTableItems([{ id: "a", kind: "candles", along: 0.25, across: 0 }]);
    const pasted = pasteItems(items, new Set(["a"]));
    expect(pasted[0]).toMatchObject({ kind: "candles", along: 0.25, across: 0 });
    expect(pasted[0]!.id).not.toBe("a");
  });
  it("nudges items without leaving the table", () => {
    const items = parseTableItems([{ id: "a", kind: "candles", along: 0.49, across: 0 }, { id: "b", kind: "candles", along: 0, across: 0 }]);
    const moved = nudgeItems(items, new Set(["a"]), 0.05, 0.1);
    expect(moved[0]).toMatchObject({ along: 0.5, across: 0.1 });
    expect(moved[1]).toMatchObject({ along: 0, across: 0 });
  });
});
