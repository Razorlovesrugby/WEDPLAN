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
  if (items.length === 0) {
    return <p className="card p-6 text-sm text-muted">{EMPTY_COPY[view]}</p>;
  }

  return (
    <div className="card divide-y divide-line/60 px-3">
      {items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          collaborators={collaborators}
          currentUserId={currentUserId}
          showListLabel
        />
      ))}
    </div>
  );
}
