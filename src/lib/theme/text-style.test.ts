import { describe, expect, it } from "vitest";
import { PALETTES, PALETTE_IDS, DEFAULT_THEME, resolveTheme, siteTokens, themeTokens } from "./presets";
import {
  FONT_IDS,
  TEXT_SWATCHES,
  applyTextColours,
  blockGround,
  blockTextStyle,
  fontChoiceVars,
  resolveBlockText,
  resolveTextStyle,
  serialiseTextStyle,
  textColourFailures,
  textColourVars,
  usesExtraFaces,
} from "./text-style";
import { isHexColor } from "./contrast";

const ivory = PALETTES.ivory.tokens;
const midnight = PALETTES.midnight.tokens;

describe("resolveTextStyle", () => {
  it("reads as 'no overrides, matched everywhere' when nothing is stored", () => {
    expect(resolveTextStyle(undefined, undefined)).toEqual({ colours: {}, matchAll: true, fonts: {} });
    expect(resolveTheme(null).textStyle).toEqual({ colours: {}, matchAll: true, fonts: {} });
    expect(resolveTheme({ preset: "script", palette: "ivory" }).textStyle.matchAll).toBe(true);
  });

  it("keeps valid hex, valid fonts and an explicit match_all:false — and drops the rest per field", () => {
    const style = resolveTextStyle(
      { ink: "#1f3a2c", muted: "red", accent: 7, match_all: false },
      { heading: "fraunces", body: "comic-sans" },
    );
    expect(style).toEqual({ colours: { ink: "#1f3a2c" }, matchAll: false, fonts: { heading: "fraunces" } });
  });

  it("round-trips through the stored shape", () => {
    const style = { colours: { ink: "#1f3a2c" }, matchAll: false, fonts: { body: "inter" as const } };
    const stored = serialiseTextStyle(style);
    expect(resolveTextStyle(stored.text_colours, stored.fonts)).toEqual(style);
    // matched is the default and is not written, so an old reader sees nothing new.
    expect(serialiseTextStyle({ ...style, matchAll: true }).text_colours).not.toHaveProperty("match_all");
  });
});

describe("the site's palette is untouched by overrides (Q3)", () => {
  it("themeTokens ignores them — the save-the-date calls it — and siteTokens applies them", () => {
    const theme = {
      ...DEFAULT_THEME,
      textStyle: { colours: { ink: "#1f3a2c" }, matchAll: true, fonts: {} },
    };
    expect(themeTokens(theme)).toEqual(PALETTES.ivory.tokens);
    expect(siteTokens(theme).ink).toBe("#1f3a2c");
    expect(siteTokens(DEFAULT_THEME)).toEqual(themeTokens(DEFAULT_THEME));
  });
});

describe("textColourFailures", () => {
  it("accepts every swatch that is readable and refuses ones that are not, on each palette", () => {
    for (const id of PALETTE_IDS) {
      const tokens = PALETTES[id].tokens;
      // The palette's own ink always passes: it is what the palette is.
      expect(textColourFailures(tokens, { ink: tokens.ink })).toEqual([]);
      // Paper-on-paper is the worst case there is.
      expect(textColourFailures(tokens, { ink: tokens.paper }).length).toBeGreaterThan(0);
    }
  });

  it("is a dark-on-light question on Ivory and the opposite on Midnight", () => {
    expect(textColourFailures(ivory, { ink: "#1f3a2c" })).toEqual([]);
    expect(textColourFailures(ivory, { ink: "#efe8da" }).length).toBeGreaterThan(0);
    expect(textColourFailures(midnight, { ink: "#efe8da" })).toEqual([]);
    expect(textColourFailures(midnight, { ink: "#1f3a2c" }).length).toBeGreaterThan(0);
  });

  it("only reports the pairs involving a colour that was changed", () => {
    const failures = textColourFailures(ivory, { muted: "#dddddd" });
    expect(failures.length).toBe(1);
    expect(failures[0]).toContain("muted");
  });

  it("refuses something that is not a hex colour", () => {
    expect(textColourFailures(ivory, { ink: "navy" })[0]).toMatch(/not a hex/);
  });

  it("refuses a link colour that makes its own button label unreadable", () => {
    // 'paper on accent' is a blocking pair: the button's label is paper.
    expect(textColourFailures(ivory, { accent: "#f0e6d0" }).length).toBeGreaterThan(0);
  });

  it("applyTextColours changes only what it is given", () => {
    expect(applyTextColours(ivory, {})).toEqual(ivory);
    expect(applyTextColours(ivory, { ink: "#000000" })).toEqual({ ...ivory, ink: "#000000" });
  });
});

describe("the swatches", () => {
  it("are all valid hex, and there is a passing one for every palette and role", () => {
    for (const role of ["ink", "muted", "accent"] as const) {
      for (const swatch of TEXT_SWATCHES[role]) expect(isHexColor(swatch.hex), swatch.label).toBe(true);
      for (const id of PALETTE_IDS) {
        const tokens = PALETTES[id].tokens;
        const usable = TEXT_SWATCHES[role].filter((s) => textColourFailures(tokens, { [role]: s.hex }).length === 0);
        expect(usable.length, `${role} on ${id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("blockGround", () => {
  it("is the page's paper, a tint of accent over paper, the site's ink, or unknowable", () => {
    expect(blockGround(undefined, ivory)).toBe(ivory.paper);
    expect(blockGround("paper", ivory)).toBe(ivory.paper);
    expect(blockGround("ink", ivory)).toBe(ivory.ink);
    expect(blockGround("photograph", ivory)).toBeNull();
    const tint = blockGround("tinted", ivory);
    expect(tint).not.toBe(ivory.paper);
    expect(isHexColor(tint as string)).toBe(true);
  });
});

describe("resolveBlockText", () => {
  it("checks a colour against the block's own ground, so one swatch can pass on one block and fail on the next", () => {
    const dark = "#1f3a2c";
    expect(resolveBlockText({ background: "paper", textColour: dark }, ivory).text).toBe(dark);
    const onBand = resolveBlockText({ background: "ink", textColour: dark }, ivory);
    expect(onBand.text).toBeUndefined();
    expect(onBand.problems[0]).toMatch(/needs 4.5:1/);
    expect(resolveBlockText({ background: "ink", textColour: "#fbf8f3" }, ivory).text).toBe("#fbf8f3");
  });

  it("drops a colour stranded by a background change, rather than drawing it", () => {
    const result = resolveBlockText({ background: "paper", textColour: "#f4f0e8" }, ivory);
    expect(result.text).toBeUndefined();
    expect(result.problems.length).toBe(1);
  });

  it("never blocks over a photograph — nothing can be checked — but says so", () => {
    const result = resolveBlockText({ background: "photograph", textColour: "#f4f0e8" }, ivory);
    expect(result.text).toBe("#f4f0e8");
    expect(result.unchecked).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("still refuses a value that is not a colour, anywhere", () => {
    expect(resolveBlockText({ background: "photograph", textColour: "navy" }, ivory).problems.length).toBe(1);
  });
});

describe("blockTextStyle", () => {
  const passing = { text: "#1f3a2c", muted: "#5c665d", problems: [], unchecked: false };

  it("overrides ink on paper and tint so the block's buttons follow its text", () => {
    expect(blockTextStyle(passing, "paper")).toEqual({ "--site-ink": "31 58 44", "--site-muted": "92 102 93" });
    expect(blockTextStyle(passing, "tinted")["--site-ink"]).toBe("31 58 44");
  });

  it("never overrides ink on a dark band — that is the band's own background", () => {
    const style = blockTextStyle(passing, "ink");
    expect(style).not.toHaveProperty("--site-ink");
    expect(style["color"]).toBe("#1f3a2c");
  });

  it("uses a plain variable over a photograph and ignores the secondary colour there", () => {
    const style = blockTextStyle(passing, "photograph");
    expect(style).toEqual({ "--block-text": "#1f3a2c" });
  });

  it("is empty when the block has nothing of its own", () => {
    expect(blockTextStyle({ problems: [], unchecked: false }, "paper")).toEqual({});
  });
});

describe("textColourVars", () => {
  it("emits channels for valid colours only", () => {
    expect(textColourVars({ ink: "#1f3a2c" })).toEqual({ "--site-ink": "31 58 44" });
    expect(textColourVars({ ink: "nope" })).toEqual({});
  });
});

describe("fonts", () => {
  it("applies the body font to every theme and the heading font to Editorial only", () => {
    expect(fontChoiceVars(false, { body: "inter", heading: "fraunces" })).toEqual({ "--font-body": "var(--face-inter)" });
    expect(fontChoiceVars(true, { body: "inter", heading: "fraunces" })).toEqual({
      "--font-body": "var(--face-inter)",
      "--font-display": "var(--face-fraunces)",
    });
    expect(fontChoiceVars(true, {})).toEqual({});
  });

  it("loads the extra faces only when something asks for one", () => {
    expect(usesExtraFaces({}, [undefined, undefined])).toBe(false);
    expect(usesExtraFaces({ body: "inter" }, [])).toBe(true);
    expect(usesExtraFaces({}, [undefined, "garamond"])).toBe(true);
  });

  it("offers exactly the faces next/font hosts", () => {
    expect([...FONT_IDS].sort()).toEqual(["fraunces", "garamond", "inter"]);
  });
});
