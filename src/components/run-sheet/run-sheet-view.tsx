"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderRunSheetItem } from "@/server/actions/run-sheet";
import { formatTime, pluralise } from "@/lib/format";
import { RunSheetItemEditor } from "./item-editor";
import type { RunSheetItemView, RunSheetTrack } from "@/lib/types/database";

const TRACKS: { value: RunSheetTrack; label: string }[] = [
  { value: "guests", label: "Guests" },
  { value: "couple", label: "Couple" },
  { value: "vendors", label: "Vendors" },
  { value: "other", label: "Other" },
];

/**
 * Parallel columns by track (spec 5, B6 decision 4) rather than one
 * interleaved list, so two things happening at the same time — the band
 * setting up while the photographer is on family portraits — stay legible
 * as two separate threads instead of shuffled together by time.
 *
 * Conflicts surface two ways at once (B6 decision 2): a marker on the
 * specific item, and this summary count at the top of the page.
 */
export function RunSheetView({
  eventId,
  timeZone,
  items,
}: {
  eventId: string;
  timeZone: string;
  items: RunSheetItemView[];
}) {
  const conflictCount = items.filter((i) => i.conflict).length;
  const [editing, setEditing] = useState<{ item: RunSheetItemView | null; track: RunSheetTrack } | null>(null);

  return (
    <div className="space-y-4">
      {conflictCount > 0 ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {pluralise(conflictCount, "item runs")} past a pinned time below — not blocking, just worth a look.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        {TRACKS.map((track) => (
          <TrackColumn
            key={track.value}
            track={track.value}
            label={track.label}
            items={items.filter((i) => i.track === track.value)}
            allItems={items}
            eventId={eventId}
            timeZone={timeZone}
            onEdit={(item) => setEditing({ item, track: track.value })}
            onAdd={() => setEditing({ item: null, track: track.value })}
          />
        ))}
      </div>

      <RunSheetItemEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        eventId={eventId}
        timeZone={timeZone}
        item={editing?.item ?? null}
        allItems={items}
        defaultTrack={editing?.track}
      />
    </div>
  );
}

function TrackColumn({
  track,
  label,
  items,
  allItems,
  eventId,
  timeZone,
  onEdit,
  onAdd,
}: {
  track: RunSheetTrack;
  label: string;
  items: RunSheetItemView[];
  allItems: RunSheetItemView[];
  eventId: string;
  timeZone: string;
  onEdit: (item: RunSheetItemView) => void;
  onAdd: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const dragged = items[from];
    if (!dragged || dragged.pinned) return; // Pinned items never move on their own.

    const reordered = [...items];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragged);
    const newPredecessorId = reordered[to - 1]?.id ?? null;

    startTransition(async () => {
      const result = await reorderRunSheetItem(dragged.id, newPredecessorId);
      if (result.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="card space-y-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{label}</h2>
        <button type="button" className="text-xs text-ink hover:underline" onClick={onAdd}>
          + Add item
        </button>
      </div>

      {error ? <p className="text-xs text-red-700">{error}</p> : null}

      {items.length === 0 ? (
        <p className="text-xs text-muted">Nothing on this track yet.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <RunSheetRow key={item.id} item={item} timeZone={timeZone} onEdit={() => onEdit(item)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function RunSheetRow({
  item,
  timeZone,
  onEdit,
}: {
  item: RunSheetItemView;
  timeZone: string;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: item.pinned,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 rounded border px-2 py-1.5 text-sm
        ${isDragging ? "z-10 bg-white opacity-90 shadow-md" : "bg-white"}
        ${item.conflict ? "border-red-300" : "border-line/60"}`}
    >
      <button
        type="button"
        aria-label={item.pinned ? `${item.title} is pinned` : `Reorder ${item.title}`}
        disabled={item.pinned}
        className="mt-0.5 shrink-0 cursor-grab px-1 text-muted hover:text-ink active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        {...attributes}
        {...listeners}
      >
        {item.pinned ? "📌" : "⠿"}
      </button>

      <button type="button" onClick={onEdit} className="flex-1 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{item.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {item.starts_at ? formatTime(item.starts_at, timeZone) : "Time TBD"}
          </span>
        </span>
        <span className="block text-xs text-muted">
          {pluralise(item.duration_minutes, "minute")}
          {item.location ? ` · ${item.location}` : ""}
          {item.owner ? ` · ${item.owner}` : ""}
        </span>
        {item.conflict ? (
          <span className="mt-0.5 block text-xs font-medium text-red-700">
            ⚠ runs past the next pinned time
          </span>
        ) : null}
      </button>
    </li>
  );
}
