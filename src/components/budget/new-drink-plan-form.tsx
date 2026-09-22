"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDrinkPlan } from "@/server/actions/drinks";

/**
 * Adding a drink plan. Only the four things that cannot be defaulted are
 * asked for — everything else starts on the sheet's own defaults (25/25/50,
 * 40/40/20, average intensity) and is edited on the card afterwards, so
 * getting a first shopping list takes one field and a button.
 */
export function NewDrinkPlanForm({ events }: { events: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState("");
  const [eventId, setEventId] = useState("");
  const [hours, setHours] = useState(5);
  const [source, setSource] = useState<"confirmed" | "invited" | "manual">("confirmed");
  const [manual, setManual] = useState(100);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
      >
        New drink plan
      </button>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createDrinkPlan({
        label,
        event_id: eventId || null,
        hours,
        intensity: 1.0,
        champagne_toast: false,
        beer_share: 0.25,
        wine_share: 0.25,
        spirit_share: 0.5,
        red_share: 0.4,
        white_share: 0.4,
        rose_share: 0.2,
        headcount_source: source,
        manual_headcount: source === "manual" ? manual : null,
      });
      if (!result.ok) {
        setError(result.fieldErrors ? Object.values(result.fieldErrors)[0]![0]! : result.error);
        return;
      }
      setLabel("");
      setOpen(false);
      setError(null);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 rounded border border-line/70 p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Reception bar"
          className="field w-44"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Event
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="field w-auto"
        >
          <option value="">Whole wedding</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Hours
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="field w-20 tabular-nums"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Headcount from
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="field w-auto"
        >
          <option value="confirmed">RSVPs confirmed</option>
          <option value="invited">Everyone invited</option>
          <option value="manual">A number I type</option>
        </select>
      </label>

      {source === "manual" ? (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Headcount
          <input
            type="number"
            min={0}
            value={manual}
            onChange={(e) => setManual(Number(e.target.value))}
            className="field w-24 tabular-nums"
          />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
      >
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="btn">
        Cancel
      </button>

      {error ? <p className="w-full text-xs text-red-700">{error}</p> : null}
    </form>
  );
}
