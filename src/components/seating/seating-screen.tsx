"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { serialiseColourBy, type ColourBy } from "@/lib/seating/colour";
import type { SeatingSnapshotSummary } from "@/server/queries/seating";
import { DragPreview, type DragPayload } from "./guest-chip";
import { RoomView } from "./room-view";
import { RulesPanel } from "./rules-panel";
import { SeatingProvider, useSeating, type SeatingData } from "./seating-state";
import { RevealPanel, SnapshotsPanel } from "./snapshots-panel";
import { SummaryBar } from "./summary-bar";
import { TableDrawer } from "./table-drawer";
import { TablesGrid } from "./tables-grid";
import { Tray } from "./tray";

type View = "tables" | "room";
const VIEW_KEY = "wedplan.seating.view";

export function SeatingScreen({
  eventId,
  timeZone,
  data,
  snapshots,
  collaborators,
  initialColourBy,
}: {
  eventId: string;
  timeZone: string;
  data: SeatingData;
  snapshots: SeatingSnapshotSummary[];
  collaborators: { user_id: string; display_name: string | null; role: string }[];
  initialColourBy: ColourBy;
}) {
  return (
    <SeatingProvider eventId={eventId} timeZone={timeZone} data={data} initialColourBy={initialColourBy}>
      <Screen snapshots={snapshots} collaborators={collaborators} />
    </SeatingProvider>
  );
}

function Screen({
  snapshots,
  collaborators,
}: {
  snapshots: SeatingSnapshotSummary[];
  collaborators: { user_id: string; display_name: string | null; role: string }[];
}) {
  const { eventId, move, error, setError, held, hold, colourBy } = useSeating();
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
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

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
    `/events/${eventId}/seating/print?view=${v}${colourParam ? `&colour=${encodeURIComponent(colourParam)}` : ""}`;

  return (
    <DndContext id="seating" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="space-y-4">
        <SummaryBar />

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
              <details className="relative ml-auto">
                <summary className="btn cursor-pointer list-none py-1">Print &amp; export</summary>
                <ul className="absolute right-0 z-30 mt-1 w-64 rounded border border-line bg-white py-1 text-sm shadow-lg">
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
        <SnapshotsPanel snapshots={snapshots} collaborators={collaborators} />
        <RevealPanel />
        <TableDrawer />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? <DragPreview label={dragging.label} count={dragging.guestIds.length} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
