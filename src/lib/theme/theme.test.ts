import { describe, expect, it } from "vitest";
import {
  CONTRAST_BODY,
  contrastRatio,
  parseHex,
  relativeLuminance,
  roundRatio,
  validatePalette,
} from "./contrast";
import {
  DEFAULT_THEME,
  PALETTES,
  PALETTE_IDS,
  THEME_PRESETS,
  resolveTheme,
  themeCssVars,
  themeTokens,
} from "./presets";

describe("parseHex", () => {
  it("reads six-digit hex", () => {
    expect(parseHex("#7a5c3c")).toEqual({ r: 0x7a, g: 0x5c, b: 0x3c });
  });

  it("expands three-digit hex", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it("is case-insensitive and tolerates surrounding space", () => {
    expect(parseHex("  #7A5C3C ")).toEqual(parseHex("#7a5c3c"));
  });

  it("rejects anything that is not a hex colour", () => {
    for (const bad of ["7a5c3c", "#12345", "#gggggg", "rgb(0,0,0)", "", "#"]) {
      expect(parseHex(bad), bad).toBeNull();
    }
  });
});

describe("relativeLuminance", () => {
  // The two anchors WCAG's own examples use. If these drift, the linearisation
  // is wrong and every ratio below is quietly wrong with it.
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
  });

  it("is 1 for a colour against itself", () => {
    expect(contrastRatio("#7a5c3c", "#7a5c3c")).toBeCloseTo(1, 10);
  });

  it("does not depend on the order of its arguments", () => {
    expect(contrastRatio("#2b2724", "#fbf8f3")).toBe(contrastRatio("#fbf8f3", "#2b2724"));
  });

  it("returns null when either colour is unparseable", () => {
    expect(contrastRatio("nope", "#ffffff")).toBeNull();
    expect(contrastRatio("#ffffff", "nope")).toBeNull();
  });
});

describe("roundRatio", () => {
  // Rounds down, so a reported 4.5 is never really 4.497 — the number shown in
  // the editor has to be one you can trust against the threshold beside it.
  it("truncates rather than rounding to nearest", () => {
    expect(roundRatio(4.4999)).toBe(4.49);
    expect(roundRatio(4.5)).toBe(4.5);
    expect(roundRatio(21)).toBe(21);
  });
});

describe("validatePalette", () => {
  it("passes every shipped palette on all four text pairs", () => {
    for (const id of PALETTE_IDS) {
      const result = validatePalette(PALETTES[id].tokens);
      expect(result.failures, `${id}: ${result.failures.join(" ")}`).toEqual([]);
      expect(result.ok, id).toBe(true);
    }
  });

  it("reports every shipped palette's text pairs at or above 4.5:1", () => {
    for (const id of PALETTE_IDS) {
      const result = validatePalette(PALETTES[id].tokens);
      for (const check of result.checks.filter((c) => !c.advisory)) {
        expect(check.ratio, `${id} / ${check.pair}`).toBeGreaterThanOrEqual(CONTRAST_BODY);
      }
    }
  });

  it("fails a palette whose body text is too light", () => {
    const result = validatePalette({
      ink: "#bbbbbb",
      paper: "#ffffff",
      muted: "#555555",
      line: "#eeeeee",
      accent: "#555555",
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("ink on paper");
  });

  it("fails a palette whose accent is unreadable as a filled button", () => {
    // Light accent: fine as a link colour is what people check, and then the
    // button built from it turns out to be white-on-pale.
    const result = validatePalette({
      ink: "#1a1a1a",
      paper: "#ffffff",
      muted: "#5f5a55",
      line: "#e6e2dc",
      accent: "#d8c9a8",
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("paper on accent");
  });

  it("does not fail a palette for a faint hairline rule", () => {
    // The whole point of the advisory carve-out: ivory's rule is about 1.2:1
    // against its paper, which is what a hairline is meant to be.
    const result = validatePalette(PALETTES.ivory.tokens);
    const line = result.checks.find((c) => c.pair === "line on paper");
    expect(line?.advisory).toBe(true);
    expect(line?.passes).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("blocks on an unparseable colour even in the advisory slot", () => {
    const result = validatePalette({ ...PALETTES.ivory.tokens, line: "burgundy" });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toContain("not a valid colour");
  });
});

describe("resolveTheme", () => {
  it("returns the default for anything that is not an object", () => {
    for (const bad of [null, undefined, "theme", 42, [], true]) {
      expect(resolveTheme(bad)).toEqual(DEFAULT_THEME);
    }
  });

  it("reads a full payload", () => {
    expect(
      resolveTheme({ preset: "sans", palette: "slate", hero_style: "type", monogram: false }),
    ).toEqual({
      preset: "sans",
      palette: "slate",
      customTokens: null,
      heroStyle: "type",
      monogram: false,
    });
  });

  it("falls back per field rather than wholesale", () => {
    // One renamed key must not cost the page its whole theme.
    const theme = resolveTheme({ preset: "script", palette: "nonsense", hero_style: "full" });
    expect(theme.preset).toBe("script");
    expect(theme.palette).toBe(DEFAULT_THEME.palette);
    expect(theme.heroStyle).toBe("full");
  });

  it("defaults the hero to the preset's own default, not the global one", () => {
    expect(resolveTheme({ preset: "sans" }).heroStyle).toBe(THEME_PRESETS.sans.defaultHero);
    expect(resolveTheme({ preset: "editorial" }).heroStyle).toBe(THEME_PRESETS.editorial.defaultHero);
  });

  it("refuses a custom palette with no usable tokens", () => {
    // Otherwise the page renders with no colours at all.
    const theme = resolveTheme({ palette: "custom" });
    expect(theme.palette).toBe(DEFAULT_THEME.palette);
    expect(theme.customTokens).toBeNull();
  });

  it("refuses a custom palette that is missing one token", () => {
    const theme = resolveTheme({
      palette: "custom",
      custom_tokens: { ink: "#000", paper: "#fff", muted: "#555", line: "#eee" },
    });
    expect(theme.palette).toBe(DEFAULT_THEME.palette);
  });

  it("keeps a complete custom palette", () => {
    const tokens = { ink: "#111111", paper: "#ffffff", muted: "#555555", line: "#eeeeee", accent: "#334455" };
    const theme = resolveTheme({ palette: "custom", custom_tokens: tokens });
    expect(theme.palette).toBe("custom");
    expect(themeTokens(theme)).toEqual(tokens);
  });
});

describe("themeTokens", () => {
  it("resolves a named palette", () => {
    expect(themeTokens({ ...DEFAULT_THEME, palette: "claret" })).toEqual(PALETTES.claret.tokens);
  });

  it("falls back when a theme claims custom without tokens", () => {
    // resolveTheme prevents this, but themeTokens is exported and a caller
    // could construct one by hand.
    expect(themeTokens({ ...DEFAULT_THEME, palette: "custom", customTokens: null })).toEqual(
      PALETTES[DEFAULT_THEME.palette as "ivory"].tokens,
    );
  });
});

describe("themeCssVars", () => {
  it("emits all five tokens as site-scoped custom properties", () => {
    const vars = themeCssVars(DEFAULT_THEME);
    expect(Object.keys(vars).sort()).toEqual([
      "--site-accent",
      "--site-ink",
      "--site-line",
      "--site-muted",
      "--site-paper",
    ]);
  });

  it("emits RGB channels, not hex, so Tailwind opacity modifiers work", () => {
    // `bg-line/40` compiles to rgb(var(--site-line) / 0.4); a hex value there
    // produces an invalid colour and the element renders transparent.
    const vars = themeCssVars(DEFAULT_THEME);
    expect(vars["--site-accent"]).toBe("122 92 60"); // #7a5c3c
    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
  });

  it("drops a token that will not parse rather than emitting it broken", () => {
    // Falls through to the default in globals.css — a readable page — instead
    // of rgb(undefined), which renders invisible text over a hero image.
    const vars = themeCssVars({
      ...DEFAULT_THEME,
      palette: "custom",
      customTokens: { ...PALETTES.ivory.tokens, accent: "burgundy" },
    });
    expect(vars["--site-accent"]).toBeUndefined();
    expect(vars["--site-ink"]).toBeDefined();
  });
});
