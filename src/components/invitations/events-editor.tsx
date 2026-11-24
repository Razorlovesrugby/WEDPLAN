"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEvent, saveEvent } from "@/server/actions/events";
import { createEventType } from "@/server/actions/event-types";
import { utcToZonedInput } from "@/lib/timezone";
import { formatDateTime } from "@/lib/format";
import { OTHER_DEFAULTS, disabledReason, featureNote, normaliseFeatures } from "@/lib/events/types";
import type { EventRow, EventTypeRow } from "@/lib/types/database";

export function EventsEditor({
  events,
  types,
  timeZone,
}: {
  events: EventRow[];
  types: EventTypeRow[];
  timeZone: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(eventId: string | null, form: HTMLFormElement) {
    const data = new FormData(form);
    const fields = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
    // Unchecked boxes are absent from FormData, and disabled ones are too, so
    // the switches are sent explicitly from what the form shows.
    for (const key of ["is_public", "is_main", "asks_rsvp", "has_seating", "guest_facing"]) {
      fields[key] = data.get(key) === "on" ? "on" : "";
    }

    startTransition(async () => {
      const result = await saveEvent(eventId, fields);
      if (result.ok) {
        setEditing(null);
        setError(null);
        form.reset();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="card divide-y divide-line">
        {events.map((event) => (
          <li key={event.id} className="p-4">
            {editing === event.id ? (
              <EventFields
                event={event}
                types={types}
                timeZone={timeZone}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSubmit={(form) => submit(event.id, form)}
              />
            ) : (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {event.name}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {types.find((t) => t.id === event.type_id)?.name}
                    </span>
                  </p>
                  <p className="text-sm text-muted">
                    {event.starts_at ? formatDateTime(event.starts_at, timeZone) : "No time set"}
                    {event.venue ? ` · ${event.venue}` : null}
                    {event.is_public || !event.guest_facing ? null : " · hidden from the public site"}
                    {featureNote(event) ? ` · ${featureNote(event)}` : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/run-sheet" className="btn" prefetch={false}>
                    Run sheet →
                  </Link>
                  {event.has_seating ? (
                    <Link href={`/events/${event.id}/seating`} className="btn" prefetch={false}>
                      Seating →
                    </Link>
                  ) : null}
                  <button type="button" className="btn" onClick={() => setEditing(event.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn text-red-700"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete "${event.name}"? Every RSVP for it goes too. This cannot be undone.`,
                        )
                      )
                        return;
                      startTransition(async () => {
                        const result = await deleteEvent(event.id);
                        if (result.ok) router.refresh();
                        else setError(result.error);
                      });
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {events.length === 0 ? (
          <li className="p-4 text-sm text-muted">
            No events yet. Most weddings need at least a ceremony and a reception.
          </li>
        ) : null}
      </ul>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Add an event</h2>
        <EventFields types={types} timeZone={timeZone} pending={pending} onSubmit={(form) => submit(null, form)} />
      </section>
    </div>
  );
}

function EventFields({
  event,
  types,
  timeZone,
  pending,
  onSubmit,
  onCancel,
}: {
  event?: EventRow;
  types: EventTypeRow[];
  timeZone: string;
  pending: boolean;
  onSubmit: (form: HTMLFormElement) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  // Hidden types are out of the select for new events; an event keeps its own.
  const visible = types.filter((t) => !t.hidden_at || t.id === event?.type_id);
  const other = types.find((t) => t.builtin_key === "other");
  const initialType = types.find((t) => t.id === event?.type_id) ?? other ?? visible[0];
  const [typeId, setTypeId] = useState(initialType?.id ?? "");
  const [typeError, setTypeError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();
  const [switches, setSwitches] = useState(() =>
    normaliseFeatures({
      asks_rsvp: event?.asks_rsvp ?? initialType?.asks_rsvp ?? true,
      has_seating: event?.has_seating ?? initialType?.has_seating ?? false,
      guest_facing: event?.guest_facing ?? initialType?.guest_facing ?? true,
      is_main: event?.is_main ?? initialType?.is_main ?? false,
      is_public: event?.is_public ?? true,
    }),
  );
  const set = (patch: Partial<typeof switches>) => setSwitches((cur) => normaliseFeatures({ ...cur, ...patch }));

  function chooseType(value: string) {
    if (value === "__new") {
      const name = window.prompt("Name for the new event type");
      if (!name) return;
      startCreating(async () => {
        const result = await createEventType(name, OTHER_DEFAULTS);
        if (!result.ok) return setTypeError(result.error);
        setTypeError(null);
        setTypeId(result.data.id);
        set({ ...OTHER_DEFAULTS });
        router.refresh();
      });
      return;
    }
    setTypeId(value);
    setTypeError(null);
    // Choosing a type presets the switches on a new event only (spec 51 §4.1).
    const type = types.find((t) => t.id === value);
    if (!event && type) {
      set({
        asks_rsvp: type.asks_rsvp,
        has_seating: type.has_seating,
        guest_facing: type.guest_facing,
        is_main: type.is_main,
      });
    }
  }

  const reasonFor = (field: "asks_rsvp" | "is_public" | "is_main") => disabledReason(field, switches);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.currentTarget);
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Type</span>
        <select
          name="type_id"
          className="field"
          value={typeId}
          disabled={creating}
          onChange={(e) => chooseType(e.target.value)}
        >
          {visible.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.hidden_at ? " (hidden)" : ""}
            </option>
          ))}
          <option value="__new">+ New type…</option>
        </select>
        {typeError ? <span className="mt-1 block text-xs text-red-700">{typeError}</span> : null}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input name="name" defaultValue={event?.name ?? ""} required className="field" placeholder="Ceremony" />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Starts</span>
          <input
            type="datetime-local"
            name="starts_at"
            defaultValue={utcToZonedInput(event?.starts_at ?? null, timeZone)}
            className="field"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Venue</span>
          <input name="venue" defaultValue={event?.venue ?? ""} className="field" />
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Order</span>
          <input
            type="number"
            name="sort_order"
            min={0}
            defaultValue={event?.sort_order ?? 0}
            className="field"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Address</span>
        <input name="address" defaultValue={event?.address ?? ""} className="field" />
      </label>

      {/* Spec 21 §5.4 — this is the couple talking to a guest, not the run
          sheet. It appears under "On the day" on the pages of the households
          invited to this event, and nowhere else. */}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">On the day (guests see this)</span>
        <textarea
          name="guest_note"
          rows={3}
          defaultValue={event?.guest_note ?? ""}
          className="field"
          placeholder="Park on the street — the gates shut at 2. Drinks on the lawn straight after."
        />
        <span className="mt-1 block text-xs text-muted">
          Only shown to households invited to this event.
        </span>
      </label>

      <fieldset className="space-y-2 rounded border border-line p-3">
        <legend className="px-1 text-sm font-medium">What this event needs</legend>
        <Switch
          name="asks_rsvp"
          checked={switches.asks_rsvp}
          reason={reasonFor("asks_rsvp")}
          onChange={(v) => set({ asks_rsvp: v })}
          label="Guests reply (RSVP)"
        />
        <Switch
          name="has_seating"
          checked={switches.has_seating}
          onChange={(v) => set({ has_seating: v })}
          label="Seating plan"
        />
        <Switch
          name="is_public"
          checked={switches.is_public}
          reason={reasonFor("is_public")}
          onChange={(v) => set({ is_public: v })}
          label="Show on the public site"
        />
        <Switch
          name="is_main"
          checked={switches.is_main}
          reason={reasonFor("is_main")}
          onChange={(v) => set({ is_main: v })}
          label="Main event — a guest who says yes to this is coming, even if they decline the others"
        />
        <Switch
          name="guest_facing"
          checked={!switches.guest_facing}
          onChange={(v) => set({ guest_facing: !v })}
          label="Just us — not shown to guests"
        />
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {event ? "Save" : "Add event"}
        </button>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * A switch that still posts its value when a combination rules it out: a
 * disabled checkbox is left out of FormData, so the checked state rides in a
 * hidden input and the visible box is only the control.
 */
function Switch({
  name,
  checked,
  reason,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  reason?: string | null;
  onChange: (value: boolean) => void;
  label: string;
}) {
  const shown = name === "guest_facing" ? !checked : checked;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name={name} value={shown ? "on" : ""} />
      <input
        type="checkbox"
        checked={checked}
        disabled={Boolean(reason)}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
      {reason ? <span className="text-xs text-muted">({reason})</span> : null}
    </label>
  );
}
