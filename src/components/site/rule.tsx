/**
 * The floral rule (spec 14 §5): the theme's one decorative element, drawn once
 * and reused between sections.
 *
 * SVG rather than a character or an image — a text ornament depends on a font
 * that may not load, and an image cannot take the palette.
 */
export function FloralRule({ className }: { className?: string }) {
  return (
    <svg
      className={`mx-auto h-3 w-40 text-line ${className ?? ""}`}
      viewBox="0 0 160 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 6h58" strokeLinecap="round" />
      <path d="M102 6h58" strokeLinecap="round" />
      {/* A small four-petal centre: symmetrical, and legible at 40px wide. */}
      <path d="M80 2c2.2 0 4 1.8 4 4s-1.8 4-4 4-4-1.8-4-4 1.8-4 4-4Z" />
      <path d="M72 6c0-2.2 1.8-4 4-4M88 6c0 2.2-1.8 4-4 4" strokeLinecap="round" />
      <circle cx="68" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="92" cy="6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
