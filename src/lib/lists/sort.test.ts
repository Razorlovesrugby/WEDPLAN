import { describe, expect, it } from "vitest";
import { sortCompletedLast } from "./sort";

describe("sortCompletedLast", () => {
  it("moves done items after active ones", () => {
    const items = [
      { id: "a", done: false },
      { id: "b", done: true },
      { id: "c", done: false },
    ];
    expect(sortCompletedLast(items, (i) => i.done).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("preserves relative order within each group", () => {
    const items = [
      { id: "a", done: true },
      { id: "b", done: false },
      { id: "c", done: true },
      { id: "d", done: false },
    ];
    expect(sortCompletedLast(items, (i) => i.done).map((i) => i.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("is a no-op when nothing is done", () => {
    const items = [{ id: "a", done: false }, { id: "b", done: false }];
    expect(sortCompletedLast(items, (i) => i.done).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("is a no-op when everything is done", () => {
    const items = [{ id: "a", done: true }, { id: "b", done: true }];
    expect(sortCompletedLast(items, (i) => i.done).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(sortCompletedLast([], () => true)).toEqual([]);
  });
});
