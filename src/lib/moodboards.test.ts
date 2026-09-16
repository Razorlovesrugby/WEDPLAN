import { describe, expect, it } from "vitest";
import {
  DISPLAY_MAX_EDGE,
  MAX_GIF_BYTES,
  MAX_ITEMS_PER_BOARD,
  MAX_SOURCE_BYTES,
  MAX_WEDDING_BYTES,
  downscaleTarget,
  resequence,
  shareIsLive,
  storageObjectPath,
  validateUpload,
} from "./moodboards";

const WEDDING = "11111111-1111-4111-8111-111111111111";
const BOARD = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

describe("storageObjectPath", () => {
  it("puts the wedding and board in the path", () => {
    expect(storageObjectPath(WEDDING, BOARD, ITEM, "display")).toBe(
      `${WEDDING}/${BOARD}/${ITEM}.webp`,
    );
    expect(storageObjectPath(WEDDING, BOARD, ITEM, "thumb")).toBe(
      `${WEDDING}/${BOARD}/${ITEM}_thumb.webp`,
    );
  });

  it("keeps a GIF's extension for the display copy but not the thumbnail", () => {
    expect(storageObjectPath(WEDDING, BOARD, ITEM, "display", "image/gif")).toMatch(/\.gif$/);
    // The thumbnail is generated, so it is WebP whatever the source was.
    expect(storageObjectPath(WEDDING, BOARD, ITEM, "thumb", "image/gif")).toMatch(/_thumb\.webp$/);
  });

  /**
   * The point of the whole function. There are no RLS policies on
   * storage.objects, so a path assembled from anything a client sent would be
   * the hole.
   */
  it("refuses anything that is not a uuid", () => {
    expect(() => storageObjectPath("../../etc", BOARD, ITEM, "display")).toThrow();
    expect(() => storageObjectPath(WEDDING, "", ITEM, "display")).toThrow();
    expect(() => storageObjectPath(WEDDING, BOARD, "a.jpg", "display")).toThrow();
    expect(() => storageObjectPath(WEDDING, BOARD, `${ITEM}/../${BOARD}`, "display")).toThrow();
  });
});

describe("downscaleTarget", () => {
  it("preserves aspect ratio on a landscape image", () => {
    expect(downscaleTarget(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it("preserves aspect ratio on a portrait image", () => {
    expect(downscaleTarget(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("handles square", () => {
    expect(downscaleTarget(3000, 3000, 480)).toEqual({ width: 480, height: 480 });
  });

  it("never upscales", () => {
    expect(downscaleTarget(200, 150, DISPLAY_MAX_EDGE)).toEqual({ width: 200, height: 150 });
    expect(downscaleTarget(2000, 100, 2000)).toEqual({ width: 2000, height: 100 });
  });

  it("never rounds a dimension away to zero", () => {
    // A 4000x1 panorama. Rounding the height to 0 would produce an unusable canvas.
    expect(downscaleTarget(4000, 1, 480)).toEqual({ width: 480, height: 1 });
  });

  it("rejects nonsense dimensions", () => {
    expect(() => downscaleTarget(0, 100, 480)).toThrow();
    expect(() => downscaleTarget(100, -1, 480)).toThrow();
  });
});

describe("validateUpload", () => {
  const base = { contentType: "image/jpeg", byteSize: 1000, itemCount: 0, weddingBytes: 0 };

  it("accepts an ordinary image", () => {
    expect(validateUpload(base)).toEqual({ ok: true });
  });

  it("rejects a type it cannot use, and names the file", () => {
    const result = validateUpload({ ...base, contentType: "application/pdf", fileName: "plan.pdf" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("plan.pdf");
  });

  it("tells an iPhone user what to actually do about HEIC", () => {
    const result = validateUpload({ ...base, contentType: "image/heic" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/JPEG/);
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ ...base, byteSize: 0 }).ok).toBe(false);
  });

  it("holds GIFs to their own lower ceiling", () => {
    expect(validateUpload({ ...base, contentType: "image/gif", byteSize: MAX_GIF_BYTES }).ok).toBe(true);
    expect(validateUpload({ ...base, contentType: "image/gif", byteSize: MAX_GIF_BYTES + 1 }).ok).toBe(false);
    // ...but the same size as a JPEG is fine, because a JPEG gets downscaled.
    expect(validateUpload({ ...base, byteSize: MAX_GIF_BYTES + 1 }).ok).toBe(true);
  });

  it("rejects a file over the source ceiling", () => {
    expect(validateUpload({ ...base, byteSize: MAX_SOURCE_BYTES }).ok).toBe(true);
    expect(validateUpload({ ...base, byteSize: MAX_SOURCE_BYTES + 1 }).ok).toBe(false);
  });

  it("rejects a full board", () => {
    expect(validateUpload({ ...base, itemCount: MAX_ITEMS_PER_BOARD - 1 }).ok).toBe(true);
    expect(validateUpload({ ...base, itemCount: MAX_ITEMS_PER_BOARD }).ok).toBe(false);
  });

  it("rejects an upload that would cross the wedding's storage cap", () => {
    expect(validateUpload({ ...base, byteSize: 10, weddingBytes: MAX_WEDDING_BYTES - 10 }).ok).toBe(true);
    expect(validateUpload({ ...base, byteSize: 11, weddingBytes: MAX_WEDDING_BYTES - 10 }).ok).toBe(false);
  });
});

describe("resequence", () => {
  const items = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 },
    { id: "c", sort_order: 2 },
    { id: "d", sort_order: 3 },
  ];

  it("moves an item down and only rewrites what moved", () => {
    // a b c d -> b c a d. d never moves, so d is not written.
    expect(resequence(items, "a", 2)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "a", sort_order: 2 },
    ]);
  });

  it("moves an item up", () => {
    expect(resequence(items, "d", 0)).toEqual([
      { id: "d", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "c", sort_order: 3 },
    ]);
  });

  it("writes nothing when the item does not move", () => {
    expect(resequence(items, "b", 1)).toEqual([]);
  });

  it("clamps an index past the end rather than losing the item", () => {
    expect(resequence(items, "a", 99)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "c", sort_order: 1 },
      { id: "d", sort_order: 2 },
      { id: "a", sort_order: 3 },
    ]);
  });

  it("writes nothing for an id that is not in the list", () => {
    expect(resequence(items, "zzz", 0)).toEqual([]);
  });

  it("normalises gappy sort orders while it is there", () => {
    const gappy = [
      { id: "a", sort_order: 5 },
      { id: "b", sort_order: 9 },
    ];
    expect(resequence(gappy, "b", 0)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
    ]);
  });
});

describe("shareIsLive", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("is live with nothing set", () => {
    expect(shareIsLive({ revoked_at: null, expires_at: null }, now)).toBe(true);
  });

  it("is dead once revoked, expiry or no expiry", () => {
    expect(shareIsLive({ revoked_at: "2026-05-01T00:00:00Z", expires_at: null }, now)).toBe(false);
    expect(
      shareIsLive({ revoked_at: "2026-05-01T00:00:00Z", expires_at: "2027-01-01T00:00:00Z" }, now),
    ).toBe(false);
  });

  it("is dead past its expiry", () => {
    expect(shareIsLive({ revoked_at: null, expires_at: "2026-05-31T23:59:59Z" }, now)).toBe(false);
  });

  it("is live before its expiry, and dead exactly on it", () => {
    expect(shareIsLive({ revoked_at: null, expires_at: "2026-06-01T12:00:01Z" }, now)).toBe(true);
    expect(shareIsLive({ revoked_at: null, expires_at: "2026-06-01T12:00:00Z" }, now)).toBe(false);
  });
});
