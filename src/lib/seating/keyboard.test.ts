import { describe, expect, it } from "vitest";
import { describeChange, describeFixture, describePosition, describeTable, focusOrder, movedTooFar, nextFocus } from "./keyboard";

const at = (key: string, x: number, y: number) => ({ key, x, y });

describe("focusOrder (spec 60 B.1)", () => {
  it("reads top to bottom, left to right within a row", () => {
    const order = focusOrder([at("c", 900, 500), at("a", 100, 100), at("b", 500, 120), at("d", 100, 520)]);
    expect(order).toEqual(["a", "b", "d", "c"]);
  });

  it("treats things about a metre apart in height as one row", () => {
    // b is 60 cm lower than a, so it is in a's row and comes after it by x; c is 200 cm lower: the next row.
    expect(focusOrder([at("b", 400, 160), at("a", 100, 100), at("c", 50, 300)])).toEqual(["a", "b", "c"]);
  });

  it("measures a row from its first item, so a slope does not chain rows together", () => {
    const order = focusOrder([at("a", 500, 0), at("b", 400, 90), at("c", 300, 180), at("d", 200, 270)]);
    // a and b are one row (≤100 from a); c starts the next (180 from a) and d is 90 below c: same row as c.
    expect(order).toEqual(["b", "a", "d", "c"]);
  });

  it("is stable for items at the same place and for an empty plan", () => {
    expect(focusOrder([at("t:2", 100, 100), at("t:1", 100, 100)])).toEqual(["t:1", "t:2"]);
    expect(focusOrder([])).toEqual([]);
  });
});

describe("nextFocus", () => {
  const order = ["a", "b", "c"];
  it("Tab from the plan goes to the first item, Shift+Tab leaves", () => {
    expect(nextFocus(order, null, 1)).toBe("a");
    expect(nextFocus(order, null, -1)).toBe("leave");
  });
  it("moves through the items and leaves at either end", () => {
    expect(nextFocus(order, "a", 1)).toBe("b");
    expect(nextFocus(order, "b", -1)).toBe("a");
    expect(nextFocus(order, "c", 1)).toBe("leave");
    // Back past the first item returns to the plan itself, from where one more Shift+Tab leaves.
    expect(nextFocus(order, "a", -1)).toBeNull();
  });
  it("copes with an item that has gone, and with an empty plan", () => {
    expect(nextFocus(order, "gone", 1)).toBe("a");
    expect(nextFocus([], null, 1)).toBe("leave");
  });
});

describe("describePosition", () => {
  it("names the third of the room", () => {
    expect(describePosition({ x: 100, y: 100 }, 3000, 3000)).toBe("near the top left");
    expect(describePosition({ x: 2900, y: 2900 }, 3000, 3000)).toBe("near the bottom right");
    expect(describePosition({ x: 1500, y: 100 }, 3000, 3000)).toBe("near the top");
    expect(describePosition({ x: 2900, y: 1500 }, 3000, 3000)).toBe("near the right");
    expect(describePosition({ x: 1500, y: 1500 }, 3000, 3000)).toBe("in the middle of the room");
  });
});

describe("accessible names and the live region", () => {
  it("names a table with its kind, seats and place", () => {
    expect(describeTable({ label: "Table 4", shape: "round", capacity: 8, taken: 6, where: "near the top left" })).toBe("Table 4, round, 6 of 8 seated, near the top left");
    expect(describeTable({ label: "Top", shape: "rect", capacity: 10, taken: 0, where: "in the middle of the room" })).toBe("Top, rectangular, 0 of 10 seated, in the middle of the room");
  });
  it("names furniture with its quantity when there are several", () => {
    expect(describeFixture({ label: "Dance floor", quantity: 1, where: "near the bottom" })).toBe("Dance floor, near the bottom");
    expect(describeFixture({ label: "Candle", quantity: 12, where: "near the left" })).toBe("Candle, 12, near the left");
  });
  it("says what happened", () => {
    expect(describeChange({ kind: "focus", name: "Table 4", index: 3, total: 14, selected: true })).toBe("Table 4 selected, 3 of 14");
    expect(describeChange({ kind: "focus", name: "Table 4", index: 3, total: 14 })).toBe("Table 4, 3 of 14");
    expect(describeChange({ kind: "move", count: 3, dx: 5, dy: 0 })).toBe("3 things moved 5 cm right");
    expect(describeChange({ kind: "move", count: 1, name: "Table 4", dx: 0, dy: -25 })).toBe("Table 4 moved 25 cm up");
    expect(describeChange({ kind: "move", count: 2, dx: -5, dy: 5 })).toBe("2 things moved 5 cm left and 5 cm down");
    expect(describeChange({ kind: "paste", count: 2 })).toBe("Pasted 2 things");
    expect(describeChange({ kind: "paste", count: 1 })).toBe("Pasted 1 thing");
    expect(describeChange({ kind: "delete", count: 4 })).toBe("Deleted 4 things");
    expect(describeChange({ kind: "turn", count: 1, name: "Cake table", deg: 15 })).toBe("Cake table turned 15° clockwise");
    expect(describeChange({ kind: "turn", count: 5, deg: -90, group: true })).toBe("5 things turned 90° anticlockwise as a group");
    expect(describeChange({ kind: "resize", name: "Stage", width: 400.4, depth: 300 })).toBe("Stage is now 400 by 300 cm");
    expect(describeChange({ kind: "select", count: 0 })).toBe("Nothing selected");
    expect(describeChange({ kind: "select", count: 3 })).toBe("3 things selected");
  });
});

describe("long-press slop", () => {
  it("counts a small wobble as still pressing, and a real move as a drag", () => {
    expect(movedTooFar({ x: 100, y: 100 }, { x: 104, y: 103 })).toBe(false);
    expect(movedTooFar({ x: 100, y: 100 }, { x: 112, y: 100 })).toBe(true);
  });
});
