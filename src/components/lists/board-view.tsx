"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { setStatus } from "@/server/actions/lists";
import type { ListItemStatus } from "@/lib/types/database";
import type { ItemWithList } from "./item-row";

const COLUMNS: { status: ListItemStatus; label: string }[] = [
  { status: "not_started", label: "Not started" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

/**
 * Every item across every list (or one list), grouped by status. A sub-item
 * with sub-items of its own moving here is not possible — one level of
 * nesting only — but a parent's status can still be dragged manually; the
 * database's auto-derivation (spec 1, section 5a) will overwrite it again
 * the next time one of its sub-items' completion changes.
 */
export function BoardView({ items: initialItems }: { items: ItemWithList[] }) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const byStatus = useMemo(() => {
    const map = new Map<ListItemStatus, ItemWithList[]>(COLUMNS.map((c) => [c.status, []]));
    for (const item of items) map.get(item.status)?.push(item);
    return map;
  }, [items]);

  /**
   * Shared by drag-between-columns and the "Move to…" select — the
   * touch-friendly fallback (spec 03 section 7, decision 6). Board status
   * isn't an adjacent-swap surface (there's no "next to where it is now"
   * between three named columns), so this is a destination picker rather
   * than up/down buttons.
   */
  function moveTo(itemId: string, nextStatus: ListItemStatus) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.status === nextStatus) return;

    const previousStatus = item.status;
    // optimistic — the card moves columns instantly, confirmed below
    setItems((current) => current.map((i) => (i.id === itemId ? { ...i, status: nextStatus } : i)));

    startTransition(async () => {
      const result = await setStatus(itemId, nextStatus);
      if (!result.ok) {
        setItems((current) => current.map((i) => (i.id === itemId ? { ...i, status: previousStatus } : i)));
        setError(result.error);
      } else {
        setError(null);
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    moveTo(String(active.id), String(over.id) as ListItemStatus);
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <DndContext onDragEnd={onDragEnd}>
        <div className="grid gap-3 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <BoardColumn
              key={column.status}
              status={column.status}
              label={column.label}
              items={byStatus.get(column.status) ?? []}
              onMoveTo={moveTo}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function BoardColumn({
  status,
  label,
  items,
  onMoveTo,
}: {
  status: ListItemStatus;
  label: string;
  items: ItemWithList[];
  onMoveTo: (itemId: string, status: ListItemStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[16rem] rounded-lg border p-2 ${isOver ? "border-accent bg-accent/5" : "border-line bg-white"}`}
    >
      <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
        {label} <span className="text-muted/70">· {items.length}</span>
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <BoardCard key={item.id} item={item} onMoveTo={onMoveTo} />
        ))}
      </div>
    </div>
  );
}

function BoardCard({
  item,
  onMoveTo,
}: {
  item: ItemWithList;
  onMoveTo: (itemId: string, status: ListItemStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderLeftColor: item.lists?.color ?? "#8a8580",
      }}
      className={`rounded border border-l-4 bg-white px-2 py-1.5 text-xs shadow-sm
        ${isDragging ? "relative z-10 opacity-80 shadow-md" : ""}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <p className="truncate font-medium">{item.title}</p>
        <p className="truncate text-muted">
          {item.lists?.title}
          {item.due_date ? ` · ${item.due_date}` : ""}
          {item.flagged ? " · ⚑" : ""}
        </p>
      </div>
      {/* Touch-friendly "move to…" fallback for drag-between-columns
          (spec 03 section 7, decision 6) — a destination picker, not
          adjacent-swap buttons, since there's no "next" column. */}
      <select
        value={item.status}
        aria-label={`Move "${item.title}" to a different column`}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onMoveTo(item.id, e.target.value as ListItemStatus)}
        className="mt-1 w-full rounded border border-line bg-white px-1 py-0.5 text-[11px] text-muted"
      >
        {COLUMNS.map((c) => (
          <option key={c.status} value={c.status}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
