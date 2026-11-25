"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { serialiseColourBy, type ColourBy } from "@/lib/seating/colour";
import type { SeatingDayActivity, SeatingSnapshotSummary } from "@/server/queries/seating";
import { DragPreview, type DragPayload } from "./guest-chip";
import { trayHouseholds } from "@/lib/seating/tray";
import { LayoutTabs } from "./layout-tabs";
import { RoomSetup } from "./room-setup";
import { RoomView } from "./room-view";
import { RulesPanel } from "./rules-panel";
import { SeatingProvider, useSeating, type SeatingData } from "./seating-state";
import { RevealPanel, SnapshotsPanel } from "./snapshots-panel";
import { DayActivityPanel } from "./day-activity-panel";
import { StylesPanel } from "./styles-panel";
import { SummaryBar } from "./summary-bar";
import { TableDrawer } from "./table-drawer";
import { TablesGrid } from "./tables-grid";
import { Tray } from "./tray";
import { useDragSensors } from "@/components/ui/use-drag-sensors";

type View = "tables" | "room";
const VIEW_KEY = "wedplan.seating.view";

export function SeatingScreen({
  eventId,
  timeZone,
  data,
  snapshots,
  dayActivity,
  collaborators,
  initialColourBy,
}: {
  eventId: string;
  timeZone: string;
  data: SeatingData;
  snapshots: SeatingSnapshotSummary[];
  dayActivity: SeatingDayActivity[];
  collaborators: { user_id: string; display_name: string | null; role: string }[];
  initialColourBy: ColourBy;
}) {
  return (
    <SeatingProvider eventId={eventId} timeZone={timeZone} data={data} initialColourBy={initialColourBy}>
      <Screen snapshots={snapshots} dayActivity={dayActivity} collaborators={collaborators} />
    </SeatingProvider>
  );
}

function Screen({
  snapshots,
  dayActivity,
  collaborators,
}: {
  snapshots: SeatingSnapshotSummary[];
  dayActivity: SeatingDayActivity[];
  collaborators: { user_id: string; display_name: string | null; role: string }[];
}) {
  const { eventId, layoutId, isDraft, move, error, setError, held, hold, colourBy, undo, redo, canUndo, canRedo, undoLabel, redoLabel, tables, data, show, setShow, assignments, trayMode } = useSeating();
  const unseated = trayHouseholds(data.guests, assignments, trayMode).reduce((n, h) => n + h.guests.length, 0);
  const [skippedSetup, setSkippedSetup] = useState(false);
  const [view, setView] = useState<View>("tables");
  const [dragging, setDragging] = useState<DragPayload | null>(null);

  // The Room view needs room to work in (§C.4): phones open on Tables, and a
  // planner's last choice is remembered on this device only.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "room" && window.matchMedia("(min-width: 768px)").matches) setView("room");
    } catch {
      // Private mode or storage blocked: the default is fine.
    }
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // As above.
    }
  };

  // A drag must not start on a tap (that's tap-to-place), nor on a scroll on a phone.
  const sensors = useDragSensors({ sortable: false, distance: 6 });

  const onDragStart = (e: DragStartEvent) => {
    hold(null);
    setDragging((e.active.data.current as DragPayload | undefined) ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const payload = e.active.data.current as DragPayload | undefined;
    const target = e.over?.id;
    if (!payload || typeof target !== "string") return;
    if (target === "tray") move(payload.guestIds, null);
    else if (target.startsWith("table:")) move(payload.guestIds, target.slice("table:".length));
  };

  const colourParam = serialiseColourBy(colourBy);
  const printHref = (v: string) =>
    `/events/${eventId}/seating/print?view=${v}${colourParam ? `&colour=${encodeURIComponent(colourParam)}` : ""}${isDraft && layoutId ? `&layout=${layoutId}` : ""}`;

  return (
    <DndContext id="seating" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="space-y-4">
        <SummaryBar />
        <LayoutTabs />

        {tables.length === 0 && data.fixtures.length === 0 && !skippedSetup ? <RoomSetup onSkip={() => setSkippedSetup(true)} /> : null}

        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <span className="flex-1">{error}</span>
            <button type="button" className="underline" onClick={() => setError(null)}>
              Dismiss
            </button>
          </p>
        ) : null}

        {held ? (
          <div className="sticky top-2 z-20 flex items-center gap-2 rounded border border-ink bg-ink px-3 py-2 text-sm text-white shadow">
            <span className="flex-1">
              Holding <strong>{held.label}</strong> — tap a table or chair to seat them.
            </span>
            <button type="button" className="underline" onClick={() => hold(null)}>
              Put down
            </button>
          </div>
        ) : null}

        <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-4">
            <Tray />
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="View" className="flex gap-1">
                {(["tables", "room"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => choose(v)}
                    className={`rounded px-3 py-1.5 text-sm ${view === v ? "bg-ink text-white" : "text-muted hover:bg-line/50"}`}
                  >
                    {v === "tables" ? "Tables" : "Room"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-sm">
                <button type="button" className="btn py-1" disabled={!canUndo} onClick={undo} title="Undo (Ctrl or ⌘ Z)" aria-label="Undo">
                  ↶ Undo
                </button>
                <button type="button" className="btn py-1" disabled={!canRedo} onClick={redo} title="Redo (Shift Ctrl or ⌘ Z)" aria-label="Redo">
                  Redo ↷
                </button>
                {undoLabel || redoLabel ? (
                  <span className="hidden max-w-[16rem] truncate text-xs text-muted md:inline" aria-live="polite">
                    {undoLabel ?? `Undone: ${redoLabel}`}
                  </span>
                ) : null}
              </div>
              <details className="relative">
                <summary className="btn cursor-pointer list-none py-1">Show</summary>
                <div className="absolute z-30 mt-1 w-52 space-y-1 rounded border border-line bg-white p-3 text-sm shadow-lg">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={show.names} onChange={(e) => setShow({ ...show, names: e.target.checked })} /> Names on chairs</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={show.numbers} onChange={(e) => setShow({ ...show, numbers: e.target.checked })} /> Seat numbers</label>
                  <p className="text-xs text-muted">Meal colours: pick an answer under Colour by.</p>
                </div>
              </details>
              <details className="relative ml-auto">
                <summary className="btn cursor-pointer list-none py-1">Print &amp; share</summary>
                <ul className="absolute right-0 z-30 mt-1 w-64 rounded border border-line bg-white py-1 text-sm shadow-lg">
                  {unseated > 0 ? (
                    <li className="border-b border-line px-3 py-1.5 text-amber-800">
                      {unseated} {unseated === 1 ? "person isn't" : "people aren't"} seated yet —{" "}
                      <button type="button" className="underline" onClick={() => document.getElementById("seating-tray")?.scrollIntoView({ behavior: "smooth" })}>
                        see who
                      </button>
                    </li>
                  ) : null}
                  {[
                    ["tables", "By table — for the venue"],
                    ["names", "By name — the entrance board"],
                    ["catering", "Numbers — for the caterer"],
                    ["floor", "Floor plan"],
                    ["escort", "Escort cards"],
                    ["cards", "Place cards"],
                  ].map(([v, label]) => (
                    <li key={v}>
                      <Link href={printHref(v!)} target="_blank" className="block px-3 py-1.5 hover:bg-paper">
                        {label}
                      </Link>
                    </li>
                  ))}
                  <li className="border-t border-line">
                    <a href={`/api/export/seating?event=${eventId}`} className="block px-3 py-1.5 hover:bg-paper">
                      Download CSV
                    </a>
                  </li>
                </ul>
              </details>
            </div>

            {view === "tables" ? <TablesGrid /> : <RoomView />}
          </div>
        </div>

        <RulesPanel />
        <StylesPanel />
        <SnapshotsPanel snapshots={snapshots} collaborators={collaborators} />
        <DayActivityPanel activity={dayActivity} />
        <RevealPanel />
        <TableDrawer />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? <DragPreview label={dragging.label} count={dragging.guestIds.length} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
