/**
 * The top bar (spec 28 §5.2): the couple's initials on the left, an RSVP button
 * on the right, and nothing in between.
 *
 * It used to carry every section's title and collapse into a Menu sheet on a
 * phone. The couple's reading was that there is no "main site" to find your way
 * round — the page is an invitation, and getting about it is scrolling and the
 * chapter list down the side — so the section list and its sheet are gone, at
 * every width. What is left is thin, sticky, in the page's own paper and line,
 * so it reads as part of the invitation rather than a website header.
 *
 *   R & O                                                [ RSVP ]
 *
 * The initials link back to the top. The button goes to the reply form and
 * reads **Your reply** once they have answered (`navRsvpLabel`). On a phone it
 * hides while the bottom reply bar is showing, so there are never two
 * (`.site-nav-rsvp` in `globals.css`, switched by `ReplyBar`).
 *
 * Plain markup with no state, so it is a server component.
 */
export function SiteNav({
  mark,
  rsvpLabel,
  rsvpHref = "#rsvp",
}: {
  mark: React.ReactNode;
  /** Null when the page has no reply section for the button to point at. */
  rsvpLabel: string | null;
  rsvpHref?: string;
}) {
  return (
    <nav
      aria-label="Top of the page"
      className="site-nav sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <a href="#hero" className="shrink-0 text-ink" aria-label="Back to the top">
          {mark}
        </a>

        {rsvpLabel ? (
          <a
            href={rsvpHref}
            className="site-nav-rsvp rounded-sm border border-accent px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.12em] text-accent hover:bg-accent hover:text-paper"
          >
            {rsvpLabel}
          </a>
        ) : null}
      </div>
    </nav>
  );
}
