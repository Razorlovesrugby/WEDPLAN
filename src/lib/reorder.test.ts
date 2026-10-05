import { describe, expect, it } from "vitest";
import { moveWithin } from "./reorder";

describe("moveWithin", () => {
  it("lands the item at the index asked for", () => {
    expect(moveWithin(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveWithin(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("is what a one-step move up or down is", () => {
    expect(moveWithin(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
    expect(moveWithin(["a", "b", "c"], 1, 2)).toEqual(["a", "c", "b"]);
  });

  it("clamps a target outside the list to its ends", () => {
    expect(moveWithin(["a", "b", "c"], 1, -4)).toEqual(["b", "a", "c"]);
    expect(moveWithin(["a", "b", "c"], 1, 99)).toEqual(["a", "c", "b"]);
  });

  it("changes nothing for an item that is not there, or a move to where it already is", () => {
    expect(moveWithin(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    expect(moveWithin(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(moveWithin(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveWithin([], 0, 0)).toEqual([]);
  });

  it("never mutates its input", () => {
    const list = ["a", "b", "c"];
    moveWithin(list, 0, 2);
    expect(list).toEqual(["a", "b", "c"]);
  });
});
