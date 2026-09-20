import { formatTime } from "@/lib/format";
import { Label } from "./section";

/**
 * The on-the-day run-down (spec 21 §5.4).
 *
 * One note per event, stitched together from the events this household is
 * actually invited to, in time order — so a ceremony-only household reads the
 * ceremony's note and never learns there was one about Sunday breakfast.
 *
 * **This is not the run sheet.** `/run-sheet` is the couple's own document:
 * vendor calls, supplier phone numbers, who is carrying the rings. This is
 * the couple talking to a guest, and the two must never share rows.
 */
export function OnTheDay({
  events,
  timeZone,
}: {
  events: { id: string; name: string; starts_at: string | null; guest_note: string | null }[];
  timeZone: string;
}) {
  const withNotes = events.filter((event) => event.guest_note?.trim());
  if (withNotes.length === 0) return null;

  return (
    <ol className="space-y-6">
      {withNotes.map((event) => (
        <li key={event.id} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-xl text-ink">{event.name}</p>
            {event.starts_at ? <Label>{formatTime(event.starts_at, timeZone)}</Label> : null}
          </div>
          <p className="mt-2 whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink">
            {event.guest_note}
          </p>
        </li>
      ))}
    </ol>
  );
}
