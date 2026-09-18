"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { setDueDate } from "@/server/actions/lists";
import { buildDigest, type DigestItem } from "@/lib/reminders/digest";
import { monthLabel, monthWeeks, shiftMonth, monthStart } from "@/lib/calendar";
import { todayIso } from "@/lib/lists/generate";
import { listAccentBorderColor } from "@/lib/list-colors";
import { TaskPreviewPopup } from "./task-preview-popup";
import type { TimelineItemView } from "@/lib/types/database";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid over the same v_timeline_items every /timeline read already
 * uses (spec 03) — additive alongside /timeline, not a replacement (spec
 * 03 section 7, decision 2). Overdue/due-soon marking reuses buildDigest
 * so this screen, the dashboard tiles, and the weekly email can never
 * disagree about what counts as urgent (same invariant spec 02 built for
 * the dashboard/email pairing).
 *
 * Drag-to-reschedule mirrors TimelineView exactly (same setDueDate action,
 * same dnd-kit pattern). Each card also carries a native date input as the
 * touch-friendly "Move to…" fallback (spec 03 section 7, decision 6) —
 * a native date input already opens the platform's own picker on a phone,
 * so no custom picker component was needed for this surface.
 *
 * Clicking a card's title (rather than dragging it) opens a read-only
 * preview with a click-through to the task's real location on
 * /lists/[id] — same pattern as BudgetLinksPopup (spec 6). A distance
 * activation constraint on the pointer sensor keeps a plain click from
 * being swallowed as a zero-distance drag.
 */
export function CalendarView({
  items,
  windowDays,
  timezone,
}: {
  items: TimelineItemView[];
  windowDays: number;
  timezone: string;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(() => monthStart(todayIso()));
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<TimelineItemView | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const today = todayIso();
  const weeks = useMemo(() => monthWeeks(month), [month]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, TimelineItemView[]>();
    for (const item of items) {
      const list = map.get(item.due_date) ?? [];
      list.push(item);
      map.set(item.due_date, list);
    }
    return map;
  }, [items]);

  const urgency = useMemo(() => {
    const digestItems: DigestItem[] = items.map((item) => ({
      id: item.id,
      title: item.title,
      due_date: item.due_date,
      list_title: item.list_title,
      list_color: item.list_color,
      snoozed_until: item.snoozed_until,
      done: item.status === "done",
    }));
    const digest = buildDigest(digestItems, today, windowDays);
    const overdue = new Set<string>();
    const dueSoon = new Set<string>();
    for (const group of digest.groups) {
      for (const i of group.overdue) overdue.add(i.id);
      for (const i of group.dueSoon) dueSoon.add(i.id);
    }
    return { overdue, dueSoon };
  }, [items, today, windowDays]);

  function reschedule(itemId: string, targetDate: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.due_date === targetDate) return;
    startTransition(async () => {
      const result = await setDueDate(itemId, targetDate);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    reschedule(String(active.id), String(over.id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className="btn px-2 py-1" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ←
          </button>
          <p className="min-w-36 text-center font-serif text-lg">{monthLabel(month)}</p>
          <button type="button" className="btn px-2 py-1" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            →
          </button>
          <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setMonth(monthStart(today))}>
            Today
          </button>
        </div>
        <p className="text-xs text-muted">Drag a card to a day, or use its date field, to reschedule.</p>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="bg-paper px-2 py-1 text-center font-medium text-muted">
              {label}
            </div>
          ))}
          {weeks.flat().map((cell) => (
            <CalendarDay
              key={cell.date}
              date={cell.date}
              inMonth={cell.inMonth}
              isToday={cell.date === today}
              items={itemsByDay.get(cell.date) ?? []}
              urgency={urgency}
              onReschedule={reschedule}
              onPreview={setPreviewItem}
            />
          ))}
        </div>
      </DndContext>

      <TaskPreviewPopup item={previewItem} timezone={timezone} open={previewItem !== null} onClose={() => setPreviewItem(null)} />
    </div>
  );
}

function CalendarDay({
  date,
  inMonth,
  isToday,
  items,
  urgency,
  onReschedule,
  onPreview,
}: {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  items: TimelineItemView[];
  urgency: { overdue: Set<string>; dueSoon: Set<string> };
  onReschedule: (itemId: string, targetDate: string) => void;
  onPreview: (item: TimelineItemView) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const dayNumber = Number(date.slice(-2));

  return (
    <div
      ref={setNodeRef}
      className={`min-h-24 space-y-1 p-1.5 sm:min-h-32 ${
        isOver ? "bg-accent/10" : isToday ? "bg-accent/10 ring-1 ring-inset ring-accent" : inMonth ? "bg-white" : "bg-paper"
      }`}
    >
      <p className={`text-right text-[11px] ${inMonth ? "text-muted" : "text-muted/50"}`}>
        {isToday ? (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent font-bold text-white">
            {dayNumber}
          </span>
        ) : (
          dayNumber
        )}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <CalendarCard
            key={item.id}
            item={item}
            urgent={urgency.overdue.has(item.id) ? "overdue" : urgency.dueSoon.has(item.id) ? "dueSoon" : null}
            onReschedule={onReschedule}
            onPreview={onPreview}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarCard({
  item,
  urgent,
  onReschedule,
  onPreview,
}: {
  item: TimelineItemView;
  urgent: "overdue" | "dueSoon" | null;
  onReschedule: (itemId: string, targetDate: string) => void;
  onPreview: (item: TimelineItemView) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const [movePickerOpen, setMovePickerOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderLeftColor: listAccentBorderColor(item.list_color, item.list_icon),
      }}
      className={`rounded border border-l-4 bg-white px-1.5 py-1 text-[11px] shadow-sm
        ${isDragging ? "relative z-10 opacity-80 shadow-md" : ""}
        ${item.status === "done" ? "opacity-60" : ""}
        ${urgent === "overdue" ? "ring-1 ring-red-400" : urgent === "dueSoon" ? "ring-1 ring-amber-400" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        onClick={() => onPreview(item)}
        className="cursor-grab truncate font-medium active:cursor-grabbing"
      >
        {item.status === "done" ? <span className="line-through">{item.title}</span> : item.title}
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-muted">
          {item.list_icon ? <span aria-hidden>{item.list_icon} </span> : null}
          {item.list_title}
        </span>
        {/* Touch-friendly "move to…" fallback for drag (spec 03 section 7,
            decision 6) — a tap-to-reveal toggle rather than an always-open
            date field, which doesn't fit inside a day cell at phone width.
            Tap works identically for touch and mouse, unlike hover. */}
        <button
          type="button"
          aria-label={`Move "${item.title}" to a different day`}
          aria-expanded={movePickerOpen}
          onClick={() => setMovePickerOpen((v) => !v)}
          className="flex-none px-0.5 leading-none text-muted hover:text-ink"
        >
          📅
        </button>
      </div>
      {movePickerOpen ? (
        <input
          type="date"
          defaultValue={item.due_date}
          autoFocus
          aria-label={`New date for "${item.title}"`}
          onChange={(e) => {
            if (e.target.value) {
              onReschedule(item.id, e.target.value);
              setMovePickerOpen(false);
            }
          }}
          onBlur={() => setMovePickerOpen(false)}
          className="field mt-1 w-full px-1 py-0.5 text-[10px]"
        />
      ) : null}
    </div>
  );
}
