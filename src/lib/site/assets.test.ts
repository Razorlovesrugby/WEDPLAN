import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, isAcceptedUploadType, siteAssetPath } from "./assets";

const WEDDING = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";

describe("siteAssetPath", () => {
  it("derives a path under the site prefix", () => {
    expect(siteAssetPath(WEDDING, ASSET)).toBe(`site/${WEDDING}/${ASSET}.webp`);
  });

  it("names the thumbnail distinctly", () => {
    expect(siteAssetPath(WEDDING, ASSET, "thumb")).toBe(`site/${WEDDING}/${ASSET}_thumb.webp`);
  });

  it("keeps site images out of the moodboard namespace", () => {
    // Both live in one bucket so there is one infrastructure step; the prefix
    // is the only thing keeping them apart.
    expect(siteAssetPath(WEDDING, ASSET).startsWith("site/")).toBe(true);
  });

  it("refuses anything that is not a uuid", () => {
    // Traversal is the attack this shape exists to make impossible: a path
    // accepted from a client could name another wedding's object.
    for (const bad of ["../../etc/passwd", "", "not-a-uuid", `${WEDDING}/../x`]) {
      expect(() => siteAssetPath(bad, ASSET), bad).toThrow();
      expect(() => siteAssetPath(WEDDING, bad), bad).toThrow();
    }
  });
});

describe("isAcceptedUploadType", () => {
  it("accepts the formats a phone camera produces", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(isAcceptedUploadType(type), type).toBe(true);
    }
  });

  it("is case-insensitive, because headers are not normalised", () => {
    expect(isAcceptedUploadType("IMAGE/JPEG")).toBe(true);
  });

  it("refuses video and anything that is not an image", () => {
    // No video in V1: transcoding is a pipeline wearing a small feature's
    // clothes, and an un-transcoded phone video is hundreds of megabytes.
    for (const type of ["video/mp4", "image/svg+xml", "application/pdf", "text/html", ""]) {
      expect(isAcceptedUploadType(type), type).toBe(false);
    }
  });

  it("refuses SVG specifically", () => {
    // An SVG is a document that can carry script, served from our own origin.
    expect(isAcceptedUploadType("image/svg+xml")).toBe(false);
  });
});

describe("MAX_UPLOAD_BYTES", () => {
  it("is large enough for a phone photo and small enough to not be a DoS", () => {
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(4 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(25 * 1024 * 1024);
  });
});
