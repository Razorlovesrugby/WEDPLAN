import { Label } from "./section";
import { formatTime } from "@/lib/format";
import { eventDressCode, type DressCode } from "@/lib/site/dress-codes";
import type { CoachRun } from "@/server/queries/travel";

/**
 * The things that belong inside an event, not in a section of their own
 * (spec 25 §6).
 *
 * This is the whole thesis of that spec in one file. A guest reading "Welcome
 * Dinner, 7pm" wants to know how they get there and what to wear, and the page
 * used to answer both questions several screens away, in a travel block and an
 * attire block they had to cross-reference themselves.
 *
 * Both renderings share this component because the shared site and a
 * household's own page must agree about an event. Two copies is how the
 * personalised page quietly stops showing the shuttle.
 */

/** The dress code's NAME, as a tag. The guidance lives in the attire block. */
export function DressCodeTag({
  event,
  codes,
  fallback,
}: {
  event: { id: string; dress_code_id?: string | null };
  codes: DressCode[];
  /**
   * The old per-event string from the schedule block's payload.
   *
   * 0026 lifts these into rows, but only for weddings that had a schedule
   * block when it ran. A wedding whose planner typed one afterwards — or one
   * whose backfill found nothing — still has the string, and dropping it here
   * would look like the feature deleted their work.
   */
  fallback?: string | null;
}) {
  const code = eventDressCode(event, codes);
  const label = code?.name ?? fallback?.trim();
  if (!label) return null;

  return (
    <p className="mt-2">
      <span className="site-label">{label}</span>
    </p>
  );
}

/**
 * The coach runs serving this event, with their stops and times.
 *
 * A run with no `event_id` is not shown here — it serves the weekend rather
 * than this event, and it keeps rendering in the coach block exactly as every
 * run did before 0026.
 */
export function ShuttleLines({
  runs,
  timeZone,
}: {
  runs: CoachRun[];
  timeZone: string;
}) {
  if (runs.length === 0) return null;

  return (
    <ul className="mt-3 space-y-2">
      {runs.flatMap((run) =>
        // A run with no stops still tells a guest something — when it leaves —
        // so it renders as one line rather than disappearing.
        (run.stops.length > 0 ? run.stops : [null]).map((stop, index) => {
          const at = stop?.pickup_at ?? run.departs_at;
          return (
            <li key={`${run.id}-${stop?.id ?? index}`} className="site-shuttle flex gap-2 text-[0.95rem]">
              <span aria-hidden="true" className="text-muted">
                ↳
              </span>
              <span>
                {at ? <span className="site-label mr-2">{formatTime(at, timeZone)}</span> : null}
                <span className="site-label">{stop?.name ?? run.label}</span>
                {stop ? (
                  <span className="mt-0.5 block text-muted">{run.label}</span>
                ) : null}
              </span>
            </li>
          );
        }),
      )}
    </ul>
  );
}

/** Group runs by the event they serve. Runs serving the weekend are dropped. */
export function runsByEvent(runs: CoachRun[]): Map<string, CoachRun[]> {
  const byEvent = new Map<string, CoachRun[]>();
  for (const run of runs) {
    if (!run.event_id) continue;
    const list = byEvent.get(run.event_id);
    if (list) list.push(run);
    else byEvent.set(run.event_id, [run]);
  }
  return byEvent;
}

/**
 * One itinerary row, Editorial's three-column version.
 *
 * `minmax(84px,120px) minmax(0,1fr) minmax(0,auto)` — the time, the event,
 * and the dress code hard right. The grid itself is in `globals.css` under
 * `[data-site-theme="editorial"]`; this is only the markup it needs, which is
 * three children instead of a stack.
 *
 * It takes slots rather than an event, because the shared site's row and a
 * household's row carry different extras — a map link and a calendar link on
 * one, "For Chidi and Ada" on the other — and the thing they must share is
 * the grid, not the content. Two copies of the grid is how one of them ends
 * up with a different time column.
 */
export function EditorialEventRow({
  time,
  name,
  children,
  aside,
}: {
  time: React.ReactNode;
  name: string;
  /** Column two, under the name: venue, address, shuttle, whatever the caller has. */
  children?: React.ReactNode;
  /** Column three, right-aligned. The dress code, in practice. */
  aside?: React.ReactNode;
}) {
  return (
    <li className="site-event">
      <div className="site-event-time">{time}</div>
      <div className="site-event-body">
        <p className="site-event-name site-heading text-xl text-ink">{name}</p>
        {children}
      </div>
      <div className="site-event-aside">{aside}</div>
    </li>
  );
}

/** Re-exported so callers do not need two imports for one row of metadata. */
export { Label };
