"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { addSection, archiveList, reorderItems } from "@/server/actions/lists";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import { sortCompletedLast } from "@/lib/lists/sort";
import { ItemRow } from "./item-row";
import { QuickAdd } from "./quick-add";
import type { CollaboratorRow, ListItemRow, ListRow, ListSectionRow } from "@/lib/types/database";

/**
 * One list: sections, inline add/edit, tick, flag, date, assign, sub-items,
 * and free reordering (spec 1, section 6, `/lists/[id]`). Reordering renumbers
 * the section it happens in rather than computing a fractional index —
 * list_items.sort_order is a plain integer (0004), not a fractional rank
 * string like households.rank, so there is no midpoint to compute. See
 * reorderItems in src/server/actions/lists.ts.
 */
export function ListDetail({
  list,
  sections,
  items,
  collaborators,
  currentUserId,
  budgetLinksByItem = {},
}: {
  list: ListRow;
  sections: ListSectionRow[];
  items: ListItemRow[];
  collaborators: CollaboratorRow[];
  currentUserId?: string;
  /** Budget lines linked to each item, keyed by list_item_id — spec 6, section 7's reverse badge. */
  budgetLinksByItem?: Record<string, { id: string; label: string }[]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`list-item-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const topLevel = useMemo(() => items.filter((i) => !i.parent_item_id), [items]);
  const subItemsByParent = useMemo(() => {
    const map = new Map<string, ListItemRow[]>();
    for (const item of items) {
      if (!item.parent_item_id) continue;
      const list = map.get(item.parent_item_id) ?? [];
      list.push(item);
      map.set(item.parent_item_id, list);
    }
    for (const [parentId, subItems] of map) {
      map.set(
        parentId,
        sortCompletedLast(subItems, (i) => i.status === "done"),
      );
    }
    return map;
  }, [items]);

  const groups = useMemo(() => {
    const bySection = new Map<string | null, ListItemRow[]>();
    for (const item of topLevel) {
      const key = item.section_id;
      const list = bySection.get(key) ?? [];
      list.push(item);
      bySection.set(key, list);
    }
    for (const items of bySection.values()) items.sort((a, b) => a.sort_order - b.sort_order);

    const ordered: { section: ListSectionRow | null; items: ListItemRow[] }[] = sections.map((section) => ({
      section,
      items: bySection.get(section.id) ?? [],
    }));
    const unsectioned = bySection.get(null) ?? [];
    if (unsectioned.length > 0 || sections.length === 0) {
      ordered.push({ section: null, items: unsectioned });
    }
    return ordered;
  }, [topLevel, sections]);

  function onArchive() {
    if (!confirm(`Archive "${list.title}"? It leaves the sidebar but nothing is deleted.`)) return;
    startTransition(async () => {
      const result = await archiveList(list.id);
      if (!result.ok) setError(result.error);
      else router.push("/lists");
    });
  }

  function onAddSection() {
    if (!sectionTitle.trim()) return;
    startTransition(async () => {
      const result = await addSection(list.id, sectionTitle);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSectionTitle("");
        setAddingSection(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: list.color ?? DEFAULT_LIST_COLOR }}
            aria-hidden
          />
          {list.icon ? <span aria-hidden>{list.icon}</span> : null}
          <h1 className="font-serif text-2xl">{list.title}</h1>
        </div>
        <button type="button" className="btn" onClick={onArchive}>
          Archive list
        </button>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="space-y-6">
        {groups.map(({ section, items }) => (
          <SectionGroup
            key={section?.id ?? "unsectioned"}
            listId={list.id}
            section={section}
            items={items}
            subItemsByParent={subItemsByParent}
            collaborators={collaborators}
            currentUserId={currentUserId}
            budgetLinksByItem={budgetLinksByItem}
            highlightId={highlightId}
          />
        ))}
      </div>

      {addingSection ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={sectionTitle}
            onChange={(e) => setSectionTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddSection();
              if (e.key === "Escape") setAddingSection(false);
            }}
            placeholder="Section title"
            className="field max-w-xs text-sm"
          />
          <button type="button" className="btn-primary" onClick={onAddSection}>
            Add
          </button>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setAddingSection(true)}>
          Add a section
        </button>
      )}
    </div>
  );
}

function SectionGroup({
  listId,
  section,
  items,
  subItemsByParent,
  collaborators,
  currentUserId,
  budgetLinksByItem,
  highlightId,
}: {
  listId: string;
  section: ListSectionRow | null;
  items: ListItemRow[];
  subItemsByParent: Map<string, ListItemRow[]>;
  collaborators: CollaboratorRow[];
  currentUserId?: string;
  budgetLinksByItem: Record<string, { id: string; label: string }[]>;
  highlightId: string | null;
}) {
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [, startTransition] = useTransition();
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rawOrder = order.filter((id) => itemsById.has(id));
  for (const item of items) if (!rawOrder.includes(item.id)) rawOrder.push(item.id);

  /**
   * What's actually shown, and what drag-and-drop operates over: done items
   * sunk below every not-done one (spec 10). `rawOrder` still records manual
   * ordering within each of those two groups — this is a display-time
   * partition, not a change to what gets persisted as `sort_order`, so a
   * move that would cross the done/not-done line just lands on the correct
   * side of it instead, rather than actually interleaving.
   */
  const currentOrder = sortCompletedLast(rawOrder, (id) => itemsById.get(id)?.status === "done");
  const doneStart = currentOrder.findIndex((id) => itemsById.get(id)?.status === "done");
  const firstDoneIndex = doneStart === -1 ? currentOrder.length : doneStart;

  /** Shared by drag-and-drop and the Move up/down buttons — see rank-list.tsx for the same split. */
  function applyMove(from: number, to: number) {
    if (from < 0 || to < 0 || to >= currentOrder.length || from === to) return;
    const reordered = [...currentOrder];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setOrder(reordered);

    startTransition(async () => {
      // Order is already reflected locally above; this just persists it.
      await reorderItems(reordered);
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    applyMove(currentOrder.indexOf(active.id as string), currentOrder.indexOf(over.id as string));
  }

  return (
    <section>
      {section ? <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">{section.title}</h2> : null}
      <div className="card divide-y divide-line/60 px-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={currentOrder} strategy={verticalListSortingStrategy}>
            {currentOrder.map((id, index) => {
              const item = itemsById.get(id);
              if (!item) return null;
              return (
                <SortableItem
                  key={id}
                  item={item}
                  subItems={subItemsByParent.get(id) ?? []}
                  collaborators={collaborators}
                  currentUserId={currentUserId}
                  budgetLinks={budgetLinksByItem[id] ?? []}
                  highlighted={id === highlightId}
                  onMoveUp={index > 0 && index !== firstDoneIndex ? () => applyMove(index, index - 1) : undefined}
                  onMoveDown={
                    index < currentOrder.length - 1 && index !== firstDoneIndex - 1
                      ? () => applyMove(index, index + 1)
                      : undefined
                  }
                />
              );
            })}
          </SortableContext>
        </DndContext>
        {items.length === 0 ? <p className="py-3 text-sm text-muted">Nothing here yet.</p> : null}
      </div>
      <div className="mt-2">
        <QuickAdd listId={listId} sectionId={section?.id ?? null} />
      </div>
    </section>
  );
}

function SortableItem({
  item,
  subItems,
  collaborators,
  currentUserId,
  budgetLinks,
  highlighted,
  onMoveUp,
  onMoveDown,
}: {
  item: ListItemRow;
  subItems: ListItemRow[];
  collaborators: CollaboratorRow[];
  currentUserId?: string;
  budgetLinks: { id: string; label: string }[];
  highlighted: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "z-10 bg-white opacity-90 shadow-md" : undefined}
    >
      <ItemRow
        item={item}
        subItems={subItems}
        collaborators={collaborators}
        currentUserId={currentUserId}
        budgetLinks={budgetLinks}
        highlighted={highlighted}
        allowSubItems
        dragHandle={
          <div className="mt-1 flex shrink-0 flex-col items-center">
            <button
              type="button"
              aria-label={`Reorder "${item.title}"`}
              className="cursor-grab px-0.5 text-muted hover:text-ink active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              ⠿
            </button>
            {/* Touch-friendly fallback for drag reorder (spec 03 section 7, decision 6). */}
            <div className="mt-0.5 flex flex-col gap-0">
              <button
                type="button"
                aria-label={`Move "${item.title}" up`}
                disabled={!onMoveUp}
                onClick={onMoveUp}
                className="rounded px-0.5 text-xs leading-none text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move "${item.title}" down`}
                disabled={!onMoveDown}
                onClick={onMoveDown}
                className="rounded px-0.5 text-xs leading-none text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </div>
        }
      />
    </div>
  );
}
