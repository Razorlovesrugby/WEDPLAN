/**
 * The thin line across the top of the page that fills as the guest scrolls
 * (spec 27 §6, "reading line").
 *
 * Always in the markup and drawn by nothing: `globals.css` shows it only when
 * the page root's `data-fx` lists `reading_line`, binds it to the document's
 * scroll with `animation-timeline: scroll()`, and does so only where that is
 * supported and the guest has not asked for reduced motion. So a browser
 * without the feature, a Still page and a reduced-motion reader all see no
 * line at all, rather than an empty bar or one stuck at zero.
 *
 * No JavaScript: nothing here listens to scroll.
 */
export function ReadingLine() {
  return <div className="site-progress" aria-hidden="true" />;
}
