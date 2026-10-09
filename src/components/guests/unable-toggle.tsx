"use client";

import { useState, useTransition } from "react";
import { setGuestUnableToAttend } from "@/server/actions/unable-to-attend";
import { formatDate } from "@/lib/format";
import type { UnableVia } from "@/lib/unable-to-attend";

/**
 * Whether this guest has said they can't come (spec 29 §4.4) — and the way to
 * record it for somebody who told you in person, or to take it back.
 *
 * It says who told whom: "told us" when the guest pressed the button on their
 * save-the-date, "you recorded it" when the planner did. And when the guest has
 * since answered Yes on their invitation it says so, because the flag is then
 * not what is being counted (the Yes outranks it, spec 29 §4.3.5) and a screen
 * that showed the badge alone would contradict the seat count beside it.
 */
export function UnableToggle({
  guestId,
  unableAt,
  via,
  answeredYes,
  timezone,
}: {
  guestId: string;
  unableAt: string | null;
  via: UnableVia | null;
  answeredYes: boolean;
  timezone: string;
}) {
  const [flagged, setFlagged] = useState(unableAt !== null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(unable: boolean) {
    setError(null);
    setFlagged(unable);
    startTransition(async () => {
      const result = await setGuestUnableToAttend(guestId, unable);
      if (!result.ok) {
        setFlagged(!unable);
        setError(result.error);
      }
    });
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      {flagged ? (
        <>
          <span
            className="rounded border border-tierB/50 bg-tierB/15 px-1.5 py-0.5"
            title={
              via === "save_the_date"
                ? "They told us themselves, from their save the date"
                : "You recorded this"
            }
          >
            Can&rsquo;t attend
            {unableAt
              ? ` · ${via === "planner" ? "you recorded it" : "told us"} ${formatDate(unableAt, timezone, { day: "numeric", month: "short" })}`
              : ""}
          </span>
          {answeredYes ? (
            <span className="text-muted">but answered Yes — counted</span>
          ) : null}
          <button
            type="button"
            className="text-muted underline"
            onClick={() => change(false)}
            disabled={pending}
          >
            Clear
          </button>
        </>
      ) : (
        <button
          type="button"
          className="text-muted underline"
          onClick={() => change(true)}
          disabled={pending}
        >
          Can&rsquo;t come
        </button>
      )}
      {error ? (
        <span className="text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
