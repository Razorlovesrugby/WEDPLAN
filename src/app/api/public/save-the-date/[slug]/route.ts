import { buildAllDayIcs } from "@/lib/ics";
import { allDayRange, calendarEventTitle, saveTheDateDisplay } from "@/lib/site/save-the-date";
import { findWeddingBySlug } from "@/server/queries/site";
import { loadSaveTheDateContent } from "@/server/queries/save-the-date";

/**
 * The save-the-date's "Add to calendar", as an all-day .ics.
 *
 * Keyed by the wedding's slug, not a household address: it carries the names,
 * the date and the place, all of which the public site at `/w/<slug>` already
 * shows anyone with the link. Asking for a household's credential here would
 * buy nothing and would spend a throttle slot per tap.
 */

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const wedding = await findWeddingBySlug(slug);
  const range = allDayRange(wedding?.wedding_date ?? null);
  if (!wedding || !range) return new Response("Not found", { status: 404 });

  const { content } = await loadSaveTheDateContent(wedding.id);
  const display = saveTheDateDisplay(content, wedding);

  const ics = buildAllDayIcs({
    // Stable per wedding and date, so a guest who taps twice updates the one
    // entry rather than getting two — and a moved date is a new entry.
    id: `save-the-date-${wedding.id}-${range.start}`,
    name: calendarEventTitle(display.headline),
    start: range.start,
    end: range.end,
    location: display.location,
    description: display.message,
  });

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // Inline, not attachment: iOS Safari only offers "Add to Calendar" for
      // a calendar it is allowed to open. Desktop browsers still download it.
      "content-disposition": `inline; filename="save-the-date.ics"`,
      "cache-control": "no-store",
    },
  });
}
