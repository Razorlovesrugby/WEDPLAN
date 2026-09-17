"use client";

import { useEffect, useState } from "react";
import { daysUntil } from "@/lib/format";

/**
 * Days to go (spec 14 §3).
 *
 * The server renders the count first, so it is correct in the HTML and for
 * anyone with JavaScript off. The client then re-counts on a timer, because a
 * page left open overnight should not still show yesterday's number — and
 * re-counts from the date rather than decrementing, so a tab asleep for three
 * days wakes up correct rather than three days out.
 */
export function Countdown({
  weddingDate,
  initialDays,
  label,
}: {
  weddingDate: string;
  initialDays: number;
  label: string | null;
}) {
  const [days, setDays] = useState(initialDays);

  useEffect(() => {
    const recount = () => {
      const next = daysUntil(weddingDate);
      if (next !== null) setDays(next);
    };
    recount();
    // Hourly is plenty for a day counter, and costs nothing. A per-second
    // timer on a page somebody leaves open is a battery drain for no gain.
    const id = setInterval(recount, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [weddingDate]);

  if (days < 0) return null;

  return (
    <section id="countdown" className="scroll-mt-16 px-5 pb-2 pt-4">
      <p className="text-center text-[0.78rem] uppercase tracking-[0.2em] text-muted">
        {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days to go`}
        {label ? ` · ${label}` : ""}
      </p>
    </section>
  );
}
