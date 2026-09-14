import { describe, expect, it } from "vitest";
import {
  compareRank,
  midpoint,
  needsRebalance,
  rankAfter,
  rankBefore,
  rankBetween,
  rankFirst,
  rankSequence,
  RankError,
} from "./rank";

const ORDERED = (keys: string[]) => keys.every((k, i) => i === 0 || keys[i - 1]! < k);

describe("midpoint", () => {
  it("returns a key strictly between its neighbours", () => {
    const a = "a1";
    const b = "a2";
    const mid = midpoint(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it("never produces a key ending in the minimum digit", () => {
    // Such a key would have nothing able to sort before it.
    let lower = "";
    let upper: string | null = "V";
    for (let i = 0; i < 200; i++) {
      const mid: string = midpoint(lower, upper);
      expect(mid.endsWith("0")).toBe(false);
      upper = mid;
    }
    lower = "V";
    for (let i = 0; i < 200; i++) {
      const mid = midpoint(lower, null);
      expect(mid.endsWith("0")).toBe(false);
      lower = mid;
    }
  });

  it("refuses neighbours given in the wrong order", () => {
    expect(() => midpoint("b", "a")).toThrow(RankError);
    expect(() => midpoint("a", "a")).toThrow(RankError);
  });

  it("refuses a neighbour that leaves no room before it", () => {
    expect(() => midpoint("", "a0")).toThrow(RankError);
  });
});

describe("insertion", () => {
  it("keeps the list ordered through repeated insertion at the front", () => {
    let keys = [rankFirst()];
    for (let i = 0; i < 500; i++) keys = [rankBefore(keys[0]!), ...keys];
    expect(ORDERED(keys)).toBe(true);
  });

  it("keeps the list ordered through repeated insertion at the back", () => {
    let keys = [rankFirst()];
    for (let i = 0; i < 500; i++) keys = [...keys, rankAfter(keys[keys.length - 1]!)];
    expect(ORDERED(keys)).toBe(true);
  });

  it("keeps the list ordered when the same gap is bisected over and over", () => {
    // The pathological case: every insert lands in the same place, which is
    // what dragging one household to position 2 five hundred times does.
    const keys = [rankFirst(), rankAfter(rankFirst())];
    for (let i = 0; i < 500; i++) {
      keys.splice(1, 0, rankBetween(keys[0]!, keys[1]!));
    }
    expect(ORDERED(keys)).toBe(true);
  });

  it("survives a full random shuffle, the way a real reordering session does", () => {
    let keys = rankSequence(60);
    for (let move = 0; move < 2000; move++) {
      const from = Math.floor(Math.random() * keys.length);
      const to = Math.floor(Math.random() * keys.length);
      const rest = keys.filter((_, i) => i !== from);
      const key = rankBetween(rest[to - 1] ?? null, rest[to] ?? null);
      rest.splice(to, 0, key);
      keys = rest;
      expect(ORDERED(keys)).toBe(true);
    }
  });

  it("treats both ends as open", () => {
    const only = rankBetween(null, null);
    expect(only).toBe(rankFirst());
    expect(rankBetween("a1", null) > "a1").toBe(true);
    expect(rankBetween(null, "a1") < "a1").toBe(true);
  });
});

describe("rankSequence", () => {
  it("produces ascending keys", () => {
    expect(ORDERED(rankSequence(300))).toBe(true);
  });

  it("keeps bulk-import keys short", () => {
    // 300 households imported from a spreadsheet must not produce 60-character
    // keys, which is exactly what repeatedly appending to the previous key does.
    const keys = rankSequence(300);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(3);
    expect(new Set(keys).size).toBe(300);
    expect(keys.every((k) => !k.endsWith("0"))).toBe(true);
  });

  it("fits every key inside an existing gap", () => {
    const keys = rankSequence(50, "a1", "a2");
    expect(ORDERED(keys)).toBe(true);
    expect(keys[0]! > "a1").toBe(true);
    expect(keys[keys.length - 1]! < "a2").toBe(true);
    // Balanced bisection: length grows with log(count), not with count.
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(12);
  });

  it("returns nothing for a count of zero", () => {
    expect(rankSequence(0)).toEqual([]);
  });

  it("rejects a nonsense count", () => {
    expect(() => rankSequence(-1)).toThrow(RankError);
    expect(() => rankSequence(1.5)).toThrow(RankError);
  });
});

describe("ordering agrees with PostgreSQL under C collation", () => {
  it("sorts uppercase before lowercase", () => {
    // en_US.UTF-8 would disagree; households.rank is pinned to C for this.
    expect(compareRank("B", "a")).toBe(-1);
    expect(["a", "B", "0"].sort()).toEqual(["0", "B", "a"]);
  });
});

describe("needsRebalance", () => {
  it("is quiet for ordinary keys", () => {
    expect(needsRebalance(rankSequence(300))).toBe(false);
  });

  it("flags keys that have grown long from repeated bisection", () => {
    const keys = [rankFirst(), rankAfter(rankFirst())];
    for (let i = 0; i < 200; i++) keys.splice(1, 0, rankBetween(keys[0]!, keys[1]!));
    expect(needsRebalance(keys)).toBe(true);
  });
});
