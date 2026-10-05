import { describe, expect, it } from "vitest";
import { rankSongs } from "./song-rank";

const song = (id: string, votes: number, createdAt: string) => ({ id, votes, createdAt });

describe("rankSongs", () => {
  it("puts the most-voted first", () => {
    const ranked = rankSongs([song("a", 1, "2026-01-01"), song("b", 6, "2026-01-01"), song("c", 3, "2026-01-01")]);
    expect(ranked.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("puts the newest first within a tie", () => {
    const ranked = rankSongs([
      song("old", 1, "2026-01-01T10:00:00Z"),
      song("new", 1, "2026-03-01T10:00:00Z"),
      song("mid", 1, "2026-02-01T10:00:00Z"),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(["new", "mid", "old"]);
  });

  it("is the same every time for requests made in the same instant", () => {
    const ranked = rankSongs([song("b", 1, "2026-01-01T10:00:00Z"), song("a", 1, "2026-01-01T10:00:00Z")]);
    expect(ranked.map((s) => s.id)).toEqual(["a", "b"]);
    expect(rankSongs([...ranked].reverse()).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("never mutates its input", () => {
    const input = [song("a", 1, "2026-01-01"), song("b", 2, "2026-01-01")];
    rankSongs(input);
    expect(input.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
