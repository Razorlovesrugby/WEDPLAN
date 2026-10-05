import { describe, expect, it } from "vitest";
import { averageColour, scaledSize } from "./encode-image";

describe("scaledSize", () => {
  it("scales the long edge down to the limit, keeping the proportions", () => {
    expect(scaledSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(scaledSize(3000, 4000, 960)).toEqual({ width: 720, height: 960 });
  });

  it("never upscales", () => {
    expect(scaledSize(700, 500, 2000)).toEqual({ width: 700, height: 500 });
  });

  it("never returns zero, however thin the image", () => {
    expect(scaledSize(10000, 1, 480).height).toBe(1);
  });
});

describe("averageColour", () => {
  it("averages opaque pixels to a lower-case hex triplet", () => {
    expect(averageColour([255, 0, 0, 255, 0, 0, 255, 255])).toBe("#800080");
  });

  it("ignores transparent pixels, so a clear PNG is not black", () => {
    expect(averageColour([10, 20, 30, 255, 0, 0, 0, 0])).toBe("#0a141e");
  });

  it("is null when there is nothing to average", () => {
    expect(averageColour([])).toBeNull();
    expect(averageColour([1, 2, 3, 0])).toBeNull();
  });

  it("matches the shape the database check demands", () => {
    expect(averageColour([200, 180, 160, 255])).toMatch(/^#[0-9a-f]{6}$/);
  });
});
