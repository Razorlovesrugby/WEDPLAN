"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteAccommodation,
  deleteArrivalPoint,
  deleteCoachRun,
  deleteCoachStop,
  deleteTransportOption,
  saveAccommodation,
  saveArrivalPoint,
  saveCoachRun,
  saveCoachStop,
  saveTransportOption,
} from "@/server/actions/travel";
import { formatCostRange, formatDuration } from "@/lib/site/travel";
import { availability } from "@/lib/travel/coach";
import { utcToZonedInput } from "@/lib/timezone";
import type { CoachRun, TravelData } from "@/server/queries/travel";
import type {
  AccommodationRow,
  ArrivalPointRow,
  TransportOptionRow,
} from "@/lib/types/database";

/**
 * `/travel` (spec 14 §13).
 *
 * One screen for the coach, the other ways in, and the places to stay — Q2
 * shrank all of it to fit. The coach gets the most room because it is the only
 * part with a headcount and a departure time.
 */

type Result = { ok: boolean; error?: string };

const KINDS: TransportOptionRow["kind"][] = ["parking", "taxi", "train", "walk", "other"];
const KIND_LABEL: Record<TransportOptionRow["kind"], string> = {
  parking: "Parking",
  taxi: "Taxi",
  train: "Train",
  walk: "On foot",
  other: "Other",
};

/** Just enough of an event to label a coach run (spec 25 §6). */
export type EventLite = { id: string; name: string };

export function TravelEditor({
  data,
  arrivals,
  events,
  timeZone,
}: {
  data: TravelData;
  arrivals: ArrivalPointRow[];
  events: EventLite[];
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (fn: () => Promise<Result>, done?: string) =>
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      setMessage(result.ok ? (done ?? null) : (result.error ?? "That didn't save"));
      if (result.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded border border-line bg-white px-3 py-2 text-sm" role="status">
          {message}
        </p>
      ) : null}

      <CoachEditor runs={data.runs} events={events} timeZone={timeZone} pending={pending} run={run} />
      <ArrivalEditor arrivals={arrivals} pending={pending} run={run} />
      <TransportEditor
        options={data.transport}
        arrivals={arrivals}
        pending={pending}
        run={run}
      />
      <StaysEditor stays={data.stays} pending={pending} run={run} />
    </div>
  );
}

function CoachEditor({
  runs,
  events,
  timeZone,
  pending,
  run,
}: {
  runs: CoachRun[];
  events: EventLite[];
  timeZone: string;
  pending: boolean;
  run: (fn: () => Promise<Result>, done?: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-medium">The coach</h2>
        {runs.length > 0 ? (
          <a className="btn" href="/api/export/coach" download>
            Manifest CSV
          </a>
        ) : null}
        <button type="button" className="btn" onClick={() => setAdding((value) => !value)}>
          {adding ? "Cancel" : "Add a run"}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Households reserve seats from their own RSVP page. It&rsquo;s a reservation, not a payment.
      </p>

      {adding ? (
        <RunForm
          events={events}
          timeZone={timeZone}
          pending={pending}
          onSave={(fields) =>
            run(async () => {
              const result = await saveCoachRun(fields);
              if (result.ok) setAdding(false);
              return result;
            }, "Run added")
          }
        />
      ) : null}

      <div className="mt-4 space-y-4">
        {runs.map((coachRun) => {
          const seats = availability(coachRun);
          return (
            <div key={coachRun.id} className="rounded border border-line p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="flex-1 font-medium">{coachRun.label}</p>
                <span className="text-xs text-muted">{seats.label}</span>
                <button
                  type="button"
                  className="btn px-2 py-1 text-xs"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteCoachRun(coachRun.id),
                      // Those seats were people expecting a lift, so the number
                      // goes in the confirmation rather than being discovered
                      // on the day.
                      coachRun.seats_taken > 0
                        ? `Run removed — ${coachRun.seats_taken} reserved seat${coachRun.seats_taken === 1 ? "" : "s"} went with it`
                        : "Run removed",
                    )
                  }
                >
                  Remove
                </button>
              </div>

              <RunForm
                initial={coachRun}
                events={events}
                timeZone={timeZone}
                pending={pending}
                onSave={(fields) => run(() => saveCoachRun({ ...fields, id: coachRun.id }), "Saved")}
              />

              <StopsEditor coachRun={coachRun} timeZone={timeZone} pending={pending} run={run} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RunForm({
  initial,
  events,
  timeZone,
  pending,
  onSave,
}: {
  initial?: CoachRun;
  events: EventLite[];
  timeZone: string;
  pending: boolean;
  onSave: (fields: Record<string, unknown>) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [direction, setDirection] = useState(initial?.direction ?? "to_venue");
  const [departsAt, setDepartsAt] = useState(utcToZonedInput(initial?.departs_at ?? null, timeZone));
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [eventId, setEventId] = useState(initial?.event_id ?? "");

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input
          className="field mt-1"
          value={label}
          placeholder="Coach from town"
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Direction</label>
        <select
          className="field mt-1"
          value={direction}
          onChange={(event) => setDirection(event.target.value as typeof direction)}
        >
          <option value="to_venue">To the venue</option>
          <option value="from_venue">Back afterwards</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Departs</label>
        <input
          type="datetime-local"
          className="field mt-1"
          value={departsAt}
          onChange={(event) => setDepartsAt(event.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Seats on the coach</label>
        <input
          type="number"
          min={1}
          max={200}
          className="field mt-1"
          value={capacity}
          placeholder="49"
          onChange={(event) => setCapacity(event.target.value)}
        />
        <p className="mt-1 text-xs text-muted">
          Leave empty until you know — the page then says how many are reserved rather than
          pretending it&rsquo;s full.
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium">What it&rsquo;s for</label>
        <select
          className="field mt-1"
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
        >
          <option value="">The whole weekend</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Pick an event and this run also shows underneath it on the schedule, where a guest
          reading about that event is already looking. Leave it on the weekend and it stays in the
          coach section only, as it did before.
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className="block text-sm font-medium">Anything else</label>
        <textarea
          className="field mt-1"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || label.trim() === ""}
          onClick={() =>
            onSave({
              label,
              direction,
              departs_at: departsAt,
              capacity,
              notes,
              event_id: eventId || null,
            })
          }
        >
          Save
        </button>
      </div>
    </div>
  );
}

function StopsEditor({
  coachRun,
  timeZone,
  pending,
  run,
}: {
  coachRun: CoachRun;
  timeZone: string;
  pending: boolean;
  run: (fn: () => Promise<Result>, done?: string) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [pickupAt, setPickupAt] = useState("");

  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-sm font-medium">Pickup points</p>
      {coachRun.stops.length === 0 ? (
        <p className="mt-1 text-xs text-muted">
          A run with no pickup points can&rsquo;t be booked — guests wouldn&rsquo;t know where to
          stand.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {coachRun.stops.map((stop) => (
            <li key={stop.id} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="flex-1">
                {stop.name}
                {stop.pickup_at ? (
                  <span className="text-muted">
                    {" "}
                    — {utcToZonedInput(stop.pickup_at, timeZone).replace("T", " ")}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn px-2 py-0.5 text-xs"
                disabled={pending}
                onClick={() => run(() => deleteCoachStop(stop.id), "Stop removed")}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input
          className="field"
          value={name}
          placeholder="The Crown"
          onChange={(event) => setName(event.target.value)}
          aria-label="Stop name"
        />
        <input
          className="field"
          value={address}
          placeholder="Address"
          onChange={(event) => setAddress(event.target.value)}
          aria-label="Stop address"
        />
        <input
          type="datetime-local"
          className="field"
          value={pickupAt}
          onChange={(event) => setPickupAt(event.target.value)}
          aria-label="Pickup time"
        />
        <button
          type="button"
          className="btn"
          disabled={pending || name.trim() === ""}
          onClick={() =>
            run(async () => {
              const result = await saveCoachStop({
                coach_run_id: coachRun.id,
                name,
                address,
                pickup_at: pickupAt,
                sort_order: coachRun.stops.length,
              });
              if (result.ok) {
                setName("");
                setAddress("");
                setPickupAt("");
              }
              return result;
            }, "Stop added")
          }
        >
          Add
        </button>
      </div>
    </div>
  );
}

function TransportEditor({
  options,
  arrivals,
  pending,
  run,
}: {
  options: TransportOptionRow[];
  arrivals: ArrivalPointRow[];
  pending: boolean;
  run: (fn: () => Promise<Result>, done?: string) => void;
}) {
  const [kind, setKind] = useState<TransportOptionRow["kind"]>("parking");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [arrivalId, setArrivalId] = useState("");
  const [minutes, setMinutes] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");

  return (
    <section className="card p-4">
      <h2 className="font-medium">Parking, taxis, the train</h2>
      <p className="mt-1 text-sm text-muted">
        A sentence and a phone number is enough for a wedding people drive to. Add a time and a
        cost only if it helps — a guest flying in wants to compare, a guest down the road does
        not, and anything you leave blank is simply not shown.
      </p>

      <ul className="mt-3 space-y-2">
        {options.map((option) => (
          <li key={option.id} className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-muted">
              {KIND_LABEL[option.kind]}
            </span>
            <span className="flex-1">
              {option.name}
              {option.arrival_point_id ? (
                <span className="ml-2 text-xs text-muted">
                  from {arrivals.find((a) => a.id === option.arrival_point_id)?.name ?? "—"}
                </span>
              ) : null}
              {formatDuration(option.duration_minutes) ? (
                <span className="ml-2 text-xs text-muted">
                  {formatDuration(option.duration_minutes)}
                </span>
              ) : null}
              {formatCostRange(option.cost_low, option.cost_high) ? (
                <span className="ml-2 text-xs text-muted">
                  {formatCostRange(option.cost_low, option.cost_high)}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="btn px-2 py-0.5 text-xs"
              disabled={pending}
              onClick={() => run(() => deleteTransportOption(option.id), "Removed")}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr_2fr_auto]">
        <select
          className="field"
          value={kind}
          onChange={(event) => setKind(event.target.value as TransportOptionRow["kind"])}
          aria-label="Kind"
        >
          {KINDS.map((option) => (
            <option key={option} value={option}>
              {KIND_LABEL[option]}
            </option>
          ))}
        </select>
        <input
          className="field"
          value={name}
          placeholder="Free on site"
          onChange={(event) => setName(event.target.value)}
          aria-label="Name"
        />
        <input
          className="field"
          value={detail}
          placeholder="You can leave a car overnight."
          onChange={(event) => setDetail(event.target.value)}
          aria-label="Detail"
        />
        <button
          type="button"
          className="btn"
          disabled={pending || name.trim() === ""}
          onClick={() =>
            run(async () => {
              const result = await saveTransportOption({
                kind,
                name,
                detail,
                arrival_point_id: arrivalId || null,
                duration_minutes: minutes,
                // Dollars in the form, minor units in the database — the
                // conversion happens once, here, rather than in three places
                // that will eventually disagree.
                cost_low: low === "" ? "" : Math.round(Number(low) * 100),
                cost_high: high === "" ? "" : Math.round(Number(high) * 100),
              });
              if (result.ok) {
                setName("");
                setDetail("");
                setMinutes("");
                setLow("");
                setHigh("");
              }
              return result;
            }, "Added")
          }
        >
          Add
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        <select
          className="field"
          value={arrivalId}
          onChange={(event) => setArrivalId(event.target.value)}
          aria-label="Arriving from"
        >
          <option value="">Not from an airport</option>
          {arrivals.map((point) => (
            <option key={point.id} value={point.id}>
              {point.code ? `${point.code} · ` : ""}
              {point.name}
            </option>
          ))}
        </select>
        <input
          className="field"
          value={minutes}
          inputMode="numeric"
          placeholder="Minutes"
          onChange={(event) => setMinutes(event.target.value)}
          aria-label="How long it takes, in minutes"
        />
        <input
          className="field"
          value={low}
          inputMode="decimal"
          placeholder="From $"
          onChange={(event) => setLow(event.target.value)}
          aria-label="Cost from, in dollars"
        />
        <input
          className="field"
          value={high}
          inputMode="decimal"
          placeholder="To $"
          onChange={(event) => setHigh(event.target.value)}
          aria-label="Cost to, in dollars"
        />
      </div>
    </section>
  );
}

/**
 * Airports and the like (spec 25 §5).
 *
 * Only worth filling in for a wedding people fly to. An arrival point with no
 * legs under it is not rendered on the site at all — a heading with nothing
 * beneath it is worse than no heading — so an experiment here costs nothing.
 */
function ArrivalEditor({
  arrivals,
  pending,
  run,
}: {
  arrivals: ArrivalPointRow[];
  pending: boolean;
  run: (fn: () => Promise<Result>, done?: string) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [minutes, setMinutes] = useState("");

  return (
    <section className="card p-4">
      <h2 className="font-medium">Airports</h2>
      <p className="mt-1 text-sm text-muted">
        For a wedding people fly to. Each one becomes a heading on the site with its own taxis and
        trains underneath; leave this empty and the site shows the plain list it always did.
      </p>

      <ul className="mt-3 space-y-2">
        {arrivals.map((point) => (
          <li key={point.id} className="flex flex-wrap items-baseline gap-2 text-sm">
            {point.code ? (
              <span className="text-xs uppercase tracking-wide text-muted">{point.code}</span>
            ) : null}
            <span className="flex-1">
              {point.name}
              {point.region ? <span className="text-muted"> · {point.region}</span> : null}
              {formatDuration(point.minutes_to_venue) ? (
                <span className="ml-2 text-xs text-muted">
                  {formatDuration(point.minutes_to_venue)} to the venue
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="btn px-2 py-0.5 text-xs"
              disabled={pending}
              onClick={() => run(() => deleteArrivalPoint(point.id), "Removed")}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-[6rem_2fr_1fr_1fr_auto]">
        <input
          className="field"
          value={code}
          maxLength={8}
          placeholder="BRS"
          onChange={(event) => setCode(event.target.value)}
          aria-label="Airport code"
        />
        <input
          className="field"
          value={name}
          placeholder="Bristol Airport"
          onChange={(event) => setName(event.target.value)}
          aria-label="Name"
        />
        <input
          className="field"
          value={region}
          placeholder="England"
          onChange={(event) => setRegion(event.target.value)}
          aria-label="Region"
        />
        <input
          className="field"
          value={minutes}
          inputMode="numeric"
          placeholder="Minutes away"
          onChange={(event) => setMinutes(event.target.value)}
          aria-label="Minutes to the venue"
        />
        <button
          type="button"
          className="btn"
          disabled={pending || name.trim() === ""}
          onClick={() =>
            run(async () => {
              const result = await saveArrivalPoint({
                code,
                name,
                region,
                minutes_to_venue: minutes,
              });
              if (result.ok) {
                setCode("");
                setName("");
                setRegion("");
                setMinutes("");
              }
              return result;
            }, "Added")
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}

function StaysEditor({
  stays,
  pending,
  run,
}: {
  stays: AccommodationRow[];
  pending: boolean;
  run: (fn: () => Promise<Result>, done?: string) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [distance, setDistance] = useState("");

  return (
    <section className="card p-4">
      <h2 className="font-medium">Where to stay</h2>
      <p className="mt-1 text-sm text-muted">
        A list of links. If you negotiate a rate somewhere, put the code and the deadline in the
        notes — that&rsquo;s all a block is from a guest&rsquo;s side.
      </p>

      <ul className="mt-3 space-y-2">
        {stays.map((stay) => (
          <li key={stay.id} className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="flex-1">
              {stay.name}
              {stay.distance_label ? (
                <span className="text-muted"> — {stay.distance_label}</span>
              ) : null}
            </span>
            <button
              type="button"
              className="btn px-2 py-0.5 text-xs"
              disabled={pending}
              onClick={() => run(() => deleteAccommodation(stay.id), "Removed")}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
        <input
          className="field"
          value={name}
          placeholder="The Swan"
          onChange={(event) => setName(event.target.value)}
          aria-label="Name"
        />
        <input
          className="field"
          value={url}
          placeholder="https://…"
          onChange={(event) => setUrl(event.target.value)}
          aria-label="Link"
        />
        <input
          className="field"
          value={distance}
          placeholder="8 min by car"
          onChange={(event) => setDistance(event.target.value)}
          aria-label="Distance"
        />
        <button
          type="button"
          className="btn"
          disabled={pending || name.trim() === ""}
          onClick={() =>
            run(async () => {
              const result = await saveAccommodation({ name, url, distance_label: distance });
              if (result.ok) {
                setName("");
                setUrl("");
                setDistance("");
              }
              return result;
            }, "Added")
          }
        >
          Add
        </button>
      </div>
    </section>
  );
}
