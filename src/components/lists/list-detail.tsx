"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
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
import { addSection, archiveList, moveItemToSection, reorderSections, updateList } from "@/server/actions/lists";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import { sortCompletedLast } from "@/lib/lists/sort";
import { InlineText } from "@/components/guests/inline-text";
import { ItemRow } from "./item-row";
import { QuickAdd } from "./quick-add";
import type { CollaboratorRow, ListItemRow, ListRow, ListSectionRow } from "@/lib/types/database";

/** A section's own droppable/container id, and back — dnd-kit ids are opaque strings, so a
 * "no section" bucket (which has no `list_sections` row) needs a stand-in of its own. */
function containerKeyFor(sectionId: string | null): string {
  return `container-${sectionId ?? "unsectioned"}`;
}
function sectionIdFromContainerKey(key: string): string | null {
  const raw = key.slice("container-".length);
  return raw === "unsectioned" ? null : raw;
}

/**
 * One list: sections, inline add/edit, tick, flag, date, assign, sub-items,
 * and free reordering (spec 1, section 6, `/lists/[id]`) — plus, since spec
 * 11, moving a task between sections (drag, or a "Section" select) and
 * reordering the sections themselves. Reordering renumbers the destination
 * group rather than computing a fractional index — list_items.sort_order
 * and list_sections.sort_order are plain integers (0004), not a fractional
 * rank string like households.rank, so there is no midpoint to compute. See
 * moveItemToSection and reorderSections in src/server/actions/lists.ts.
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

  // Manual reordering, held locally until the next refresh confirms it —
  // one entry per section (keyed by containerKeyFor) for tasks, one flat
  // array of section ids for the sections themselves. Reconciled against
  // the server's own order below rather than trusted forever, so a refresh
  // from an unrelated action (toggling a task done, adding one via quick
  // add) never strands a stale drag.
  const [itemOrderOverride, setItemOrderOverride] = useState<Record<string, string[]>>({});
  const [sectionOrderOverride, setSectionOrderOverride] = useState<string[] | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`list-item-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const orderedSectionIds = useMemo(() => {
    const committed = sections.map((s) => s.id);
    if (!sectionOrderOverride) return committed;
    const committedSet = new Set(committed);
    const kept = sectionOrderOverride.filter((id) => committedSet.has(id));
    for (const id of committed) if (!kept.includes(id)) kept.push(id);
    return kept;
  }, [sections, sectionOrderOverride]);

  const orderedSections = useMemo(() => {
    const byId = new Map(sections.map((s) => [s.id, s]));
    return orderedSectionIds.map((id) => byId.get(id)).filter((s): s is ListSectionRow => !!s);
  }, [sections, orderedSectionIds]);

  const topLevel = useMemo(() => items.filter((i) => !i.parent_item_id), [items]);
  const itemsById = useMemo(() => new Map(topLevel.map((i) => [i.id, i])), [topLevel]);
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

    const ordered: { section: ListSectionRow | null; items: ListItemRow[] }[] = orderedSections.map((section) => ({
      section,
      items: bySection.get(section.id) ?? [],
    }));
    const unsectioned = bySection.get(null) ?? [];
    if (unsectioned.length > 0 || orderedSections.length === 0) {
      ordered.push({ section: null, items: unsectioned });
    }
    return ordered;
  }, [topLevel, orderedSections]);

  const committedByContainer = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const g of groups) map[containerKeyFor(g.section?.id ?? null)] = g.items.map((i) => i.id);
    return map;
  }, [groups]);

  /** Reconciled per-container order: any local override, minus ids no longer actually there, plus any not yet accounted for. */
  const orderByContainer = useMemo(() => {
    const keys = new Set([...Object.keys(committedByContainer), ...Object.keys(itemOrderOverride)]);
    const result: Record<string, string[]> = {};
    for (const key of keys) {
      const committed = committedByContainer[key] ?? [];
      const override = itemOrderOverride[key];
      if (!override) {
        result[key] = committed;
        continue;
      }
      const committedSet = new Set(committed);
      const kept = override.filter((id) => committedSet.has(id));
      for (const id of committed) if (!kept.includes(id)) kept.push(id);
      result[key] = kept;
    }
    return result;
  }, [committedByContainer, itemOrderOverride]);

  const keyOfItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const [key, ids] of Object.entries(orderByContainer)) for (const id of ids) map.set(id, key);
    return map;
  }, [orderByContainer]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Shared by the cross-section drag, the per-item "Section" select, and Move up/down — see rank-list.tsx for the same split. */
  function applyItemMove(sourceKey: string, destKey: string, itemId: string, overId: string) {
    const sourceOrder = orderByContainer[sourceKey] ?? [];
    const destCommitted = sourceKey === destKey ? sourceOrder : (orderByContainer[destKey] ?? []);
    const withoutItem = destCommitted.filter((id) => id !== itemId);

    let insertAt = withoutItem.length;
    if (!overId.startsWith("container-")) {
      const overIndex = withoutItem.indexOf(overId);
      if (overIndex !== -1) insertAt = overIndex;
    }
    const newDest = [...withoutItem];
    newDest.splice(insertAt, 0, itemId);
    const newSource = sourceKey === destKey ? newDest : sourceOrder.filter((id) => id !== itemId);

    if (sourceKey === destKey && newDest.length === sourceOrder.length && newDest.every((id, i) => id === sourceOrder[i])) {
      return; // dropped back where it started
    }

    setItemOrderOverride((prev) => ({ ...prev, [sourceKey]: newSource, [destKey]: newDest }));

    const destSectionId = sectionIdFromContainerKey(destKey);
    startTransition(async () => {
      const result = await moveItemToSection(itemId, destSectionId, newDest);
      if (!result.ok) setError(result.error);
      else setError(null);
      router.refresh();
    });
  }

  function applyIndexMove(key: string, from: number, to: number) {
    const order = orderByContainer[key] ?? [];
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    const moved = order[from];
    if (!moved) return;
    applyItemMove(key, key, moved, order[to]!);
  }

  function onSelectSection(itemId: string, newSectionId: string | null) {
    const sourceKey = keyOfItem.get(itemId);
    const destKey = containerKeyFor(newSectionId);
    if (!sourceKey || sourceKey === destKey) return;
    applyItemMove(sourceKey, destKey, itemId, destKey);
  }

  function onItemDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const overId = String(over.id);
    const sourceKey = keyOfItem.get(itemId);
    if (!sourceKey) return;
    const destKey = overId.startsWith("container-") ? overId : (keyOfItem.get(overId) ?? sourceKey);
    if (sourceKey === destKey && itemId === overId) return;
    applyItemMove(sourceKey, destKey, itemId, overId);
  }

  function applySectionMove(from: number, to: number) {
    if (from < 0 || to < 0 || to >= orderedSectionIds.length || from === to) return;
    const reordered = [...orderedSectionIds];
    const [moved] = reordered.splice(from, 1);
    if (!moved) return;
    reordered.splice(to, 0, moved);
    setSectionOrderOverride(reordered);
    startTransition(async () => {
      const result = await reorderSections(reordered);
      if (!result.ok) setError(result.error);
      else setError(null);
      router.refresh();
    });
  }

  function onArchive() {
    if (!confirm(`Archive "${list.title}"? It leaves the sidebar but nothing is deleted.`)) return;
    startTransition(async () => {
      const result = await archiveList(list.id);
      if (!result.ok) setError(result.error);
      else router.push("/lists");
    });
  }

  async function saveTitle(next: string) {
    const result = await updateList(list.id, { title: next });
    if (result.ok) router.refresh();
    return result;
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
          <h1>
            <InlineText
              value={list.title}
              ariaLabel="List title"
              onSave={saveTitle}
              className="font-serif text-2xl"
            />
          </h1>
        </div>
        <button type="button" className="btn" onClick={onArchive}>
          Archive list
        </button>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onItemDragEnd}
      >
        <div className="space-y-6">
          {groups.map(({ section }) => {
            const key = containerKeyFor(section?.id ?? null);
            const order = orderByContainer[key] ?? [];
            const sectionIndex = section ? orderedSections.findIndex((s) => s.id === section.id) : -1;
            return (
              <SectionGroup
                key={key}
                containerKey={key}
                listId={list.id}
                section={section}
                order={order}
                itemsById={itemsById}
                allSections={orderedSections}
                subItemsByParent={subItemsByParent}
                collaborators={collaborators}
                currentUserId={currentUserId}
                budgetLinksByItem={budgetLinksByItem}
                highlightId={highlightId}
                isEmpty={order.length === 0}
                onMoveItemUp={(index) => applyIndexMove(key, index, index - 1)}
                onMoveItemDown={(index) => applyIndexMove(key, index, index + 1)}
                onSelectSection={onSelectSection}
                onMoveSectionUp={
                  section && sectionIndex > 0 ? () => applySectionMove(sectionIndex, sectionIndex - 1) : undefined
                }
                onMoveSectionDown={
                  section && sectionIndex !== -1 && sectionIndex < orderedSections.length - 1
                    ? () => applySectionMove(sectionIndex, sectionIndex + 1)
                    : undefined
                }
              />
            );
          })}
        </div>
      </DndContext>

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
  containerKey,
  listId,
  section,
  order,
  itemsById,
  allSections,
  subItemsByParent,
  collaborators,
  currentUserId,
  budgetLinksByItem,
  highlightId,
  isEmpty,
  onMoveItemUp,
  onMoveItemDown,
  onSelectSection,
  onMoveSectionUp,
  onMoveSectionDown,
}: {
  containerKey: string;
  listId: string;
  section: ListSectionRow | null;
  /** Already reconciled (server order + any pending local drag), done items sunk last. */
  order: string[];
  itemsById: Map<string, ListItemRow>;
  allSections: ListSectionRow[];
  subItemsByParent: Map<string, ListItemRow[]>;
  collaborators: CollaboratorRow[];
  currentUserId?: string;
  budgetLinksByItem: Record<string, { id: string; label: string }[]>;
  highlightId: string | null;
  isEmpty: boolean;
  onMoveItemUp: (index: number) => void;
  onMoveItemDown: (index: number) => void;
  onSelectSection: (itemId: string, sectionId: string | null) => void;
  onMoveSectionUp?: () => void;
  onMoveSectionDown?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerKey });

  /**
   * What's actually shown, and what drag-and-drop operates over: done items
   * sunk below every not-done one (spec 10). This is a display-time
   * partition, not a change to what gets persisted as `sort_order` — a move
   * that would cross the done/not-done line just lands on the correct side
   * of it instead, rather than actually interleaving.
   */
  const currentOrder = sortCompletedLast(order, (id) => itemsById.get(id)?.status === "done");
  const doneStart = currentOrder.findIndex((id) => itemsById.get(id)?.status === "done");
  const firstDoneIndex = doneStart === -1 ? currentOrder.length : doneStart;

  return (
    <section>
      {section ? (
        <div className="mb-2 flex items-center gap-1">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{section.title}</h2>
          {/* Touch-friendly, and the only way, to reorder sections (spec 11 §1C) — no drag surface for this one. */}
          <div className="flex gap-0">
            <button
              type="button"
              aria-label={`Move "${section.title}" section up`}
              disabled={!onMoveSectionUp}
              onClick={onMoveSectionUp}
              className="rounded px-0.5 text-xs leading-none text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move "${section.title}" section down`}
              disabled={!onMoveSectionDown}
              onClick={onMoveSectionDown}
              className="rounded px-0.5 text-xs leading-none text-muted hover:bg-line/50 hover:text-ink disabled:opacity-30"
            >
              ↓
            </button>
          </div>
        </div>
      ) : null}
      <div
        ref={setNodeRef}
        className={`card divide-y divide-line/60 px-3 ${isOver ? "outline outline-2 outline-accent/50" : ""}`}
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
                sections={allSections}
                currentSectionId={section?.id ?? null}
                onSelectSection={onSelectSection}
                onMoveUp={index > 0 && index !== firstDoneIndex ? () => onMoveItemUp(index) : undefined}
                onMoveDown={
                  index < currentOrder.length - 1 && index !== firstDoneIndex - 1
                    ? () => onMoveItemDown(index)
                    : undefined
                }
              />
            );
          })}
        </SortableContext>
        {isEmpty ? <p className="py-3 text-sm text-muted">Nothing here yet.</p> : null}
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
  sections,
  currentSectionId,
  onSelectSection,
  onMoveUp,
  onMoveDown,
}: {
  item: ListItemRow;
  subItems: ListItemRow[];
  collaborators: CollaboratorRow[];
  currentUserId?: string;
  budgetLinks: { id: string; label: string }[];
  highlighted: boolean;
  sections: ListSectionRow[];
  currentSectionId: string | null;
  onSelectSection: (itemId: string, sectionId: string | null) => void;
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
        sections={sections}
        currentSectionId={currentSectionId}
        onSelectSection={onSelectSection}
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
