"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { sideLabel } from "@/lib/format";
import { trayHouseholds, type TrayHousehold } from "@/lib/seating/tray";
import type { GuestSide } from "@/lib/types/database";
import { GuestChip, type DragPayload } from "./guest-chip";
import { useSeating } from "./seating-state";

const SIDES: GuestSide[] = ["partner_a", "partner_b", "both", "other"];

/**
 * The unseated tray (spec 33 §A.2): the people coming to this event who
 * don't have a seat yet, grouped by household. It's also a drop target — drop
 * a chip here, or tap it while someone's held, to unseat them.
 */
export function Tray() {
  const { data, assignments, trayMode, setTrayMode, held, hold, move } = useSeating();
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [side, setSide] = useState<GuestSide | "">("");
  const { setNodeRef, isOver } = useDroppable({ id: "tray" });

  const households = useMemo(
    () => trayHouseholds(data.guests, assignments, trayMode, { query, tagId: tagId || null, side: side || null }),
    [data.guests, assignments, trayMode, query, tagId, side],
  );
  const count = households.reduce((n, h) => n + h.guests.length, 0);
  const heldIsSeated = held ? held.guestIds.some((id) => assignments.some((a) => a.guestId === id)) : false;

  return (
    <section
      ref={setNodeRef}
      aria-label="Not yet seated"
      onClick={() => {
        if (held && heldIsSeated) {
          move(held.guestIds, null);
          hold(null);
        }
      }}
      className={`card flex flex-col gap-3 p-3 ${isOver || (held && heldIsSeated) ? "ring-2 ring-accent" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">Not yet seated</h2>
        <span className="text-sm text-muted">{count}</span>
      </div>

      {held && heldIsSeated ? (
        <p className="rounded bg-accent/10 px-2 py-1 text-xs text-ink">Tap here to take {held.label} off their table.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names"
          aria-label="Search names"
          className="field col-span-2"
        />
        <select aria-label="Tag" value={tagId} onChange={(e) => setTagId(e.target.value)} className="field">
          <option value="">All tags</option>
          {data.colour.tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select aria-label="Side" value={side} onChange={(e) => setSide(e.target.value as GuestSide | "")} className="field">
          <option value="">Both sides</option>
          {SIDES.map((s) => (
            <option key={s} value={s}>
              {sideLabel(s, data.colour.collaborators)}
            </option>
          ))}
        </select>
        <select
          aria-label="Who to show"
          value={trayMode}
          onChange={(e) => setTrayMode(e.target.value as typeof trayMode)}
          className="field col-span-2"
        >
          <option value="yes">Said yes</option>
          <option value="yes_pending">Said yes, or hasn&rsquo;t answered</option>
        </select>
      </div>

      {households.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {query || tagId || side ? "Nobody unseated matches." : "Everyone coming has a seat."}
        </p>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {households.map((h) => (
            <TrayHouseholdRow key={h.householdId} household={h} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TrayHouseholdRow({ household }: { household: TrayHousehold }) {
  const { held, hold } = useSeating();
  const ids = household.guests.map((g) => g.id);
  const label = household.guests.length === 1 ? household.householdName : `${household.householdName} (${ids.length})`;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `household:${household.householdId}`,
    data: { guestIds: ids, label } satisfies DragPayload,
  });
  const isHeld = held !== null && held.guestIds.length === ids.length && held.guestIds.every((id) => ids.includes(id));

  return (
    <li className="rounded border border-line/70 p-2" onClick={(e) => e.stopPropagation()}>
      {household.guests.length > 1 ? (
        <button
          ref={setNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          onClick={() => hold(isHeld ? null : { guestIds: ids, label })}
          aria-pressed={isHeld}
          className={`mb-1.5 w-full rounded px-1 text-left text-xs font-medium uppercase tracking-wide ${
            isHeld ? "bg-ink text-white" : "text-muted hover:bg-line/40"
          }`}
          title="Drag or tap to seat the whole household"
        >
          {household.householdName} · all {ids.length}
        </button>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {household.guests.map((g) => (
          <GuestChip key={g.id} guest={g} />
        ))}
      </div>
    </li>
  );
}
