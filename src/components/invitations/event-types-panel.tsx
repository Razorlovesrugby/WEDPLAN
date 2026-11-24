"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createEventType,
  duplicateEventType,
  moveEventType,
  renameEventType,
  setEventTypeDefaults,
  setEventTypeHidden,
} from "@/server/actions/event-types";
import { OTHER_DEFAULTS, normaliseFeatures, type EventFeatures } from "@/lib/events/types";
import type { EventTypeRow } from "@/lib/types/database";

const SWITCHES: { key: keyof EventFeatures; label: string }[] = [
  { key: "asks_rsvp", label: "Replies" },
  { key: "has_seating", label: "Seating" },
  { key: "guest_facing", label: "Guest-facing" },
  { key: "is_main", label: "Main" },
];

/** Spec 51 §5: every type, built-in and custom alike, edited the same way. */
export function EventTypesPanel({ types, usage }: { types: EventTypeRow[]; usage: Record<string, number> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setError(null);
        router.refresh();
      } else setError(result.error ?? "That didn't save");
    });
  }

  function ask(message: string, initial = ""): string | null {
    const value = window.prompt(message, initial);
    return value === null ? null : value;
  }

  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-medium uppercase tracking-wide text-muted">
        Event types
      </summary>
      <p className="mt-2 text-sm text-muted">
        A type presets what a new event needs. Changing a type never changes events you already have.
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-3 divide-y divide-line">
        {types.map((type, index) => (
          <li key={type.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={type.hidden_at ? "font-medium text-muted" : "font-medium"}>
                {type.name}
                {type.hidden_at ? " (hidden)" : ""}
                <span className="ml-2 text-xs font-normal text-muted">
                  {usage[type.id] ?? 0} {(usage[type.id] ?? 0) === 1 ? "event" : "events"}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() => {
                    const name = ask("Rename this type", type.name);
                    if (name) run(() => renameEventType(type.id, name));
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={pending}
                  onClick={() => {
                    const name = ask("Name for the copy");
                    if (name) run(() => duplicateEventType(type.id, name));
                  }}
                >
                  Duplicate
                </button>
                {type.builtin_key === "other" ? null : (
                  <button
                    type="button"
                    className="btn"
                    disabled={pending}
                    onClick={() => run(() => setEventTypeHidden(type.id, !type.hidden_at))}
                  >
                    {type.hidden_at ? "Show again" : "Hide"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  aria-label={`Move ${type.name} up`}
                  disabled={pending || index === 0}
                  onClick={() => run(() => moveEventType(type.id, "up"))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Move ${type.name} down`}
                  disabled={pending || index === types.length - 1}
                  onClick={() => run(() => moveEventType(type.id, "down"))}
                >
                  ↓
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {SWITCHES.map(({ key, label }) => {
                const defaults: EventFeatures = type;
                const locked =
                  (key === "asks_rsvp" && (!type.guest_facing || type.is_main)) ||
                  (key === "is_main" && !type.guest_facing);
                return (
                  <label key={key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={defaults[key]}
                      disabled={pending || locked}
                      onChange={(e) =>
                        run(() =>
                          setEventTypeDefaults(
                            type.id,
                            normaliseFeatures({ ...defaults, [key]: e.target.checked }),
                          ),
                        )
                      }
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn mt-2"
        disabled={pending}
        onClick={() => {
          const name = ask("Name for the new event type");
          if (name) run(() => createEventType(name, OTHER_DEFAULTS));
        }}
      >
        + New type
      </button>
    </details>
  );
}
