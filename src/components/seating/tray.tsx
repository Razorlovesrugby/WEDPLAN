"use client";

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { sideLabel } from "@/lib/format";
import { matchesFilter, trayHouseholds, type TrayHousehold } from "@/lib/seating/tray";
import { guestName, takesAChair } from "@/lib/seating/model";
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
  const { data, assignments, trayMode, setTrayMode, held, hold, move, selectMode, setSelectMode, selected, setSelected, tables, occupancy, tableById, focusGuest } = useSeating();
  const [seatNotice, setSeatNotice] = useState<string | null>(null);
  const [seatAt, setSeatAt] = useState("");
  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState("");
  const [side, setSide] = useState<GuestSide | "">("");
  const { setNodeRef, isOver } = useDroppable({ id: "tray" });

  const households = useMemo(
    () => trayHouseholds(data.guests, assignments, trayMode, { query, tagId: tagId || null, side: side || null }),
    [data.guests, assignments, trayMode, query, tagId, side],
  );
  const count = households.reduce((n, h) => n + h.guests.length, 0);
  const filtered = Boolean(query || tagId || side);
  // Spec 53 Part E: say how many the filter is hiding, and offer to show them.
  const unfilteredCount = useMemo(
    () => (filtered ? trayHouseholds(data.guests, assignments, trayMode).reduce((n, h) => n + h.guests.length, 0) : count),
    [filtered, data.guests, assignments, trayMode, count],
  );
  const hiddenByFilter = unfilteredCount - count;
  // Seated guests matching the search, with their table.
  const seatedMatches = useMemo(() => {
    if (!query.trim()) return [];
    const at = new Map(assignments.map((a) => [a.guestId, a.tableId]));
    return data.guests
      .filter((g) => at.has(g.id) && matchesFilter(g, { query, tagId: tagId || null, side: side || null }))
      .slice(0, 8)
      .map((g) => ({ guest: g, table: tableById.get(at.get(g.id)!)?.label ?? "a table" }));
  }, [query, tagId, side, data.guests, assignments, tableById]);

  /** Seats the selected guests at a table; whoever doesn't fit stays selected (Part D). */
  function seatSelected() {
    const table = tableById.get(seatAt);
    if (!table || selected.size === 0) return;
    const ids = [...selected];
    let free = occupancy.get(table.id)?.free ?? 0;
    const fit: string[] = [];
    const left: string[] = [];
    for (const id of ids) {
      const g = data.guests.find((x) => x.id === id);
      const needs = g && takesAChair(g) ? 1 : 0;
      if (needs <= free) {
        fit.push(id);
        free -= needs;
      } else left.push(id);
    }
    if (fit.length > 0) move(fit, table.id);
    setSelected(new Set(left));
    setSeatNotice(left.length > 0 ? `${left.length} didn't fit — ${table.label} is full` : null);
    if (left.length === 0) setSelectMode(false);
  }
  const heldIsSeated = held ? held.guestIds.some((id) => assignments.some((a) => a.guestId === id)) : false;

  return (
    <section
      ref={setNodeRef}
      id="seating-tray"
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
        <span className="flex items-baseline gap-2 text-sm text-muted">
          {count}
          <button
            type="button"
            className="text-xs underline"
            aria-pressed={selectMode}
            onClick={(e) => {
              e.stopPropagation();
              setSelectMode(!selectMode);
              setSelected(new Set());
              setSeatNotice(null);
            }}
          >
            {selectMode ? "Done selecting" : "Select several"}
          </button>
        </span>
      </div>

      {selectMode ? (
        <div className="space-y-1.5 rounded bg-line/30 p-2 text-sm" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs text-muted">Tick people (Shift-click for a range), then pick a table.</p>
          <div className="flex gap-2">
            <select className="field flex-1" aria-label="Table" value={seatAt} onChange={(e) => setSeatAt(e.target.value)}>
              <option value="">Seat {selected.size || ""} at…</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>{t.label} ({occupancy.get(t.id)?.free ?? 0} free)</option>
              ))}
            </select>
            <button type="button" className="btn-primary" disabled={!seatAt || selected.size === 0} onClick={seatSelected}>Seat</button>
          </div>
          {seatNotice ? <p role="status" className="text-xs text-amber-800">{seatNotice}</p> : null}
        </div>
      ) : null}

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

      {hiddenByFilter > 0 ? (
        <p className="text-xs text-muted" onClick={(e) => e.stopPropagation()}>
          {hiddenByFilter} hidden by the filter.{" "}
          <button type="button" className="underline" onClick={() => { setQuery(""); setTagId(""); setSide(""); }}>Show all</button>
        </p>
      ) : null}

      {seatedMatches.length > 0 ? (
        <div className="space-y-1 text-sm" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs uppercase tracking-wide text-muted">Already seated</p>
          {seatedMatches.map(({ guest, table }) => (
            <button key={guest.id} type="button" className="block w-full rounded px-1 text-left hover:bg-line/40" onClick={() => focusGuest(guest.id)}>
              {guestName(guest)} <span className="text-xs text-muted">· {table}</span>
            </button>
          ))}
        </div>
      ) : null}

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
  const { held, hold, selectMode, selected, setSelected } = useSeating();
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
          onClick={() => (selectMode ? setSelected(new Set([...selected, ...ids])) : hold(isHeld ? null : { guestIds: ids, label }))}
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
