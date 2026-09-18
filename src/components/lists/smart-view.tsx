"use client";

import { sortCompletedLast } from "@/lib/lists/sort";
import { HideCompletedToggle, useHideCompleted } from "./hide-completed-toggle";
import { ItemRow, type ItemWithList } from "./item-row";
import type { CollaboratorRow } from "@/lib/types/database";

const EMPTY_COPY: Record<string, string> = {
  today: "Nothing due today.",
  scheduled: "Nothing scheduled — set a due date on any item, anywhere, and it lands here automatically.",
  flagged: "Nothing flagged.",
  all: "No items yet. Add a list, or start one from a template on /setup/plan.",
  mine: "Nothing assigned to you.",
};

/**
 * A smart view: every dated/flagged/assigned item across every list, at
 * once. Never edited directly — it's a filter, not storage (spec 1, section
 * 1) — so there is no add-item box here, only the items themselves.
 */
export function SmartView({
  view,
  items,
  collaborators,
  currentUserId,
}: {
  view: "today" | "scheduled" | "flagged" | "all" | "mine";
  items: ItemWithList[];
  collaborators: CollaboratorRow[];
  currentUserId?: string;
}) {
  const [hideCompleted, setHideCompleted] = useHideCompleted(`view:${view}`);

  if (items.length === 0) {
    return <p className="card p-6 text-sm text-muted">{EMPTY_COPY[view]}</p>;
  }

  // Sinks done items to the bottom (spec 10) — a no-op for "today",
  // "scheduled", and "mine", which already exclude done items at the query.
  const orderedItems = sortCompletedLast(items, (item) => item.status === "done");
  const visibleItems = hideCompleted ? orderedItems.filter((item) => item.status !== "done") : orderedItems;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <HideCompletedToggle checked={hideCompleted} onChange={setHideCompleted} />
      </div>
      <div className="card divide-y divide-line/60 px-3">
        {visibleItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            collaborators={collaborators}
            currentUserId={currentUserId}
            showListLabel
          />
        ))}
        {visibleItems.length === 0 ? <p className="py-6 text-center text-sm text-muted">Everything is done.</p> : null}
      </div>
    </div>
  );
}
