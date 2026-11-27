"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { updateSeatingTable } from "@/server/actions/seating";
import type { SeatingTable } from "@/lib/seating/model";
import { useSeating } from "./seating-state";
import { TableStyleSection } from "./styles-panel";

type Tab = "seats" | "style" | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "seats", label: "Seats" },
  { id: "style", label: "Style" },
  { id: "notes", label: "Notes" },
];

/**
 * What the inspector shows for one table (spec 59 A.2): Seats, Style and Notes.
 * Seats is the table's place in the room and how full it is (the caller passes
 * it, since it shares the move and take-out actions with the room); Style is
 * the table's style and its changes over it (spec 57 C.1); Notes are the
 * table's own note.
 */
export function TableInspector({ table, seats }: { table: SeatingTable; seats: ReactNode }) {
  const [tab, setTab] = useState<Tab>("seats");
  const { occupancy } = useSeating();
  const occ = occupancy.get(table.id);
  return (
    <div className="card overflow-hidden text-sm" aria-label={`${table.label}`}>
      <div className="flex items-baseline gap-2 border-b border-line px-3 pt-2">
        <strong className="truncate">{table.label}</strong>
        <span className="text-xs text-muted">
          {occ ? `${occ.chairsTaken} of ${table.capacity} seated` : `${table.capacity} seats`}
        </span>
      </div>
      <div role="tablist" aria-label="Table" className="flex gap-1 border-b border-line px-2 pt-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`-mb-px rounded-t border-b-2 px-3 py-1 ${tab === t.id ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-2" role="tabpanel">
        {tab === "seats" ? seats : tab === "style" ? <TableStyleSection table={table} /> : <TableNotes table={table} />}
      </div>
    </div>
  );
}

/** The table's note, edited in place. The update sends the table's own values back with the new note, so nothing else changes. */
function TableNotes({ table }: { table: SeatingTable }) {
  const { eventId, refresh, setError, track } = useSeating();
  const [notes, setNotes] = useState(table.notes ?? "");
  const [pending, startTransition] = useTransition();
  useEffect(() => setNotes(table.notes ?? ""), [table.id, table.notes]);
  const dirty = notes.trim() !== (table.notes ?? "").trim();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await track("Edited a table's note", () =>
            updateSeatingTable(table.id, eventId, {
              label: table.label,
              shape: table.shape,
              capacity: table.capacity,
              reserved_seats: table.reserved_seats,
              reserved_note: table.reserved_note ?? undefined,
              ends_seated: table.ends_seated,
              accessible: table.accessible,
              notes: notes.trim(),
              width_cm: table.width_cm,
              length_cm: table.length_cm,
              rows_count: table.rows_count ?? undefined,
              aisle_cm: table.aisle_cm ?? undefined,
              segments: table.segments ?? undefined,
            }),
          );
          if (!r.ok) setError(r.error);
          refresh();
        });
      }}
    >
      <label className="block">
        <span className="mb-1 block text-xs text-muted">A note for this table</span>
        <textarea className="field min-h-[5rem] w-full" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Near the door; the grandparents' table" />
      </label>
      <button type="submit" className="btn py-1" disabled={!dirty || pending}>
        {pending ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}
