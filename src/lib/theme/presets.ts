import { toRgbChannels, type PaletteTokens } from "./contrast";

/**
 * The theme system for the public site (spec 14 §5, extended by spec 25 Part C).
 *
 * Two presets are built now: `script`, the traditional stationery register,
 * and `editorial`. The remaining two are still declarations — adding one is a
 * stylesheet rather than a refactor, because the renderer reads tokens and
 * never a preset name.
 *
 * **Editorial is the default for a NEW wedding** (spec 25 Answered, question
 * 5); nothing already chosen changes, because the theme lives in a
 * `site_content` row that only `/site/theme` writes.
 *
 * Palettes are five tokens, deliberately the same five the planner app already
 * uses (`ink`, `paper`, `muted`, `line`, `accent`), so every existing
 * component themes for free when the CSS variables change under it.
 */

export const THEME_PRESET_IDS = ["script", "editorial", "deckle", "sans"] as const;
export type ThemePresetId = (typeof THEME_PRESET_IDS)[number];

export const HERO_STYLES = ["type", "framed", "full"] as const;
export type HeroStyle = (typeof HERO_STYLES)[number];

export type ThemePreset = {
  id: ThemePresetId;
  label: string;
  description: string;
  /** Built and shippable. Only `script` is, per Q3a. */
  available: boolean;
  defaultHero: HeroStyle;
};

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  script: {
    id: "script",
    label: "Script",
    description:
      "Traditional. A script face for the names and rules only, a humanist serif for everything else, centred, with a monogram.",
    available: true,
    defaultHero: "framed",
  },
  editorial: {
    id: "editorial",
    label: "Editorial",
    // The original declaration said "grotesque body". The reference this was
    // built against sets its body in a serif and uses the grotesque only for
    // metadata — a grotesque body reads noticeably colder, so the description
    // is corrected here rather than the build quietly diverging from it.
    description:
      "Magazine. High-contrast serif display, serif body, letterspaced labels, numbered sections.",
    available: true,
    defaultHero: "full",
  },
  deckle: {
    id: "deckle",
    label: "Deckle",
    description: "Letterpress stationery. Old-style serif throughout, warm off-white, generous leading.",
    available: false,
    defaultHero: "framed",
  },
  sans: {
    id: "sans",
    label: "Sans",
    description: "Modern and quiet. One geometric sans in two weights, tight grid, no ornament.",
    available: false,
    defaultHero: "type",
  },
};

export const PALETTE_IDS = ["ivory", "sage", "dusk", "claret", "slate", "ink"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export type Palette = { id: PaletteId; label: string; tokens: PaletteTokens };

/**
 * Every one of these passes `validatePalette` on all four text pairs, and
 * `theme.test.ts` asserts it rather than trusting that they were checked once.
 * Their `line` ratios sit around 1.2:1 against `paper`, which is what a
 * hairline rule is supposed to look like — see that function's note on why the
 * rule check is advisory.
 */
export const PALETTES: Record<PaletteId, Palette> = {
  ivory: {
    id: "ivory",
    label: "Ivory",
    tokens: { ink: "#2b2724", paper: "#fbf8f3", muted: "#6b625a", line: "#e7e0d5", accent: "#7a5c3c" },
  },
  sage: {
    id: "sage",
    label: "Sage",
    tokens: { ink: "#232a26", paper: "#f6f8f4", muted: "#5c665d", line: "#dde4da", accent: "#4a6b52" },
  },
  dusk: {
    id: "dusk",
    label: "Dusk",
    tokens: { ink: "#242630", paper: "#f7f7fa", muted: "#5f6373", line: "#dedfe8", accent: "#4e5680" },
  },
  claret: {
    id: "claret",
    label: "Claret",
    tokens: { ink: "#2c2222", paper: "#fbf6f5", muted: "#6d5c5c", line: "#e8dcda", accent: "#7d3b44" },
  },
  slate: {
    id: "slate",
    label: "Slate",
    tokens: { ink: "#1f2224", paper: "#f7f8f8", muted: "#5b6265", line: "#dfe3e4", accent: "#3f5a63" },
  },
  ink: {
    id: "ink",
    label: "Ink",
    tokens: { ink: "#1a1a1a", paper: "#fbfaf8", muted: "#5f5a55", line: "#e6e2dc", accent: "#6f5233" },
  },
};

export type SiteTheme = {
  preset: ThemePresetId;
  palette: PaletteId | "custom";
  /** Only read when `palette` is "custom". */
  customTokens: PaletteTokens | null;
  heroStyle: HeroStyle;
  /** The SVG monogram in the header and footer. Script only. */
  monogram: boolean;
};

/**
 * What a wedding with no saved theme gets.
 *
 * Editorial since spec 25 Part C. **This is only safe because `0028` wrote an
 * explicit `script` row for every wedding that existed when it ran** — without
 * that, moving this line would have restyled every site that had never opened
 * the theme editor. A future change to this default owes the same courtesy.
 *
 * `monogram` is false and `heroStyle` is `full`: the monogram is a Script
 * ornament, and Editorial's hero is a full-bleed photograph.
 */
export const DEFAULT_THEME: SiteTheme = {
  preset: "editorial",
  palette: "ivory",
  customTokens: null,
  heroStyle: "full",
  monogram: false,
};

/** What Script looked like when it was the default — used by its own tests. */
export const SCRIPT_THEME: SiteTheme = {
  preset: "script",
  palette: "ivory",
  customTokens: null,
  heroStyle: "framed",
  monogram: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function readCustomTokens(value: unknown): PaletteTokens | null {
  if (!isRecord(value)) return null;
  const keys = ["ink", "paper", "muted", "line", "accent"] as const;
  const out = {} as PaletteTokens;
  for (const key of keys) {
    const colour = value[key];
    if (typeof colour !== "string") return null;
    out[key] = colour;
  }
  return out;
}

/**
 * Read a theme out of `site_content['theme'].payload`.
 *
 * Never throws and never returns a partial theme. The payload is JSONB written
 * by an editor that has changed shape before and will again, and the failure
 * mode that matters is a guest seeing an unstyled page because one key was
 * renamed — so every field falls back independently to the default.
 */
export function resolveTheme(payload: unknown): SiteTheme {
  if (!isRecord(payload)) return DEFAULT_THEME;

  const preset = pick(payload["preset"], THEME_PRESET_IDS, DEFAULT_THEME.preset);
  const customTokens = readCustomTokens(payload["custom_tokens"]);
  const palette = pick(
    payload["palette"],
    [...PALETTE_IDS, "custom"] as const,
    DEFAULT_THEME.palette,
  );

  return {
    preset,
    // A theme saying "custom" with no usable tokens would render unstyled.
    palette: palette === "custom" && !customTokens ? DEFAULT_THEME.palette : palette,
    customTokens,
    heroStyle: pick(payload["hero_style"], HERO_STYLES, THEME_PRESETS[preset].defaultHero),
    monogram: typeof payload["monogram"] === "boolean" ? payload["monogram"] : DEFAULT_THEME.monogram,
  };
}

/** The five colours this theme actually renders with. */
export function themeTokens(theme: SiteTheme): PaletteTokens {
  if (theme.palette === "custom" && theme.customTokens) return theme.customTokens;
  const palette = theme.palette === "custom" ? null : PALETTES[theme.palette];
  return (palette ?? PALETTES[DEFAULT_THEME.palette as PaletteId]).tokens;
}

/**
 * The tokens as CSS custom properties, for the inline `style` on the site's
 * root element.
 *
 * Inline rather than a stylesheet because the values are per wedding and come
 * from the database — a static stylesheet cannot carry them, and a `<style>`
 * tag built by string concatenation would be an injection surface. React sets
 * these as real style properties, so nothing is parsed as CSS text.
 *
 * Values are RGB channels, not hex, so Tailwind's `<alpha-value>` works and
 * `bg-line/40` keeps meaning what it means everywhere else in the app.
 *
 * A token that will not parse is dropped rather than emitted broken: the
 * variable then falls through to the default in `globals.css`, which is a
 * readable page in the planner's palette. Emitting `rgb(undefined)` would
 * render text in the browser's default black on a transparent background,
 * which on a hero image is invisible.
 */
export function themeCssVars(theme: SiteTheme): Record<string, string> {
  const tokens = themeTokens(theme);
  const vars: Record<string, string> = {};
  for (const [name, hex] of Object.entries(tokens)) {
    const channels = toRgbChannels(hex);
    if (channels) vars[`--site-${name}`] = channels;
  }
  return vars;
}
