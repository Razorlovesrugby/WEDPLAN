import { describe, expect, it } from "vitest";
import { pickSaveTheDatePhotos, saveTheDatePath } from "./save-the-date";

describe("saveTheDatePath", () => {
  it("hangs off the household's own address, suffix and all", () => {
    expect(saveTheDatePath("ray-and-olivia", { slug: "okonkwo", suffix: "4f7ak" })).toBe(
      "/w/ray-and-olivia/okonkwo-4f7ak/save-the-date",
    );
  });
});

describe("pickSaveTheDatePhotos", () => {
  const row = (
    id: string,
    kind: "hero" | "story" | "gallery" | "stay" | "party",
    sort_order = 0,
    uploaded_by_household: string | null = null,
  ) => ({ id, kind, sort_order, uploaded_by_household });

  it("leads with the hero, then story, then the couple's gallery", () => {
    const picked = pickSaveTheDatePhotos([
      row("g1", "gallery"),
      row("s2", "story", 2),
      row("h", "hero"),
      row("s1", "story", 1),
    ]);
    expect(picked.map((photo) => photo.id)).toEqual(["h", "s1", "s2", "g1"]);
  });

  it("never shows a guest's upload or a hotel photo", () => {
    const picked = pickSaveTheDatePhotos([
      row("guest", "gallery", 0, "household-1"),
      row("hotel", "stay"),
      row("party", "party"),
      row("ours", "gallery"),
    ]);
    expect(picked.map((photo) => photo.id)).toEqual(["ours"]);
  });

  it("stops at the limit", () => {
    const rows = Array.from({ length: 9 }, (_, index) => row(`s${index}`, "story", index));
    expect(pickSaveTheDatePhotos(rows)).toHaveLength(5);
    expect(pickSaveTheDatePhotos(rows, 2).map((photo) => photo.id)).toEqual(["s0", "s1"]);
  });
});
