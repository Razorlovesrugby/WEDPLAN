/**
 * Fixed palette for list.color (spec 03, section 7, decision 4; replaced
 * spec 7). A free color picker can produce something that clashes with the
 * serif/cream aesthetic already in src/lib/email/templates.ts and the print
 * sheet, or reads poorly as a calendar-day accent border — a small named set
 * keeps every list legible wherever its color shows up. Only ever used as a
 * swatch/dot/border-left accent (never as a background behind text), so
 * saturated jewel tones are safe here without a contrast check.
 *
 * Spec 7: the original set (Slate/Clay/Moss/Amber/Wine/Ink blue/Sage/Plum)
 * read as muted and beige — replaced with a cooler, more saturated set
 * spanning pink, red, and blue (plus violet and teal for spread) per the
 * planner's direct request.
 */
export const LIST_COLOR_PALETTE = [
  { name: "Rose", value: "#e8558f" },
  { name: "Ruby", value: "#d43f4f" },
  { name: "Cobalt", value: "#2f6fd4" },
  { name: "Sky", value: "#2f9bd6" },
  { name: "Fuchsia", value: "#c239a4" },
  { name: "Crimson", value: "#b8123a" },
  { name: "Violet", value: "#7c3fd4" },
  { name: "Teal", value: "#1f9e8e" },
] as const;

export const DEFAULT_LIST_COLOR = "#e8558f";

export function isKnownListColor(value: string | null): boolean {
  return value !== null && LIST_COLOR_PALETTE.some((c) => c.value === value);
}

/**
 * A left-border accent can't render an emoji, so a list whose icon wins
 * (spec 16 §2) falls back to this neutral border instead of drawing its
 * color — the icon itself renders inline in the card's text. Matches the
 * app's own `--site-line` design token (src/app/globals.css) rather than a
 * separate hardcoded gray.
 */
export const NEUTRAL_BORDER_COLOR = "rgb(var(--site-line))";

/** What a card's border-left accent should be — the list's color, or neutral once an icon wins over it. */
export function listAccentBorderColor(color: string | null, icon: string | null): string {
  return icon ? NEUTRAL_BORDER_COLOR : (color ?? DEFAULT_LIST_COLOR);
}
