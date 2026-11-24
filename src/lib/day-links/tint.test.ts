import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/theme/contrast";
import { FALLBACK_TINT, dayLinkTints } from "./tint";

describe("dayLinkTints", () => {
  it("leaves a tint that already reads on white alone", () => {
    expect(dayLinkTints("#4a5b8c").light).toBe("#4a5b8c");
  });
  it("darkens a pale accent until white text reads on it", () => {
    const { light } = dayLinkTints("#cfae6e");
    expect(light).not.toBe("#cfae6e");
    expect(contrastRatio(light, "#ffffff")!).toBeGreaterThanOrEqual(4.5);
  });
  it("lightens a dark accent for dark mode until black text reads on it", () => {
    const { dark } = dayLinkTints("#2b2724");
    expect(contrastRatio(dark, "#000000")!).toBeGreaterThanOrEqual(4.5);
  });
  it("falls back for junk", () => {
    expect(dayLinkTints("nope").light).toBe(FALLBACK_TINT);
    expect(dayLinkTints(null).light).toBe(FALLBACK_TINT);
  });
});
