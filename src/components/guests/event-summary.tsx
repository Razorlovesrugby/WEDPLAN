"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReplyCounts } from "@/lib/guest-table";

/**
 * One card per event above the guest table (spec 47 §4.4): how many are
 * coming, and a bar of the replies so far.
 *
 * Each part of the bar is a link to exactly the guests it counts,
 * the way the dashboard's tiles work, so "who hasn't answered the reception?"
 * is one click. Clicking the part already showing clears it. The counts are
 * for the whole wedding, not the filtered list, so the overview stays put
 * while the table below narrows.
 */

type Part = "yes" | "maybe" | "no" | "pending";

const PARTS: { key: Part; label: string; short: string; bar: string; dot: string }[] = [
  { key: "yes", label: "Coming", short: "Yes", bar: "bg-green-600", dot: "bg-green-600" },
  { key: "maybe", label: "Maybe", short: "Maybe", bar: "bg-amber-500", dot: "bg-amber-500" },
  { key: "no", label: "Not coming", short: "No", bar: "bg-red-500", dot: "bg-red-500" },
  { key: "pending", label: "No answer", short: "No reply", bar: "bg-muted/35", dot: "bg-muted/35" },
];

export function EventSummary({
  events,
  counts,
}: {
  events: { id: string; name: string }[];
  counts: Record<string, ReplyCounts>;
}) {
  const searchParams = useSearchParams();
  if (events.length === 0) return null;

  const activeEvent = searchParams.get("event");
  const activeRsvp = searchParams.get("rsvp");

  // The counts are for the whole wedding, so a link keeps only the table's
  // view and grouping: the list it opens then holds exactly that many people.
  function href(eventId: string, part: Part, active: boolean): string {
    const params = new URLSearchParams();
    for (const key of ["view", "rows"]) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    if (!active) {
      params.set("rsvp", part);
      params.set("event", eventId);
    }
    const query = params.toString();
    return query ? `/guests?${query}` : "/guests";
  }

  return (
    // On a phone the cards sit in one row you swipe through, like iOS summary
    // cards (spec 48), so the guest list starts on the first screen.
    <section
      aria-label="Replies by event"
      className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
    >
      {events.map((event) => {
        const count = counts[event.id] ?? { invited: 0, yes: 0, maybe: 0, no: 0, pending: 0, cantCome: 0 };
        return (
          <div key={event.id} className={`card shrink-0 snap-start space-y-2 px-4 py-2.5 sm:w-auto sm:space-y-2.5 sm:py-3 ${events.length > 1 ? "w-[82%]" : "w-full"}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="truncate text-sm font-medium" title={event.name}>
                {event.name}
              </h2>
              {count.invited > 0 ? (
                <p className="shrink-0 text-xs text-muted">
                  <span className="font-serif text-lg tabular-nums text-ink sm:text-xl">{count.yes}</span> of{" "}
                  <span className="tabular-nums">{count.invited}</span> coming
                </p>
              ) : null}
            </div>

            {count.invited === 0 ? (
              <p className="text-xs text-muted">Nobody invited yet.</p>
            ) : (
              <>
                <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full sm:h-2.5" aria-hidden>
                  {PARTS.filter((part) => count[part.key] > 0).map((part) => {
                    const active = activeEvent === event.id && activeRsvp === part.key;
                    return (
                      <Link
                        key={part.key}
                        href={href(event.id, part.key, active)}
                        replace
                        scroll={false}
                        tabIndex={-1}
                        title={`${event.name}: ${count[part.key]} ${part.label.toLowerCase()}`}
                        style={{ flexGrow: count[part.key] }}
                        className={`min-w-1.5 basis-0 transition-opacity hover:opacity-80 ${part.bar} ${
                          activeEvent === event.id && activeRsvp && !active ? "opacity-40" : ""
                        }`}
                      />
                    );
                  })}
                  {count.cantCome > 0 ? (
                    <span
                      title={`${event.name}: ${count.cantCome} told you they can't come`}
                      style={{ flexGrow: count.cantCome }}
                      className="min-w-1.5 basis-0 bg-line"
                    />
                  ) : null}
                </div>

                <ul className="flex flex-wrap gap-x-2 gap-y-1 text-xs sm:gap-x-3">
                  {PARTS.map((part) => {
                    const n = count[part.key];
                    const active = activeEvent === event.id && activeRsvp === part.key;
                    const inner = (
                      <>
                        <span aria-hidden className={`h-2 w-2 rounded-full ${part.dot}`} />
                        <span className="sm:hidden">{part.short}</span>
                        <span className="max-sm:hidden">{part.label}</span>
                        <span className="font-medium tabular-nums text-ink">{n}</span>
                      </>
                    );
                    return (
                      <li key={part.key}>
                        {n > 0 || active ? (
                          <Link
                            href={href(event.id, part.key, active)}
                            replace
                            scroll={false}
                            aria-current={active ? "true" : undefined}
                            aria-label={`${event.name}: ${n} ${part.label.toLowerCase()}${
                              active ? ". Showing these; select to show everyone" : ". Show them"
                            }`}
                            className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-muted hover:bg-line/50 hover:text-ink ${
                              active ? "bg-ink/5 text-ink ring-1 ring-ink/30" : ""
                            }`}
                          >
                            {inner}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-1 py-0.5 text-muted">{inner}</span>
                        )}
                      </li>
                    );
                  })}
                  {count.cantCome > 0 ? (
                    <li className="inline-flex items-center gap-1.5 px-1 py-0.5 text-muted">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-line" />
                      <span>Can&rsquo;t come</span>
                      <span className="font-medium tabular-nums text-ink">{count.cantCome}</span>
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
