import { describe, expect, it } from "vitest";
import { isPhotoType, photoSize } from "./photo";

describe("photoSize", () => {
  it("shrinks the long side to 1600", () => {
    expect(photoSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(photoSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it("never upscales", () => {
    expect(photoSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("never reaches zero", () => {
    expect(photoSize(100000, 1).height).toBe(1);
  });
});

describe("isPhotoType", () => {
  it("accepts phone photo types only", () => {
    expect(isPhotoType("image/jpeg")).toBe(true);
    expect(isPhotoType("IMAGE/HEIC")).toBe(true);
    expect(isPhotoType("application/pdf")).toBe(false);
  });
});
