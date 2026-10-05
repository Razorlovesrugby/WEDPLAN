import { describe, expect, it } from "vitest";
import { DEFAULT_SONG_PLACEHOLDER, songPlaceholders } from "./song-placeholder";

describe("songPlaceholders", () => {
  it("is the joke until the planner writes their own", () => {
    expect(DEFAULT_SONG_PLACEHOLDER).toBe("Anything but Wonderwall");
    expect(songPlaceholders({})).toEqual({ song: "Anything but Wonderwall", artist: undefined });
    expect(songPlaceholders(null)).toEqual({ song: "Anything but Wonderwall", artist: undefined });
  });

  it("uses what the planner wrote, for each box on its own", () => {
    expect(songPlaceholders({ placeholder_song: "September", placeholder_artist: "Earth, Wind & Fire" })).toEqual({
      song: "September",
      artist: "Earth, Wind & Fire",
    });
    expect(songPlaceholders({ placeholder_artist: "ABBA" })).toEqual({
      song: "Anything but Wonderwall",
      artist: "ABBA",
    });
  });

  it("treats a blank field as not written", () => {
    expect(songPlaceholders({ placeholder_song: "   ", placeholder_artist: "" })).toEqual({
      song: "Anything but Wonderwall",
      artist: undefined,
    });
  });

  it("ignores a value that is not text", () => {
    expect(songPlaceholders({ placeholder_song: 4 }).song).toBe("Anything but Wonderwall");
  });
});
