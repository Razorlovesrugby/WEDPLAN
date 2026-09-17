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
