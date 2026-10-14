import {
  CONTRAST_BODY,
  contrastRatio,
  isHexColor,
  parseHex,
  roundRatio,
  toRgbChannels,
  validatePalette,
  type PaletteTokens,
} from "./contrast";

/**
 * Text colour and font, site-wide and per block (spec 31).
 *
 * Pure on purpose (repo convention: logic in `src/lib`, never inline in an
 * action). Three layers, most specific first:
 *
 *   a block's own colour/font   >   the site's override   >   the palette's own
 *
 * **The site override replaces `ink`, `muted` and `accent` themselves** (Q2: the
 * planner chose "everything ink"), so buttons, selected states and rules drawn
 * from those tokens follow the text. That is not a bug to fix later; the rail says
 * so. It is also why every override goes through `validatePalette` — the same gate
 * a palette passes — rather than a looser one for "just text".
 *
 * The save-the-date does not use any of this (Q3): it keeps its own colours.
 */

/** The faces a planner can choose — only ones already self-hosted (Q12). */
export const FONT_IDS = ["fraunces", "garamond", "inter"] as const;
export type FontId = (typeof FONT_IDS)[number];

export const FONT_CHOICES: Record<FontId, { label: string; note: string }> = {
  fraunces: { label: "Fraunces", note: "High-contrast serif" },
  garamond: { label: "EB Garamond", note: "Old-style serif" },
  inter: { label: "Inter", note: "Clean sans-serif" },
};

export function isFontId(value: unknown): value is FontId {
  return typeof value === "string" && (FONT_IDS as readonly string[]).includes(value);
}

export const TEXT_ROLES = ["ink", "muted", "accent"] as const;
export type TextRole = (typeof TEXT_ROLES)[number];
export type TextColours = Partial<Record<TextRole, string>>;

export type SiteTextStyle = {
  colours: TextColours;
  /**
   * "Same text style in every section" (Q8: on by default). While true, a block's
   * own colour and font are ignored; switching it **on** clears them (Q7), and
   * that clearing is the caller's job, behind a confirmation.
   */
  matchAll: boolean;
  fonts: { heading?: FontId; body?: FontId };
};

export const DEFAULT_TEXT_STYLE: SiteTextStyle = { colours: {}, matchAll: true, fonts: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Never throws; every field falls back on its own, like `resolveTheme`. */
export function resolveTextStyle(
  colours: unknown,
  fonts: unknown,
): SiteTextStyle {
  const out: SiteTextStyle = { colours: {}, matchAll: true, fonts: {} };
  if (isRecord(colours)) {
    for (const role of TEXT_ROLES) {
      const value = colours[role];
      if (typeof value === "string" && isHexColor(value)) out.colours[role] = value.trim();
    }
    if (colours["match_all"] === false) out.matchAll = false;
  }
  if (isRecord(fonts)) {
    if (isFontId(fonts["heading"])) out.fonts.heading = fonts["heading"];
    if (isFontId(fonts["body"])) out.fonts.body = fonts["body"];
  }
  return out;
}

/** The JSON stored under `text_colours` / `fonts`. Absent keys are omitted. */
export function serialiseTextStyle(style: SiteTextStyle): {
  text_colours: Record<string, unknown>;
  fonts: Record<string, unknown>;
} {
  return {
    text_colours: { ...style.colours, ...(style.matchAll ? {} : { match_all: false }) },
    fonts: { ...style.fonts },
  };
}

/** The palette's tokens with the site's text colours laid over them. */
export function applyTextColours(tokens: PaletteTokens, colours: TextColours): PaletteTokens {
  return {
    ...tokens,
    ...(colours.ink ? { ink: colours.ink } : {}),
    ...(colours.muted ? { muted: colours.muted } : {}),
    ...(colours.accent ? { accent: colours.accent } : {}),
  };
}

/**
 * Why these colours cannot be saved, or `[]`. This is `validatePalette` on the
 * merged tokens, so the editor, the action and any future caller cannot disagree.
 * Only the failures that involve a colour being overridden are reported, so a
 * palette that already had an advisory problem does not block an unrelated edit.
 */
export function textColourFailures(tokens: PaletteTokens, colours: TextColours): string[] {
  for (const role of TEXT_ROLES) {
    const value = colours[role];
    if (value !== undefined && !isHexColor(value)) return [`${role} is not a hex colour like #2b2724.`];
  }
  const merged = applyTextColours(tokens, colours);
  const touched = new Set(TEXT_ROLES.filter((role) => colours[role] !== undefined));
  if (touched.size === 0) return [];
  const result = validatePalette(merged);
  return result.checks
    .filter((check) => !check.passes && !check.advisory)
    .filter((check) => [...touched].some((role) => check.pair.includes(role)))
    .map((check) => `${check.pair} is ${check.ratio}:1, needs ${check.required}:1 (${check.note}).`);
}

/** A colour's contrast against paper, rounded down, for the swatch labels. */
export function ratioAgainst(colour: string, ground: string): number | null {
  const ratio = contrastRatio(colour, ground);
  return ratio === null ? null : roundRatio(ratio);
}

/** The CSS variables the site-wide overrides set on the page root. */
export function textColourVars(colours: TextColours): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of TEXT_ROLES) {
    const value = colours[role];
    const channels = value ? toRgbChannels(value) : null;
    if (channels) vars[`--site-${role}`] = channels;
  }
  return vars;
}

/* ------------------------------------------------------------------------- */
/* Per block                                                                 */
/* ------------------------------------------------------------------------- */

export type BlockTextStyle = {
  background?: "paper" | "tinted" | "ink" | "photograph";
  textColour?: string;
  mutedColour?: string;
};

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const part = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `top` laid over `base` at `pct` percent, in sRGB — what `color-mix` draws. */
function mix(top: string, base: string, pct: number): string | null {
  const a = parseHex(top);
  const b = parseHex(base);
  if (!a || !b) return null;
  const k = pct / 100;
  return toHex({
    r: a.r * k + b.r * (1 - k),
    g: a.g * k + b.g * (1 - k),
    b: a.b * k + b.b * (1 - k),
  });
}

/**
 * The colour behind a block's words, or `null` when it cannot be known (a
 * photograph). Matches `BACKGROUND_CLASS` in the renderer: tinted is the accent
 * at 8% over paper; an ink band is the site's ink.
 */
export function blockGround(
  background: BlockTextStyle["background"],
  tokens: PaletteTokens,
): string | null {
  switch (background ?? "paper") {
    case "paper":
      return tokens.paper;
    case "tinted":
      return mix(tokens.accent, tokens.paper, 8);
    case "ink":
      return tokens.ink;
    case "photograph":
      return null;
  }
}

export type BlockTextResult = {
  text?: string;
  muted?: string;
  /** Plain-English reasons a chosen colour is not being used. Empty when fine. */
  problems: string[];
  /** Over a photograph nothing can be checked; the inspector says so. */
  unchecked: boolean;
};

/**
 * The colours a block should actually render with.
 *
 * A colour that fails against the block's own ground is **dropped, not drawn**:
 * changing a block's background can strand a colour that was fine on the old one,
 * and an unreadable block is worse than an ignored setting. The stored value is
 * left alone so the inspector can flag it. Over a photograph there is nothing to
 * check against, so a valid hex always passes (Q4: advisory only).
 */
export function resolveBlockText(style: BlockTextStyle, tokens: PaletteTokens): BlockTextResult {
  const ground = blockGround(style.background, tokens);
  const result: BlockTextResult = { problems: [], unchecked: ground === null };
  const entries: Array<["text" | "muted", string | undefined, string]> = [
    ["text", style.textColour, "Text colour"],
    ["muted", style.mutedColour, "Secondary text"],
  ];
  for (const [key, value, label] of entries) {
    if (value === undefined) continue;
    if (!isHexColor(value)) {
      result.problems.push(`${label} isn't a valid colour.`);
      continue;
    }
    if (ground !== null) {
      const ratio = contrastRatio(value, ground);
      if (ratio === null || ratio < CONTRAST_BODY) {
        result.problems.push(
          `${label} is ${ratio === null ? 0 : roundRatio(ratio)}:1 on this background, needs ${CONTRAST_BODY}:1.`,
        );
        continue;
      }
    }
    result[key] = value.trim();
  }
  return result;
}

/**
 * The inline style a block's wrapper carries for the colours that passed.
 *
 * Where the colour goes depends on the ground, because `bg-ink` on an ink band is
 * the same token as the text colour: overriding `--site-ink` there would repaint
 * the band itself. So on an ink band the words get a plain `color`, on a
 * photograph the renderer replaces the fixed `onphoto` cream with `--block-text`,
 * and on paper or a tint `--site-ink` is overridden so the block's own buttons
 * follow its text, as they do site-wide (Q2).
 */
export function blockTextStyle(
  result: BlockTextResult,
  background: BlockTextStyle["background"],
): Record<string, string> {
  const style: Record<string, string> = {};
  const text = result.text ? toRgbChannels(result.text) : null;
  const muted = result.muted ? toRgbChannels(result.muted) : null;
  const ground = background ?? "paper";
  if (text && result.text) {
    if (ground === "photograph") style["--block-text"] = result.text;
    else if (ground === "ink") style["color"] = result.text;
    else style["--site-ink"] = text;
  }
  // A photograph forces one colour onto every descendant, so a secondary
  // colour there would be overridden anyway; it is not offered or applied.
  if (muted && ground !== "photograph") style["--site-muted"] = muted;
  return style;
}

/**
 * The curated swatches (Q5 also allows any hex). A mix of deep and pale so both
 * a light and a dark palette have choices that pass; the rail disables the ones
 * that do not pass on the palette in front of it rather than hiding them.
 */
export const TEXT_SWATCHES: Record<TextRole, Array<{ label: string; hex: string }>> = {
  ink: [
    { label: "Charcoal", hex: "#2b2724" },
    { label: "Forest", hex: "#1f3a2c" },
    { label: "Navy", hex: "#1d2b45" },
    { label: "Burgundy", hex: "#5a1f2b" },
    { label: "Plum", hex: "#3d2547" },
    { label: "Espresso", hex: "#3b2a20" },
    { label: "Cream", hex: "#efe8da" },
    { label: "Mist", hex: "#dfe6ee" },
  ],
  muted: [
    { label: "Warm grey", hex: "#6b625a" },
    { label: "Sage grey", hex: "#5c665d" },
    { label: "Slate", hex: "#5f6373" },
    { label: "Rosewood", hex: "#6d5c5c" },
    { label: "Pale sand", hex: "#a9a396" },
    { label: "Pale rose", hex: "#b09f92" },
  ],
  accent: [
    { label: "Bronze", hex: "#7a5c3c" },
    { label: "Moss", hex: "#4a6b52" },
    { label: "Indigo", hex: "#4e5680" },
    { label: "Claret", hex: "#7d3b44" },
    { label: "Teal", hex: "#3f5a63" },
    { label: "Gold", hex: "#cfae6e" },
    { label: "Copper", hex: "#d9915a" },
  ],
};

/**
 * The site-wide font choices as custom properties, spread **after** the
 * typography pairing so they win. Body applies to every theme (Q15); the heading
 * face only to the Editorial family, because on Script the heading face *is* the
 * theme and `--font-display` there would replace Pinyon on every heading. The
 * value is `var(--face-<name>)` — a name from `FONT_IDS`, never a stored string.
 */
export function fontChoiceVars(
  editorial: boolean,
  fonts: { heading?: FontId; body?: FontId },
): Record<string, string> {
  const vars: Record<string, string> = {};
  if (fonts.body) vars["--font-body"] = `var(--face-${fonts.body})`;
  if (fonts.heading && editorial) vars["--font-display"] = `var(--face-${fonts.heading})`;
  return vars;
}

/** Whether a page needs the faces Script would not otherwise load. */
export function usesExtraFaces(
  fonts: { heading?: FontId; body?: FontId },
  blockBodyFonts: Array<FontId | undefined>,
): boolean {
  return Boolean(fonts.body || fonts.heading || blockBodyFonts.some(Boolean));
}
