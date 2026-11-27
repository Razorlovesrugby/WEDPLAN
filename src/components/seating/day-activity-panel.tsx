"use client";

import { useSeating } from "./seating-state";
import type { SeatingDayActivity } from "@/server/queries/seating";
import { guestName } from "@/lib/seating/model";

/** Day-of arrivals, moves and walk-ins from day links, with who made them (spec 53 Part I). */
export function DayActivityPanel({ activity, defaultOpen = false }: { activity: SeatingDayActivity[]; defaultOpen?: boolean }) {
  const { data, timeZone } = useSeating();
  if (activity.length === 0) return null;
  const name = (id: string | null) => {
    const g = id ? data.guests.find((x) => x.id === id) : undefined;
    return g ? guestName(g) : "a guest";
  };
  const time = (iso: string) => new Intl.DateTimeFormat("en-NZ", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
  const text = (a: SeatingDayActivity) =>
    a.kind === "seat_arrived"
      ? `${name(a.guestId)} arrived`
      : a.kind === "seat_unarrived"
        ? `${name(a.guestId)} un-marked as arrived`
        : a.kind === "seat_moved"
          ? `${name(a.guestId)} moved to ${a.table ?? "another table"}${a.seat ? `, chair ${a.seat}` : ""}`
          : `Walk-in seated at ${a.table ?? "a table"}${a.note ? `: ${a.note}` : ""}`;
  return (
    <details open={defaultOpen} className="card p-3 text-sm">
      <summary className="cursor-pointer font-medium">On the day <span className="font-normal text-muted">({activity.length})</span></summary>
      <ul className="mt-2 divide-y divide-line">
        {activity.map((a) => (
          <li key={a.id} className="py-1.5">
            <span className="text-muted">{time(a.at)}</span> {text(a)} <span className="text-xs text-muted">· {a.by}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
