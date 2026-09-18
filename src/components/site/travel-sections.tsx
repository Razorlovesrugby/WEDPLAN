import { Label } from "./section";
import { formatTime } from "@/lib/format";
import { availability } from "@/lib/travel/coach";
import type { CoachRun } from "@/server/queries/travel";
import type { AccommodationRow, TransportOptionRow } from "@/lib/types/database";

/**
 * Getting there, and where to stay, on the public site (spec 14 §7).
 *
 * The coach is the part with a headcount and a departure time, so it renders
 * first and in the most detail. Everything else at a local wedding is a
 * sentence and a link.
 */

const TRANSPORT_HEADING: Record<TransportOptionRow["kind"], string> = {
  parking: "Parking",
  taxi: "Taxis",
  train: "By train",
  walk: "On foot",
  other: "Also",
};

export function CoachSection({
  runs,
  timeZone,
  bookable,
}: {
  runs: CoachRun[];
  timeZone: string;
  /** The RSVP page passes true; the public site shows it read-only. */
  bookable: boolean;
}) {
  if (runs.length === 0) return null;

  return (
    <div className="space-y-8">
      {runs.map((run) => {
        const seats = availability(run);
        return (
          <div key={run.id} className="border-t border-line pt-6 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-xl text-ink">{run.label}</p>
              {run.departs_at ? <Label>Leaves {formatTime(run.departs_at, timeZone)}</Label> : null}
            </div>

            {run.notes ? (
              <p className="mt-1.5 whitespace-pre-line text-[0.95rem] text-muted">{run.notes}</p>
            ) : null}

            {run.stops.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {run.stops.map((stop) => (
                  <li key={stop.id} className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-[1.0625rem] text-ink">{stop.name}</span>
                    {stop.pickup_at ? (
                      <Label>{formatTime(stop.pickup_at, timeZone)}</Label>
                    ) : null}
                    {stop.map_url ? (
                      <a
                        className="text-[0.85rem] text-accent underline underline-offset-2"
                        href={stop.map_url}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        Map
                      </a>
                    ) : null}
                    {stop.address ? (
                      <span className="w-full text-[0.9rem] text-muted">{stop.address}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-3 text-[0.85rem] text-muted">
              {seats.label}
              {seats.full ? " — full" : null}
            </p>

            {!bookable ? (
              <p className="mt-1 text-[0.85rem] text-muted">
                Reserve seats from the link in your invitation.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TransportList({ options }: { options: TransportOptionRow[] }) {
  if (options.length === 0) return null;

  // Grouped by kind, in the order the kinds are declared rather than
  // alphabetically: parking is the most-asked question at a local wedding.
  const order: TransportOptionRow["kind"][] = ["parking", "taxi", "train", "walk", "other"];
  const grouped = order
    .map((kind) => ({ kind, items: options.filter((option) => option.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <div key={group.kind}>
          <h3 className="text-[0.78rem] uppercase tracking-[0.18em] text-muted">
            {TRANSPORT_HEADING[group.kind]}
          </h3>
          <ul className="mt-2 space-y-3">
            {group.items.map((option) => (
              <li key={option.id}>
                <p className="text-[1.0625rem] text-ink">{option.name}</p>
                {option.detail ? (
                  <p className="text-[0.95rem] leading-relaxed text-muted">{option.detail}</p>
                ) : null}
                {option.url ? (
                  <a
                    className="text-[0.9rem] text-accent underline underline-offset-2"
                    href={option.url}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    More
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function StaysList({ stays }: { stays: AccommodationRow[] }) {
  if (stays.length === 0) return null;

  return (
    <ul className="space-y-6">
      {stays.map((stay) => (
        <li key={stay.id} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-xl text-ink">{stay.name}</p>
            {stay.distance_label ? <Label>{stay.distance_label}</Label> : null}
          </div>
          {stay.address ? <p className="text-[0.95rem] text-muted">{stay.address}</p> : null}
          {stay.notes ? (
            <p className="mt-1.5 whitespace-pre-line text-[0.95rem] leading-relaxed text-muted">
              {stay.notes}
            </p>
          ) : null}
          {stay.url ? (
            <a
              className="mt-1.5 inline-block text-[0.9rem] text-accent underline underline-offset-2"
              href={stay.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              Book
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
