"use client";

import { useEffect, useState } from "react";
import { timeLeft, timeLeftLabel, type TimeLeft } from "@/lib/format";

/**
 * The days/hours counter in the corner of Editorial's hero (spec 25 §7).
 *
 * `initial` is computed on the server so the number is correct in the HTML,
 * correct for a reader with JavaScript off, and — the reason it is a prop
 * rather than a `useState` initialiser — identical on both sides of
 * hydration. The client then re-counts *from the date* rather than
 * decrementing, so a tab asleep for three days wakes up correct rather than
 * three days out. Same discipline as `Countdown`, and the same reason.
 */
export function HeroCounter({
  startsAt,
  initial,
  className,
}: {
  startsAt: string;
  initial: TimeLeft | null;
  className?: string;
}) {
  const [left, setLeft] = useState<TimeLeft | null>(initial);

  useEffect(() => {
    const recount = () => setLeft(timeLeft(startsAt));
    recount();
    // A minute, not an hour: this counter shows hours inside the last day, and
    // an hourly timer would leave "3 hours" on screen for most of the
    // following hour.
    const id = setInterval(recount, 60_000);
    return () => clearInterval(id);
  }, [startsAt]);

  const words = timeLeftLabel(left);
  if (!words) return null;

  return <p className={`site-label site-eyebrow ${className ?? ""}`}>{words}</p>;
}
