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
            <li key={`${run.id}-${stop?.id ?? index}`} className="flex gap-2 text-[0.95rem]">
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

/** Re-exported so callers do not need two imports for one row of metadata. */
export { Label };
