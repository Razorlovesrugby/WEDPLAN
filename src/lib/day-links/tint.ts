import { contrastRatio, parseHex } from "@/lib/theme/contrast";

/**
 * The wedding's accent as the tint of a day link (spec 54 §5.2): it colours
 * the primary button, the progress and the links, so it must read with white
 * text on it (light mode) or black text on it (dark mode) at 4.5:1. A tint
 * that can't is darkened (or lightened, in dark mode) until it does.
 */

export const FALLBACK_TINT = "#0a62c9";

const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

function mix(hex: string, towards: 0 | 255, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const m = (c: number) => c + (towards - c) * amount;
  return `#${toHex(m(rgb.r))}${toHex(m(rgb.g))}${toHex(m(rgb.b))}`;
}

function until(hex: string, towards: 0 | 255, against: string): string {
  let out = hex;
  for (let step = 0; step < 40; step++) {
    const ratio = contrastRatio(out, against);
    if (ratio !== null && ratio >= 4.5) return out;
    out = mix(out, towards, 0.06);
  }
  return out;
}

export function dayLinkTints(accent: string | null | undefined): { light: string; dark: string } {
  const base = accent && parseHex(accent) ? accent : FALLBACK_TINT;
  return {
    light: until(base, 0, "#ffffff"),
    dark: until(base, 255, "#000000"),
  };
}
