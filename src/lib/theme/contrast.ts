/**
 * WCAG contrast, and the validator that stops a palette shipping unreadable
 * (spec 14 §5).
 *
 * This exists because the Script preset's natural palette — warm ivory paper,
 * soft grey ink — is exactly the one that looks beautiful in a design tool and
 * fails on a phone in daylight. A guest reading a coach departure time in a
 * car park is the actual use case, so the ratios are enforced at the point a
 * palette is saved rather than left to whoever picked the colours.
 *
 * Maths is WCAG 2.1's relative luminance and contrast ratio, which is simple
 * enough to implement correctly and wrong enough by eye not to guess at.
 */

export type Rgb = { r: number; g: number; b: number };

/** WCAG 2.1 minimums. Large text is >=18.66px bold or >=24px. */
export const CONTRAST_BODY = 4.5;
export const CONTRAST_LARGE = 3;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

export function parseHex(value: string): Rgb | null {
  const hex = value.trim();
  if (!HEX.test(hex)) return null;
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. Channels are linearised before weighting. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Contrast ratio between two colours, 1–21. Order does not matter: the
 * lighter of the two always ends up on top of the fraction.
 */
export function contrastRatio(a: string, b: string): number | null {
  const one = parseHex(a);
  const two = parseHex(b);
  if (!one || !two) return null;
  const lumA = relativeLuminance(one);
  const lumB = relativeLuminance(two);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded down to 2dp, so a reported 4.5 is never actually 4.497. */
export function roundRatio(ratio: number): number {
  return Math.floor(ratio * 100) / 100;
}

/**
 * `"43 39 36"` — the space-separated channels Tailwind's `<alpha-value>`
 * syntax needs. A custom property holding `#2b2724` cannot carry an opacity
 * modifier, and this codebase uses 62 of them (`bg-line/40`, `bg-ink/85`), so
 * the tokens travel as channels and are reassembled by `rgb()` in the config.
 */
export function toRgbChannels(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? `${rgb.r} ${rgb.g} ${rgb.b}` : null;
}

export type PaletteTokens = {
  ink: string;
  paper: string;
  muted: string;
  line: string;
  accent: string;
};

export type ContrastCheck = {
  pair: string;
  ratio: number;
  required: number;
  passes: boolean;
  note: string;
  /** Reported to the editor but never blocks a save. See validatePalette. */
  advisory: boolean;
};

export type PaletteValidation = {
  ok: boolean;
  checks: ContrastCheck[];
  /** Human-readable reasons, empty when ok. Safe to show in the editor. */
  failures: string[];
};

/**
 * The pairs that carry meaning on the page.
 *
 * **`line` against `paper` is advisory, not blocking**, and that is a
 * considered decision rather than an oversight. WCAG 1.4.11's 3:1 covers UI
 * components and graphical objects you need to perceive to understand the
 * content; a hairline rule between two sections is decoration, and the
 * headings either side of it already carry the structure. Enforcing 3:1 on it
 * would force every palette to draw its section rules in near-black — the
 * opposite of the look this theme exists to produce, and a change nobody
 * would accept, so it would simply get switched off. It is reported with its
 * real ratio so the number is visible when a rule genuinely vanishes.
 *
 * Everything that is text is blocking. No exceptions, including for a custom
 * palette somebody is attached to.
 */
export function validatePalette(tokens: PaletteTokens): PaletteValidation {
  const pairs: Array<[string, string, string, number, string, boolean]> = [
    ["ink on paper", tokens.ink, tokens.paper, CONTRAST_BODY, "body text", false],
    ["muted on paper", tokens.muted, tokens.paper, CONTRAST_BODY, "times, captions, help text", false],
    ["accent on paper", tokens.accent, tokens.paper, CONTRAST_BODY, "links", false],
    ["paper on accent", tokens.paper, tokens.accent, CONTRAST_BODY, "text inside a filled button", false],
    ["line on paper", tokens.line, tokens.paper, CONTRAST_LARGE, "rules and borders", true],
  ];

  const checks: ContrastCheck[] = pairs.map(([pair, a, b, required, note, advisory]) => {
    const ratio = contrastRatio(a, b);
    if (ratio === null) {
      // An unparseable colour blocks whatever it is used for, advisory or not:
      // it is not a contrast question, it is a value that cannot be rendered.
      return { pair, ratio: 0, required, passes: false, note: `${note} — not a valid colour`, advisory: false };
    }
    return { pair, ratio: roundRatio(ratio), required, passes: ratio >= required, note, advisory };
  });

  const failures = checks
    .filter((check) => !check.passes && !check.advisory)
    .map((check) => `${check.pair} is ${check.ratio}:1, needs ${check.required}:1 (${check.note}).`);

  return { ok: failures.length === 0, checks, failures };
}
