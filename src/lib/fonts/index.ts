import localFont from "next/font/local";

/**
 * The public site's faces (spec 14 §5).
 *
 * Self-hosted rather than fetched from Google at runtime. A third-party font
 * request from a guest site leaks every visitor's IP to a third party and
 * costs a render-blocking round trip on a phone; `next/font/local` also means
 * the build needs no network, so a CI box without egress still produces a
 * correct page.
 *
 * Latin and latin-ext only. That covers the names this will meet and keeps
 * the two families under 300KB combined; a guest list in a non-Latin script
 * would need its subset adding here.
 *
 * `display: "swap"` on both: the alternative is a hero that renders blank for
 * a beat on a slow connection, and the couple's names arriving late is worse
 * than them arriving in a fallback and reflowing.
 */

/** Display only — the couple's names and the ornamental rules. Never body. */
export const script = localFont({
  src: [
    { path: "./PinyonScript-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./PinyonScript-400-latin-ext.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-script",
  display: "swap",
  // Pinyon's own metrics are small for its point size, so an unstyled
  // fallback would reflow noticeably. Cursive is the closest generic.
  fallback: ["Snell Roundhand", "Apple Chancery", "cursive"],
  adjustFontFallback: false,
});

/**
 * Body, headings and labels. A variable font: one file carries 400–800, which
 * is why there is no separate 500 or 600 here — Google serves the identical
 * file for each weight and the browser interpolates.
 */
export const body = localFont({
  src: [
    { path: "./EBGaramond-latin.woff2", weight: "400 800", style: "normal" },
    { path: "./EBGaramond-latin-ext.woff2", weight: "400 800", style: "normal" },
    { path: "./EBGaramond-italic-latin.woff2", weight: "400 800", style: "italic" },
    { path: "./EBGaramond-italic-latin-ext.woff2", weight: "400 800", style: "italic" },
  ],
  variable: "--font-body",
  display: "swap",
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
});

/**
 * Editorial's display face (spec 25 Part C).
 *
 * Fraunces is variable on two axes — weight and OPTICAL SIZE — which is the
 * reason it is here rather than one of the obvious alternatives. Optical
 * sizing is what lets one file be genuinely high-contrast at a 96px headline
 * and still readable at 24px; a single-master didone has to choose, and
 * whichever it chooses is wrong at the other end. `font-optical-sizing: auto`
 * (the browser default) drives it, so nothing has to be set per element.
 *
 * SIL Open Font License, self-hosted for the same reasons as the two above.
 */
export const display = localFont({
  src: [
    { path: "./Fraunces-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./Fraunces-latin-ext.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
});

/**
 * Editorial's label face — `04 · ATTIRE`, `5.00PM`, `CASUAL SUMMER`.
 *
 * A grotesque rather than a third serif, on purpose: the whole effect of this
 * theme is the contrast between a high-contrast display serif and small
 * letterspaced metadata, and metadata set in a serif reads as more body text.
 *
 * SIL Open Font License.
 */
export const label = localFont({
  src: [
    { path: "./Inter-latin.woff2", weight: "400 700", style: "normal" },
    { path: "./Inter-latin-ext.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-label",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
});

/**
 * The font variable classes a given theme needs on the site's root element.
 *
 * Only Editorial loads Fraunces and Inter. That is not a size optimisation —
 * it is what keeps the Script theme looking like itself: `.site-heading`
 * resolves `var(--font-display, var(--font-script))`, so a page that never
 * defines `--font-display` falls back to Pinyon exactly as it did before
 * spec 25 existed.
 */
export function siteFontClasses(preset: string): string {
  const base = `${script.variable} ${body.variable}`;
  return preset === "editorial" ? `${base} ${display.variable} ${label.variable}` : base;
}
