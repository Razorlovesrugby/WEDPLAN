"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reserveCoachSeats } from "@/server/actions/travel";
import { formatTime } from "@/lib/format";
import { availability } from "@/lib/travel/coach";
import type { CoachRun } from "@/server/queries/travel";
import type { CoachSeatRow } from "@/lib/types/database";

/**
 * Reserving coach seats from a household's own RSVP page (spec 14 §7.1).
 *
 * A reservation, not a payment (Q4). Seats are a count per household rather
 * than named guests, which follows from Q1: the household is the unit that
 * holds the link, and a household travels together.
 *
 * Zero seats is a real answer and removes the booking — "we'll make our own
 * way" needs to be expressible, and leaving a stale reservation on the
 * manifest means a driver waiting at a kerb for people who aren't coming.
 */
export function CoachBooking({
  token,
  runs,
  held,
  timeZone,
}: {
  token: string;
  runs: CoachRun[];
  held: Record<string, Pick<CoachSeatRow, "coach_stop_id" | "seats">>;
  /**
   * The IANA zone, not a formatter. A function cannot cross the server/client
   * boundary — React refuses to serialise one — so the formatting happens
   * here, with the wedding's own zone rather than the browser's.
   */
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});

  if (runs.length === 0) return null;

  const submit = (runId: string, stopId: string, seats: number) =>
    startTransition(async () => {
      setErrors((current) => ({ ...current, [runId]: "" }));
      setSaved((current) => ({ ...current, [runId]: "" }));

      const result = await reserveCoachSeats({
        token,
        coach_run_id: runId,
        coach_stop_id: stopId,
        seats,
      });

      if (!result.ok) {
        setErrors((current) => ({ ...current, [runId]: result.error }));
        return;
      }
      setSaved((current) => ({
        ...current,
        [runId]: result.data.seats === 0 ? "Removed — you're making your own way" : "Saved",
      }));
      router.refresh();
    });

  return (
    <div className="space-y-8">
      {runs.map((run) => {
        const seats = availability(run);
        const current = held[run.id];
        const stops = run.stops;
        // A run with nowhere to be picked up cannot be booked. Rendering the
        // form anyway would offer a choice the server has to refuse.
        if (stops.length === 0) return null;

        return (
          <CoachRunForm
            key={run.id}
            run={run}
            stops={stops}
            seatsLabel={seats.label}
            full={seats.full && !current}
            current={current}
            pending={pending}
            error={errors[run.id]}
            saved={saved[run.id]}
            timeZone={timeZone}
            onSubmit={submit}
          />
        );
      })}
    </div>
  );
}

function CoachRunForm({
  run,
  stops,
  seatsLabel,
  full,
  current,
  pending,
  error,
  saved,
  timeZone,
  onSubmit,
}: {
  run: CoachRun;
  stops: CoachRun["stops"];
  seatsLabel: string;
  full: boolean;
  current: Pick<CoachSeatRow, "coach_stop_id" | "seats"> | undefined;
  pending: boolean;
  error: string | undefined;
  saved: string | undefined;
  timeZone: string;
  onSubmit: (runId: string, stopId: string, seats: number) => void;
}) {
  const [stopId, setStopId] = useState(current?.coach_stop_id ?? stops[0]?.id ?? "");
  const [seats, setSeats] = useState(String(current?.seats ?? 0));

  return (
    <div className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <p className="text-xl text-ink">{run.label}</p>
      {run.departs_at ? (
        <p className="text-[0.85rem] text-muted">Leaves {formatTime(run.departs_at, timeZone)}</p>
      ) : null}
      {run.notes ? (
        <p className="mt-1.5 whitespace-pre-line text-[0.95rem] text-muted">{run.notes}</p>
      ) : null}
      <p className="mt-1 text-[0.85rem] text-muted">{seatsLabel}</p>

      {full ? (
        <p className="mt-3 text-[0.95rem] text-muted">
          This one&rsquo;s full, sorry — do let us know if you&rsquo;re stuck and we&rsquo;ll sort
          something out.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
            <label htmlFor={`stop-${run.id}`} className="block text-[0.85rem] font-medium">
              Where you&rsquo;ll get on
            </label>
            <select
              id={`stop-${run.id}`}
              className="field mt-1"
              value={stopId}
              onChange={(event) => setStopId(event.target.value)}
            >
              {stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                  {stop.pickup_at ? ` — ${formatTime(stop.pickup_at, timeZone)}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`seats-${run.id}`} className="block text-[0.85rem] font-medium">
              Seats
            </label>
            <input
              id={`seats-${run.id}`}
              type="number"
              min={0}
              max={20}
              inputMode="numeric"
              className="field mt-1 w-24"
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn-primary"
            disabled={pending || stopId === ""}
            onClick={() => onSubmit(run.id, stopId, Number(seats) || 0)}
          >
            {pending ? "Saving…" : current ? "Update" : "Reserve"}
          </button>
        </div>
      )}

      <p className="mt-2 text-[0.8rem] text-muted">
        Set it to 0 if you&rsquo;d rather make your own way.
      </p>
      {error ? <p className="mt-1 text-[0.85rem] text-tierB">{error}</p> : null}
      {saved ? <p className="mt-1 text-[0.85rem] text-muted">{saved}</p> : null}
    </div>
  );
}
