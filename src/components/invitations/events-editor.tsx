"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEvent, saveEvent } from "@/server/actions/events";
import { utcToZonedInput } from "@/lib/timezone";
import { formatDateTime } from "@/lib/format";
import type { EventRow } from "@/lib/types/database";

export function EventsEditor({ events, timeZone }: { events: EventRow[]; timeZone: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(eventId: string | null, form: HTMLFormElement) {
    const data = new FormData(form);
    const fields = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
    fields["is_public"] = data.get("is_public") === "on" ? "on" : "";

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
                timeZone={timeZone}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSubmit={(form) => submit(event.id, form)}
              />
            ) : (
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-muted">
                    {event.starts_at ? formatDateTime(event.starts_at, timeZone) : "No time set"}
                    {event.venue ? ` · ${event.venue}` : null}
                    {event.is_public ? null : " · hidden from the public site"}
                  </p>
                </div>
                <div className="flex gap-2">
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
        <EventFields timeZone={timeZone} pending={pending} onSubmit={(form) => submit(null, form)} />
      </section>
    </div>
  );
}

function EventFields({
  event,
  timeZone,
  pending,
  onSubmit,
  onCancel,
}: {
  event?: EventRow;
  timeZone: string;
  pending: boolean;
  onSubmit: (form: HTMLFormElement) => void;
  onCancel?: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.currentTarget);
      }}
      className="space-y-3"
    >
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

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_public" defaultChecked={event?.is_public ?? true} />
        Show on the public site
      </label>

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
