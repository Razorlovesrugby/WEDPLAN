import type { IcsEvent } from "@/lib/ics";
import { listNames } from "@/lib/invites";

/**
 * A household's weekend, as one calendar file (spec 27 §7).
 *
 * "Your weekend, in one card" — what a guest actually wants is the ceremony,
 * the dinner and the brunch in their calendar without three downloads. The
 * events are the ones *they* are invited to (spec 22): this module never sees
 * the full list, only what the page already narrowed.
 *
 * Pure, so the day-grouping — which is where a timezone bug would live — is
 * tested rather than assumed.
 */

export type WeekendEvent = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  /** The planner's note for guests invited to this event (spec 21 §5.4). */
  guest_note?: string | null;
};

/** The route that serves it: `/api/public/weekend/<wedding>/<household address>`. */
export function weekendIcsPath(weddingSlug: string, addressSegment: string): string {
  return `/api/public/weekend/${weddingSlug}/${addressSegment}`;
}

/** Events with a start time, in the shape the calendar builders take. */
export function weekendIcsEvents(events: WeekendEvent[], weddingName: string): IcsEvent[] {
  return events.flatMap((event) => {
    if (!event.starts_at || Number.isNaN(new Date(event.starts_at).getTime())) return [];
    const note = event.guest_note?.trim();
    return [
      {
        id: event.id,
        name: event.name,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        location: [event.venue, event.address].filter(Boolean).join(", ") || null,
        // What guests were told about this event, then whose wedding it is.
        description: [note, weddingName].filter(Boolean).join("\n\n") || null,
      },
    ];
  });
}

/**
 * "3 events · Saturday 12 June and Sunday 13 June".
 *
 * Days are taken **in the wedding's own timezone**, never the server's or the
 * guest's: a reception that starts at 1am on the Sunday is the Saturday night
 * party to the people at it, and a server in UTC would file it under Friday.
 * Null when there is nothing dated to summarise.
 */
export function weekendSummary(events: WeekendEvent[], timeZone: string): string | null {
  const dated = events
    .filter((event) => event.starts_at && !Number.isNaN(new Date(event.starts_at).getTime()))
    .map((event) => new Date(event.starts_at as string))
    .sort((a, b) => a.getTime() - b.getTime());
  if (dated.length === 0) return null;

  // Assembled from parts: `en-NZ` writes "Saturday, 12 June" in some ICU
  // builds and "Saturday 12 June" in others, and the wording should not depend
  // on which Node the server happens to run.
  const dayParts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const day = {
    format(date: Date): string {
      const part = (type: string) => dayParts.formatToParts(date).find((p) => p.type === type)?.value ?? "";
      return `${part("weekday")} ${part("day")} ${part("month")}`;
    },
  };
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const date of dated) {
    const id = key.format(date);
    if (seen.has(id)) continue;
    seen.add(id);
    labels.push(day.format(date));
  }

  const count = dated.length === 1 ? "1 event" : `${dated.length} events`;
  return `${count} · ${listNames(labels)}`;
}
