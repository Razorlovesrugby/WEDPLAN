import { describe, expect, it } from "vitest";
import { HOLD_MS, heldOrder, hotSongId, mayReorder, movementSince, nowPlayingId } from "./song-chart";

describe("hotSongId", () => {
  it("picks the most recent votes, at least three", () => {
    expect(hotSongId([{ id: "a", recentVotes: 2 }, { id: "b", recentVotes: 4 }, { id: "c", recentVotes: 3 }])).toBe("b");
  });

  it("is nobody below three", () => {
    expect(hotSongId([{ id: "a", recentVotes: 2 }])).toBeNull();
  });

  it("gives a tie to the higher-ranked song", () => {
    expect(hotSongId([{ id: "a", recentVotes: 3 }, { id: "b", recentVotes: 3 }])).toBe("a");
  });
});

describe("nowPlayingId", () => {
  const now = Date.parse("2027-06-12T21:45:00Z");

  it("is the latest played within five minutes", () => {
    expect(
      nowPlayingId(
        [
          { id: "a", playedAt: "2027-06-12T21:42:00Z" },
          { id: "b", playedAt: "2027-06-12T21:44:00Z" },
          { id: "c", playedAt: null },
        ],
        now,
      ),
    ).toBe("b");
  });

  it("is nothing once five minutes have passed", () => {
    expect(nowPlayingId([{ id: "a", playedAt: "2027-06-12T21:30:00Z" }], now)).toBeNull();
  });
});

describe("movementSince", () => {
  it("marks nothing on a first visit", () => {
    expect(movementSince(null, ["a", "b"]).size).toBe(0);
  });

  it("marks up, down, new and unchanged", () => {
    const moves = movementSince(["a", "b", "c"], ["c", "a", "d", "b"]);
    expect(moves.get("c")).toEqual({ kind: "up", by: 2 });
    expect(moves.get("a")).toEqual({ kind: "down", by: 1 });
    expect(moves.get("d")).toEqual({ kind: "new" });
    expect(moves.get("b")).toEqual({ kind: "down", by: 2 });
  });

  it("marks a song that stayed put as no movement", () => {
    expect(movementSince(["a"], ["a"]).get("a")).toBeNull();
  });
});

describe("holding the order under a thumb", () => {
  it("allows a re-order only after the hold", () => {
    expect(mayReorder(null, 10_000)).toBe(true);
    expect(mayReorder(10_000, 10_000 + HOLD_MS - 1)).toBe(false);
    expect(mayReorder(10_000, 10_000 + HOLD_MS)).toBe(true);
  });

  it("keeps the shown order, drops the gone and appends the new", () => {
    expect(heldOrder(["a", "b", "c"], ["c", "d", "a"])).toEqual(["a", "c", "d"]);
  });
});
