/**
 * Fixed palette for list.color (spec 03, section 7, decision 4). A free
 * color picker can produce something that clashes with the serif/cream
 * aesthetic already in src/lib/email/templates.ts and the print sheet, or
 * reads poorly as a calendar-day accent border — a small named set keeps
 * every list legible wherever its color shows up.
 *
 * Builds on tailwind.config.ts's existing palette (accent, tierA/B/C)
 * rather than inventing an unrelated set of hues.
 */
export const LIST_COLOR_PALETTE = [
  { name: "Slate", value: "#8a8580" },
  { name: "Clay", value: "#7c5c3e" },
  { name: "Moss", value: "#2f6f4f" },
  { name: "Amber", value: "#b07d2b" },
  { name: "Wine", value: "#8c3f4f" },
  { name: "Ink blue", value: "#3f5a7c" },
  { name: "Sage", value: "#4f7a5c" },
  { name: "Plum", value: "#6a4f7c" },
] as const;

export const DEFAULT_LIST_COLOR = "#8a8580";

export function isKnownListColor(value: string | null): boolean {
  return value !== null && LIST_COLOR_PALETTE.some((c) => c.value === value);
}
