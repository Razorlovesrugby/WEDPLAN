import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, type SiteTheme } from "@/lib/theme/presets";
import { blockTextLook, NO_TEXT_LOOK } from "./text-look";

const theme = (matchAll: boolean): SiteTheme => ({
  ...DEFAULT_THEME,
  textStyle: { colours: {}, matchAll, fonts: {} },
});

describe("blockTextLook", () => {
  it("ignores a block's own colour and font while the site is matched everywhere", () => {
    const look = blockTextLook({ textColour: "#1f3a2c", bodyFont: "inter" }, theme(true), false);
    expect(look).toBe(NO_TEXT_LOOK);
  });

  it("applies them once the switch is off", () => {
    const look = blockTextLook({ textColour: "#1f3a2c", bodyFont: "inter" }, theme(false), false);
    expect(look.style).toMatchObject({ "--site-ink": "31 58 44", "--font-body": "var(--face-inter)" });
    expect(look.ownInk).toBe(true);
    expect(look.ownFont).toBe(true);
  });

  it("does nothing for a block that has no choices of its own", () => {
    expect(blockTextLook({ background: "tinted" }, theme(false), false)).toBe(NO_TEXT_LOOK);
  });

  it("treats a photograph block with a missing photo as paper, and checks it as paper", () => {
    // Pale on paper would be unreadable; with the photo missing the block draws as paper.
    const look = blockTextLook({ background: "photograph", textColour: "#f4f0e8" }, theme(false), false);
    expect(look).toBe(NO_TEXT_LOOK);
    const withPhoto = blockTextLook({ background: "photograph", textColour: "#f4f0e8" }, theme(false), true);
    expect(withPhoto.photoColour).toBe(true);
    expect(withPhoto.style).toMatchObject({ "--block-text": "#f4f0e8" });
  });

  it("drops a colour that fails on its own background but keeps the font", () => {
    const look = blockTextLook({ background: "ink", textColour: "#1f3a2c", bodyFont: "garamond" }, theme(false), false);
    expect(look.ownInk).toBe(false);
    expect(look.style).toEqual({ "--font-body": "var(--face-garamond)" });
  });
});
