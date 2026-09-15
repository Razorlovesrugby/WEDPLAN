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

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const nextStatus = String(over.id) as ListItemStatus;
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

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <DndContext onDragEnd={onDragEnd}>
        <div className="grid gap-3 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <BoardColumn key={column.status} status={column.status} label={column.label} items={byStatus.get(column.status) ?? []} />
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
}: {
  status: ListItemStatus;
  label: string;
  items: ItemWithList[];
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
          <BoardCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function BoardCard({ item }: { item: ItemWithList }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderLeftColor: item.lists?.color ?? "#8a8580",
      }}
      className={`cursor-grab rounded border border-l-4 bg-white px-2 py-1.5 text-xs shadow-sm active:cursor-grabbing
        ${isDragging ? "relative z-10 opacity-80 shadow-md" : ""}`}
    >
      <p className="truncate font-medium">{item.title}</p>
      <p className="truncate text-muted">
        {item.lists?.title}
        {item.due_date ? ` · ${item.due_date}` : ""}
        {item.flagged ? " · ⚑" : ""}
      </p>
    </div>
  );
}
