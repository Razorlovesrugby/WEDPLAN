"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { setDueDate } from "@/server/actions/lists";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import type { TimelineItemView } from "@/lib/types/database";

type Zoom = "week" | "month" | "quarter";

function parseIso(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}
function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

/** Every dated item across every list, chronological, grouped/coloured by list (spec 1, section 6). */
export function TimelineView({
  items,
  budgetLinksByItem = {},
}: {
  items: TimelineItemView[];
  /** Budget lines linked to each item, keyed by list_item_id — spec 6, section 7's reverse badge. */
  budgetLinksByItem?: Record<string, { id: string; label: string }[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [zoom, setZoom] = useState<Zoom>("month");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`timeline-item-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const buckets = useMemo(() => bucketize(items, zoom), [items, zoom]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const targetDate = String(over.id);
    const item = items.find((i) => i.id === itemId);
    if (!item || item.due_date === targetDate) return;

    startTransition(async () => {
      const result = await setDueDate(itemId, targetDate);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label="Zoom">
          {(["week", "month", "quarter"] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={`btn px-3 py-1 text-xs capitalize ${zoom === z ? "bg-ink text-white" : ""}`}
            >
              {z}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Drag a card to a different column to reschedule it.</p>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {buckets.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          Nothing on the timeline yet. Set a due date on any item, anywhere, and it appears here.
        </p>
      ) : (
        <DndContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {buckets.map((bucket) => (
              <TimelineColumn key={bucket.key} bucket={bucket} budgetLinksByItem={budgetLinksByItem} highlightId={highlightId} />
            ))}
          </div>
        </DndContext>
      )}
    </div>
  );
}

type Bucket = { key: string; label: string; anchorDate: string; items: TimelineItemView[] };

function bucketize(items: TimelineItemView[], zoom: Zoom): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const item of items) {
    const date = parseIso(item.due_date);
    let key: string;
    let label: string;
    let anchorDate: string;

    if (zoom === "week") {
      key = item.due_date;
      anchorDate = item.due_date;
      label = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
    } else if (zoom === "month") {
      const monday = mondayOf(date);
      anchorDate = toIso(monday);
      key = anchorDate;
      label = `Week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(monday)}`;
    } else {
      const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      anchorDate = toIso(first);
      key = anchorDate;
      label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(first);
    }

    const bucket = map.get(key) ?? { key, label, anchorDate, items: [] };
    bucket.items.push(item);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => (a.anchorDate < b.anchorDate ? -1 : 1));
}

function TimelineColumn({
  bucket,
  budgetLinksByItem,
  highlightId,
}: {
  bucket: Bucket;
  budgetLinksByItem: Record<string, { id: string; label: string }[]>;
  highlightId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket.anchorDate });

  return (
    <div
      ref={setNodeRef}
      className={`w-56 shrink-0 rounded-lg border p-2 ${isOver ? "border-accent bg-accent/5" : "border-line bg-white"}`}
    >
      <p className="mb-2 px-1 text-xs font-medium text-muted">
        {bucket.label} <span className="text-muted/70">· {bucket.items.length}</span>
      </p>
      <div className="space-y-1.5">
        {bucket.items.map((item) => (
          <TimelineCard
            key={item.id}
            item={item}
            budgetLinks={budgetLinksByItem[item.id] ?? []}
            highlighted={item.id === highlightId}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineCard({
  item,
  budgetLinks,
  highlighted,
}: {
  item: TimelineItemView;
  budgetLinks: { id: string; label: string }[];
  highlighted: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });

  return (
    <div
      id={`timeline-item-${item.id}`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        borderLeftColor: item.list_color ?? DEFAULT_LIST_COLOR,
      }}
      className={`cursor-grab rounded border border-l-4 bg-white px-2 py-1.5 text-xs shadow-sm active:cursor-grabbing
        ${isDragging ? "relative z-10 opacity-80 shadow-md" : ""}
        ${item.status === "done" ? "line-through opacity-60" : ""}
        ${highlighted ? "ring-2 ring-accent" : ""}`}
    >
      <p className="truncate font-medium">{item.title}</p>
      <p className="truncate text-muted">
        {item.list_title}
        {item.flagged ? " · ⚑" : ""}
        {item.priority > 0 ? ` · ${"!".repeat(item.priority)}` : ""}
      </p>
      {budgetLinks.length > 0 ? (
        <p className="mt-0.5 truncate">
          {budgetLinks.map((link) => (
            <a
              key={link.id}
              href={`/budget?item=${link.id}`}
              className="rounded bg-tierA/10 px-1 py-0.5 text-tierA hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              💰 {link.label}
            </a>
          ))}
        </p>
      ) : null}
    </div>
  );
}
