import { googleEventUrl } from "@/lib/ics";
import {
  weekendIcsEvents,
  weekendIcsPath,
  weekendSummary,
  type WeekendEvent,
} from "@/lib/site/weekend";
import { Label } from "./section";

/**
 * "Keep your weekend" — one tap to put every event they are invited to in
 * their calendar (spec 27 §7).
 *
 * Server-rendered and JavaScript-free: a link to the household's own `.ics`,
 * and a native `<details>` for Google, which has no multi-event link and so
 * gets one beneath for each event. It renders only on a household's own page
 * (the caller passes `personal`'s events), and only when there is something
 * dated to add.
 */
export function WeekendCalendar({
  events,
  timeZone,
  weddingName,
  weddingSlug,
  addressSegment,
}: {
  events: WeekendEvent[];
  timeZone: string;
  weddingName: string;
  weddingSlug: string;
  /** The household's own address, which is the credential for the file. */
  addressSegment: string | null;
}) {
  const summary = weekendSummary(events, timeZone);
  const ics = weekendIcsEvents(events, weddingName);
  // Nothing dated, or no address to build a link from (a preview of a household
  // that has none): there is nothing honest to offer, so offer nothing.
  if (!summary || ics.length === 0 || !addressSegment) return null;

  return (
    <div className="site-weekend mt-10 border border-line p-5 text-center">
      <Label className="site-eyebrow">Your weekend</Label>
      <p className="mt-2 text-[1.0625rem] text-ink">{summary}</p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {/* No `download` attribute: on an iPhone that saves the file into Files
            instead of opening the "Add to Calendar" sheet. */}
        <a href={weekendIcsPath(weddingSlug, addressSegment)} className="std-button">
          Add all to calendar
        </a>
      </div>

      <details className="mt-4 text-left">
        <summary className="cursor-pointer text-center text-[0.9rem] text-muted">
          Google Calendar, one at a time
        </summary>
        <ul className="mt-3 space-y-1.5 text-[0.95rem]">
          {ics.map((event) => (
            <li key={event.id}>
              <a
                href={googleEventUrl(event)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent underline underline-offset-2"
              >
                {event.name}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
