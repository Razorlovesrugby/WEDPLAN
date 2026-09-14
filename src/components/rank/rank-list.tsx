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
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import { moveHousehold, setCutLine } from "@/server/actions/rank";
import { tierFor } from "@/lib/tier";
import type { HouseholdTier, HouseholdView } from "@/lib/types/database";

type Row = HouseholdView;

const ROW_HEIGHT = 52;

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
  cutRank,
  tierBRank,
}: {
  households: Row[];
  capacity: number | null;
  cutRank: string | null;
  tierBRank: string | null;
}) {
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

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = optimisticRows.findIndex((r) => r.id === active.id);
    const to = optimisticRows.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;

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

  function onSetCut(householdId: string, which: "a" | "b") {
    startTransition(async () => {
      const result = await setCutLine(householdId, which);
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
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div
            ref={scrollRef}
            className="card max-h-[70vh] overflow-auto"
            style={{ contain: "strict" }}
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {items.map((virtualRow) => {
                const row = optimisticRows[virtualRow.index];
                if (!row) return null;
                const tier = tierFor(row.rank, cutRank, tierBRank);
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
                      isCutLine={cutRank !== null && row.rank === cutRank}
                      isCapacityLine={virtualRow.index === capacityIndex - 1}
                      onSetCut={onSetCut}
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
  onSetCut,
}: {
  row: Row;
  index: number;
  tier: HouseholdTier;
  seatsCumulative: number;
  isCutLine: boolean;
  isCapacityLine: boolean;
  onSetCut: (id: string, which: "a" | "b") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const tierColour = tier === "A" ? "text-tierA" : tier === "B" ? "text-tierB" : "text-tierC";

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

      <span className="w-8 shrink-0 text-right tabular-nums text-xs text-muted">{index + 1}</span>

      <Link href={`/households/${row.id}`} className="flex-1 truncate hover:underline">
        {row.display_name}
      </Link>

      <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">
        {row.seat_count} {row.seat_count === 1 ? "seat" : "seats"}
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted tabular-nums" title="Running total">
        {seatsCumulative}
      </span>
      <span className={`w-4 shrink-0 text-center text-xs font-medium ${tierColour}`}>{tier}</span>

      <button
        type="button"
        onClick={() => onSetCut(row.id, "a")}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line/50 hover:text-ink"
        title="Put the cut line directly below this household"
      >
        cut here
      </button>
    </div>
  );
}
