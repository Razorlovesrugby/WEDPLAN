"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
import { useVirtualizer } from "@tanstack/react-virtual";
import { moveHousehold, setCutLine } from "@/server/actions/rank";
import { tierFor, type CutLine, type Tier } from "@/lib/tier";
import { tierTextClass } from "@/lib/tier-colors";
import type { CutLineRow, HouseholdView } from "@/lib/types/database";

type Row = HouseholdView;

const ROW_HEIGHT = 52;

function toCutLine(row: CutLineRow): CutLine {
  return { label: row.label, position: row.position, boundaryRank: row.boundary_rank };
}

/**
 * The ranked household list.
 *
 * Virtualised from the first commit rather than when it starts to hurt: the
 * spec put the pain threshold at roughly 300 households, and retrofitting
 * virtualisation into a working drag interaction is far more expensive than
 * starting with it.
 *
 * A drag writes one cell. The moved household gets a fractional rank between
 * its new neighbours and nothing else is touched, so the other collaborator
 * dragging at the same moment cannot renumber rows out from under this one.
 */
export function RankList({
  households,
  capacity,
  cutLines,
}: {
  households: Row[];
  capacity: number | null;
  cutLines: CutLineRow[];
}) {
  const lines = useMemo(() => cutLines.map(toCutLine), [cutLines]);
  // Only non-trailing lines take a household boundary — the last one by
  // position is always the catch-all, enforced null server-side.
  const assignableLines = useMemo(
    () => [...cutLines].sort((a, b) => a.position - b.position).slice(0, -1),
    [cutLines],
  );
  const [rows, setRows] = useState<Row[]>(households);
  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (_current: Row[], next: Row[]) => next,
  );
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const virtualizer = useVirtualizer({
    count: optimisticRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  /**
   * Seat totals are recomputed here rather than read from the server's
   * `seats_cumulative`, because during an optimistic reorder the server's
   * numbers describe the old order. The cut line has to move with the drag or
   * it is worse than no cut line at all.
   */
  const cumulative = useMemo(() => {
    let running = 0;
    return optimisticRows.map((row) => (running += row.seat_count));
  }, [optimisticRows]);

  const capacityIndex = useMemo(() => {
    if (capacity === null) return -1;
    return cumulative.findIndex((seats) => seats > capacity);
  }, [cumulative, capacity]);

  const ids = useMemo(() => optimisticRows.map((row) => row.id), [optimisticRows]);

  /**
   * Shared by drag-and-drop and the Move up/down buttons (the touch-friendly
   * fallback, spec 03 section 7 decision 6) — both are "put this row at
   * index `to`", just reached differently.
   */
  function applyMove(from: number, to: number) {
    if (from < 0 || to < 0 || to >= optimisticRows.length || from === to) return;

    const reordered = [...optimisticRows];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);

    // Neighbours in the NEW order. Null at either end means "the list ends
    // here", which is what the server turns into an open-ended rank.
    const beforeId = reordered[to - 1]?.id ?? null;
    const afterId = reordered[to + 1]?.id ?? null;

    startTransition(async () => {
      applyOptimistic(reordered);
      const result = await moveHousehold(moved.id, beforeId, afterId);
      if (result.ok) {
        setRows(reordered.map((r) => (r.id === moved.id ? { ...r, rank: result.data.rank } : r)));
        setError(null);
      } else {
        // Snap back to the last order the server confirmed.
        setError(result.error);
      }
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = optimisticRows.findIndex((r) => r.id === active.id);
    const to = optimisticRows.findIndex((r) => r.id === over.id);
    applyMove(from, to);
  }

  function onSetCut(lineId: string, householdId: string) {
    startTransition(async () => {
      const result = await setCutLine(lineId, householdId);
      if (!result.ok) setError(result.error);
    });
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div
            ref={scrollRef}
            className="card max-h-[70vh] overflow-auto"
            style={{ contain: "layout paint" }}
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {items.map((virtualRow) => {
                const row = optimisticRows[virtualRow.index];
                if (!row) return null;
                const tier = tierFor(row.rank, lines);
                const boundaryHere = assignableLines.filter((l) => l.boundary_rank === row.rank);
                return (
                  <div
                    key={row.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <SortableRow
                      row={row}
                      index={virtualRow.index}
                      tier={tier}
                      seatsCumulative={cumulative[virtualRow.index] ?? 0}
                      isCutLine={boundaryHere.length > 0}
                      isCapacityLine={virtualRow.index === capacityIndex - 1}
                      assignableLines={assignableLines}
                      onSetCut={onSetCut}
                      onMoveUp={virtualRow.index > 0 ? () => applyMove(virtualRow.index, virtualRow.index - 1) : undefined}
                      onMoveDown={
                        virtualRow.index < optimisticRows.length - 1
                          ? () => applyMove(virtualRow.index, virtualRow.index + 1)
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </SortableContext>
      </DndContext>

      <p className="text-xs text-muted">
        Drag to reorder, or focus a row and use space then the arrow keys. The solid line is the cut
        you set; the dashed line is where the seats actually run out.
      </p>
    </div>
  );
}

function SortableRow({
  row,
  index,
  tier,
  seatsCumulative,
  isCutLine,
  isCapacityLine,
  assignableLines,
  onSetCut,
  onMoveUp,
  onMoveDown,
}: {
  row: Row;
  index: number;
  tier: Tier;
  seatsCumulative: number;
  isCutLine: boolean;
  isCapacityLine: boolean;
  assignableLines: CutLineRow[];
  onSetCut: (lineId: string, householdId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const tierColour = tierTextClass(tier.position);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex h-full items-center gap-3 border-b px-3 text-sm
        ${isDragging ? "z-10 bg-white opacity-90 shadow-md" : "bg-white"}
        ${isCutLine ? "border-b-2 border-b-ink" : isCapacityLine ? "border-b-2 border-dashed border-b-red-400" : "border-line/60"}`}
    >
      <button
        type="button"
        aria-label={`Reorder ${row.display_name}`}
        className="cursor-grab px-1 text-muted hover:text-ink active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <span className="hidden w-8 shrink-0 text-right tabular-nums text-xs text-muted sm:inline">
        {index + 1}
      </span>

      <Link href={`/households/${row.id}`} className="flex-1 truncate hover:underline">
        {row.display_name}
      </Link>

      <span className="hidden w-20 shrink-0 text-right text-xs text-muted tabular-nums sm:inline">
        {row.seat_count} {row.seat_count === 1 ? "seat" : "seats"}
      </span>
      <span
        className="hidden w-16 shrink-0 text-right text-xs text-muted tabular-nums sm:inline"
        title="Running total"
      >
        {seatsCumulative}
      </span>
      <span
        className={`hidden w-24 shrink-0 truncate text-center text-xs font-medium sm:inline ${tierColour}`}
        title={tier.label}
      >
        {tier.label}
      </span>

      {/* Touch-friendly fallback for drag reorder (spec 03 section 7, decision 6) —
          adjacent-swap buttons, always visible rather than hover-gated. */}
      <div className="flex shrink-0 gap-0.5">
        <button
          type="button"
          aria-label={`Move ${row.display_name} up`}
          disabled={!onMoveUp}
          onClick={onMoveUp}
          className="rounded px-1 text-xs text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label={`Move ${row.display_name} down`}
          disabled={!onMoveDown}
          onClick={onMoveDown}
          className="rounded px-1 text-xs text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
        >
          ↓
        </button>
      </div>

      {assignableLines.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onSetCut(e.target.value, row.id);
          }}
          className="field hidden w-28 shrink-0 text-xs sm:inline"
          title="End a cut line directly below this household"
        >
          <option value="">Cut here…</option>
          {assignableLines.map((line) => (
            <option key={line.id} value={line.id}>
              End &ldquo;{line.label}&rdquo;
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
