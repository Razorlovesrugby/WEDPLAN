"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteAccommodation,
  deleteCoachRun,
  deleteCoachStop,
  deleteTransportOption,
  saveAccommodation,
  saveCoachRun,
  saveCoachStop,
  saveTransportOption,
} from "@/server/actions/travel";
import { availability } from "@/lib/travel/coach";
import { utcToZonedInput } from "@/lib/timezone";
import type { CoachRun, TravelData } from "@/server/queries/travel";
import type { AccommodationRow, TransportOptionRow } from "@/lib/types/database";

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

export function TravelEditor({ data, timeZone }: { data: TravelData; timeZone: string }) {
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

      <CoachEditor runs={data.runs} timeZone={timeZone} pending={pending} run={run} />
      <TransportEditor options={data.transport} pending={pending} run={run} />
      <StaysEditor stays={data.stays} pending={pending} run={run} />
    </div>
  );
}

function CoachEditor({
  runs,
  timeZone,
  pending,
  run,
}: {
  runs: CoachRun[];
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
  timeZone,
  pending,
  onSave,
}: {
  initial?: CoachRun;
  timeZone: string;
  pending: boolean;
  onSave: (fields: Record<string, unknown>) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [direction, setDirection] = useState(initial?.direction ?? "to_venue");
  const [departsAt, setDepartsAt] = useState(utcToZonedInput(initial?.departs_at ?? null, timeZone));
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

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
          onClick={() => onSave({ label, direction, departs_at: departsAt, capacity, notes })}
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
  pending,
  run,
}: {
  options: TransportOptionRow[];
  pending: boolean;
  run: (fn: () => Promise<Result>, done?: string) => void;
}) {
  const [kind, setKind] = useState<TransportOptionRow["kind"]>("parking");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");

  return (
    <section className="card p-4">
      <h2 className="font-medium">Parking, taxis, the train</h2>
      <p className="mt-1 text-sm text-muted">
        A sentence and a phone number. Parking is the most-asked question at a local wedding.
      </p>

      <ul className="mt-3 space-y-2">
        {options.map((option) => (
          <li key={option.id} className="flex flex-wrap items-baseline gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-muted">
              {KIND_LABEL[option.kind]}
            </span>
            <span className="flex-1">{option.name}</span>
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
              const result = await saveTransportOption({ kind, name, detail });
              if (result.ok) {
                setName("");
                setDetail("");
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
