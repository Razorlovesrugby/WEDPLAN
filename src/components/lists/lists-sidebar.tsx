"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { reorderLists } from "@/server/actions/lists";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import type { ListRow } from "@/lib/types/database";

const SMART_VIEWS = [
  { view: "today", label: "Today" },
  { view: "scheduled", label: "Scheduled" },
  { view: "flagged", label: "Flagged" },
  { view: "all", label: "All" },
  { view: "mine", label: "Assigned to me" },
] as const;

/**
 * The smart views sit alongside the wedding's own lists, and are never
 * edited directly — they're filters, not storage (spec 1, section 1). The
 * lists themselves, since spec 12, can be dragged (or moved with the
 * up/down buttons) into whatever order the planner wants under "Your
 * lists" — a new `reorderLists` action renumbers `lists.sort_order`, the
 * same column that already decided this order, just never user-editable
 * after creation until now.
 */
export function ListsSidebar({ lists }: { lists: ListRow[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeView = pathname === "/lists" ? (searchParams.get("view") ?? "today") : null;

  const listsById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);

  const order = useMemo(() => {
    const committed = lists.map((l) => l.id);
    if (!orderOverride) return committed;
    const committedSet = new Set(committed);
    const kept = orderOverride.filter((id) => committedSet.has(id));
    for (const id of committed) if (!kept.includes(id)) kept.push(id);
    return kept;
  }, [lists, orderOverride]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function applyMove(from: number, to: number) {
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    const previous = order;
    const reordered = [...order];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setOrderOverride(reordered); // optimistic — confirmed or rolled back below

    startTransition(async () => {
      const result = await reorderLists(reordered);
      if (!result.ok) {
        setOrderOverride(previous);
        setError(result.error);
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    applyMove(order.indexOf(String(active.id)), order.indexOf(String(over.id)));
  }

  return (
    <nav aria-label="Lists" className="w-full shrink-0 space-y-4 sm:w-48">
      <div className="space-y-0.5">
        {SMART_VIEWS.map(({ view, label }) => (
          <Link
            key={view}
            href={`/lists?view=${view}`}
            aria-current={activeView === view ? "page" : undefined}
            className={`block rounded px-2 py-1.5 text-sm ${
              activeView === view ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div>
        <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted">Your tasks</p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {order.map((id, index) => {
                const list = listsById.get(id);
                if (!list) return null;
                return (
                  <SortableListLink
                    key={id}
                    list={list}
                    active={pathname === `/lists/${list.id}`}
                    onMoveUp={index > 0 ? () => applyMove(index, index - 1) : undefined}
                    onMoveDown={index < order.length - 1 ? () => applyMove(index, index + 1) : undefined}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        {lists.length === 0 ? <p className="px-2 text-xs text-muted">No lists yet.</p> : null}
        {error ? <p className="px-2 text-xs text-red-700">{error}</p> : null}
      </div>
    </nav>
  );
}

function SortableListLink({
  list,
  active,
  onMoveUp,
  onMoveDown,
}: {
  list: ListRow;
  active: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 ${isDragging ? "z-10 opacity-90" : ""}`}
    >
      <button
        type="button"
        aria-label={`Reorder "${list.title}"`}
        className="shrink-0 cursor-grab px-0.5 text-xs text-muted hover:text-ink active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <Link
        href={`/lists/${list.id}`}
        aria-current={active ? "page" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-sm ${
          active ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"
        }`}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: list.color ?? DEFAULT_LIST_COLOR }}
          aria-hidden
        />
        {list.icon ? <span aria-hidden>{list.icon}</span> : null}
        <span className="truncate">{list.title}</span>
      </Link>
      {/* Touch-friendly fallback for drag reorder (spec 03 section 7, decision 6). */}
      <div className="flex shrink-0 flex-col gap-0">
        <button
          type="button"
          aria-label={`Move "${list.title}" up`}
          disabled={!onMoveUp}
          onClick={onMoveUp}
          className="rounded px-0.5 text-[10px] leading-none text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move "${list.title}" down`}
          disabled={!onMoveDown}
          onClick={onMoveDown}
          className="rounded px-0.5 text-[10px] leading-none text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
        >
          ↓
        </button>
      </div>
    </div>
  );
}
