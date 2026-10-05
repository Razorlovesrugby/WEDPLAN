import { describe, expect, it } from "vitest";
import { buildSiteImage, objectPosition, photoPath, pixelWidth } from "./site-image";

const ID = "22222222-2222-4222-8222-222222222222";

describe("photoPath", () => {
  it("is the app's own stable address, never a storage URL", () => {
    expect(photoPath(ID)).toBe(`/api/photo/${ID}`);
    expect(photoPath(ID, 480)).toBe(`/api/photo/${ID}?w=480`);
    expect(photoPath(ID)).not.toMatch(/^https?:/);
  });
});

describe("pixelWidth", () => {
  it("is the edge for a landscape or square image", () => {
    expect(pixelWidth(960, 2000, 1333)).toBe(960);
    expect(pixelWidth(960, 1000, 1000)).toBe(960);
  });

  it("is the scaled width for a portrait, whose long edge is its height", () => {
    // 1333 x 2000 portrait: the 960px-tall copy is 640 wide, not 960.
    expect(pixelWidth(960, 1333, 2000)).toBe(640);
  });

  it("does not divide by nothing", () => {
    expect(pixelWidth(480, 0, 0)).toBe(480);
  });
});

describe("buildSiteImage", () => {
  it("emits no srcset for a photograph uploaded before variants existed", () => {
    const image = buildSiteImage({ id: ID, width: 2000, height: 1333 });
    expect(image.srcSet).toBeNull();
    expect(image.src).toBe(`/api/photo/${ID}`);
  });

  it("lists each variant at its real width, then the original", () => {
    const image = buildSiteImage({ id: ID, width: 2000, height: 1333, variants: [960, 480] });
    expect(image.srcSet).toBe(
      `/api/photo/${ID}?w=480 480w, /api/photo/${ID}?w=960 960w, /api/photo/${ID} 2000w`,
    );
  });

  it("describes a portrait by its pixel width, not its long edge", () => {
    const image = buildSiteImage({ id: ID, width: 1333, height: 2000, variants: [480, 960] });
    expect(image.srcSet).toContain("320w");
    expect(image.srcSet).toContain("640w");
    expect(image.srcSet).toContain("1333w");
  });

  it("will not name a variant it does not know, or one it cannot describe", () => {
    expect(buildSiteImage({ id: ID, width: 2000, height: 1333, variants: [1200] }).srcSet).toBeNull();
    // Variants listed but no dimensions: no srcset beats a misleading one.
    expect(buildSiteImage({ id: ID, width: null, height: null, variants: [480] }).srcSet).toBeNull();
  });

  it("keeps only a well-formed placeholder colour", () => {
    expect(buildSiteImage({ id: ID, width: 1, height: 1, colour: "#7d8f9b" }).colour).toBe("#7d8f9b");
    for (const bad of ["red", "#FFF", "#7D8F9B", "red;background:url(x)", ""]) {
      expect(buildSiteImage({ id: ID, width: 1, height: 1, colour: bad }).colour, bad).toBeNull();
    }
  });

  it("reads a focal point from numbers or Postgres numeric strings, and clamps it", () => {
    expect(buildSiteImage({ id: ID, width: 1, height: 1, focal_x: "0.250", focal_y: 0.4 }).focal).toEqual({
      x: 0.25,
      y: 0.4,
    });
    expect(buildSiteImage({ id: ID, width: 1, height: 1, focal_x: 3, focal_y: -1 }).focal).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("needs both halves of a focal point", () => {
    expect(buildSiteImage({ id: ID, width: 1, height: 1, focal_x: 0.5, focal_y: null }).focal).toBeNull();
    expect(buildSiteImage({ id: ID, width: 1, height: 1, focal_x: "x", focal_y: "y" }).focal).toBeNull();
  });
});

describe("objectPosition", () => {
  it("is the centre when there is no focal point", () => {
    expect(objectPosition(null)).toBe("50% 50%");
  });

  it("turns 0–1 into percentages, and survives a stray value", () => {
    expect(objectPosition({ x: 0.25, y: 0.4 })).toBe("25% 40%");
    expect(objectPosition({ x: 9, y: -2 })).toBe("100% 0%");
  });
});
