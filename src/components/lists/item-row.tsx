"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  assignItem,
  addSubItem,
  deleteItem,
  setDueDate as setDueDateAction,
  setDueDateOffset,
  setPriority as setPriorityAction,
  setStatus,
  toggleFlag,
  updateItem,
} from "@/server/actions/lists";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import { InlineText } from "@/components/guests/inline-text";
import type { CollaboratorRow, ListItemRow, ListSectionRow } from "@/lib/types/database";

export type ItemWithList = ListItemRow & {
  lists?: { title: string; color: string | null; icon: string | null; kind: string } | null;
};

/** A collaborator's label for the assign picker: their own typed name (spec 15 §2) if they've set one, else the existing role fallback. */
function collaboratorLabel(c: CollaboratorRow, currentUserId?: string): string {
  return c.display_name || (c.user_id === currentUserId ? "You" : c.role === "owner" ? "Owner" : "Partner");
}

/**
 * One list item, everywhere it shows up: a section on /lists/[id], a smart
 * view on /lists, a sub-item nested under its parent. The same row handles
 * all three because the interaction bar the spec asks for — inline
 * everything, no modal, a tick reflects instantly — is the same regardless
 * of which list a viewer got here from.
 */
export function ItemRow({
  item,
  subItems = [],
  collaborators = [],
  currentUserId,
  showListLabel = false,
  allowSubItems = false,
  dragHandle,
  budgetLinks = [],
  highlighted = false,
  sections,
  currentSectionId,
  onSelectSection,
}: {
  item: ItemWithList;
  subItems?: ListItemRow[];
  collaborators?: CollaboratorRow[];
  currentUserId?: string;
  showListLabel?: boolean;
  allowSubItems?: boolean;
  dragHandle?: ReactNode;
  /** Budget lines this item is linked to, directly or via its list (spec 6, section 7) — the reverse badge. */
  budgetLinks?: { id: string; label: string }[];
  /** True when this is the `?highlight=` target from a budget popup's click-through. */
  highlighted?: boolean;
  /** Every section in this item's own list — present only on `/lists/[id]`'s top-level rows (spec 11 §1B). */
  sections?: ListSectionRow[];
  currentSectionId?: string | null;
  onSelectSection?: (itemId: string, sectionId: string | null) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [checked, setChecked] = useState(item.status === "done");
  const [flagged, setFlagged] = useState(item.flagged);
  const [priority, setPriority] = useState(item.priority);
  const [dueDate, setDueDate] = useState(item.due_date);
  const [assignedTo, setAssignedTo] = useState(item.assigned_to);
  const [addingSub, setAddingSub] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A sub-item can be closed by its parent's own checkbox (spec 11 §1D)
  // rather than this row's, so `checked` has to track the server value
  // whenever a refresh brings a new one in, not just reflect this row's own
  // last click.
  useEffect(() => {
    setChecked(item.status === "done");
  }, [item.status]);

  const [dueMode, setDueMode] = useState<"fixed" | "relative">(item.due_date_offset_days !== null ? "relative" : "fixed");
  const [offsetWeeks, setOffsetWeeks] = useState(
    item.due_date_offset_days !== null ? Math.round(Math.abs(item.due_date_offset_days) / 7) : 0,
  );
  const [offsetDirection, setOffsetDirection] = useState<"before" | "after">(
    item.due_date_offset_days !== null && item.due_date_offset_days > 0 ? "after" : "before",
  );

  function onToggleDone() {
    const next = !checked;
    setChecked(next); // optimistic — reflects instantly, confirmed below
    startTransition(async () => {
      const result = await setStatus(item.id, next ? "done" : "not_started");
      if (!result.ok) {
        setChecked(!next);
        setError(result.error);
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  function onToggleFlag() {
    const next = !flagged;
    setFlagged(next);
    startTransition(async () => {
      const result = await toggleFlag(item.id, next);
      if (!result.ok) {
        setFlagged(!next);
        setError(result.error);
      }
    });
  }

  function onDateChange(value: string) {
    const next = value || null;
    const previous = dueDate;
    setDueDate(next); // optimistic — reflects instantly, confirmed below
    startTransition(async () => {
      const result = await setDueDateAction(item.id, next);
      if (!result.ok) {
        setDueDate(previous);
        setError(result.error);
      } else {
        setError(null);
      }
    });
  }

  /** Writes the offset right away — no separate save step, matching every other control on this row (spec 15 §5). */
  function applyOffset(weeks: number, direction: "before" | "after") {
    const days = direction === "before" ? -weeks * 7 : weeks * 7;
    startTransition(async () => {
      const result = await setDueDateOffset(item.id, days);
      if (!result.ok) {
        setError(result.error);
      } else {
        setDueDate(result.data.due_date);
        setError(null);
      }
    });
  }

  function switchToRelative() {
    setDueMode("relative");
    applyOffset(offsetWeeks, offsetDirection);
  }

  /** Client-side only — the item stays "relative" server-side until a fixed date is actually typed (setDueDate then clears the offset). */
  function switchToFixed() {
    setDueMode("fixed");
  }

  function onPriorityClick() {
    const next = (priority + 1) % 4;
    const previous = priority;
    setPriority(next); // optimistic — reflects instantly, confirmed below
    startTransition(async () => {
      const result = await setPriorityAction(item.id, next);
      if (!result.ok) {
        setPriority(previous);
        setError(result.error);
      } else {
        setError(null);
      }
    });
  }

  function onAssign(userId: string) {
    const next = userId || null;
    const previous = assignedTo;
    setAssignedTo(next); // optimistic — reflects instantly, confirmed below
    startTransition(async () => {
      const result = await assignItem(item.id, next);
      if (!result.ok) {
        setAssignedTo(previous);
        setError(result.error);
      } else {
        setError(null);
      }
    });
  }

  function onDelete() {
    if (!confirm(`Remove "${item.title}"?`)) return;
    startTransition(async () => {
      const result = await deleteItem(item.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onAddSub() {
    if (!subTitle.trim()) return;
    startTransition(async () => {
      const result = await addSubItem(item.id, subTitle);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSubTitle("");
        setAddingSub(false);
        router.refresh();
      }
    });
  }

  async function saveTitle(next: string) {
    const result = await updateItem(item.id, { title: next });
    if (result.ok) router.refresh();
    return result;
  }

  return (
    <div id={`list-item-${item.id}`} className={`py-2 ${highlighted ? "-mx-2 rounded bg-accent/10 px-2" : ""}`}>
      <div className="flex items-start gap-2">
        {dragHandle}
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleDone}
          aria-label={`Mark "${item.title}" done`}
          className="mt-1 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`min-w-[8rem] flex-1 text-sm ${checked ? "text-muted line-through" : ""}`}>
              <InlineText value={item.title} ariaLabel="Task title" onSave={saveTitle} />
            </span>
            {priority > 0 ? (
              <span className="text-xs font-medium text-amber-700" title={`Priority ${priority}`}>
                {"!".repeat(priority)}
              </span>
            ) : null}
            {showListLabel && item.lists ? (
              item.lists.icon ? (
                <span className="rounded bg-line/60 px-1.5 py-0.5 text-xs text-ink">
                  <span aria-hidden>{item.lists.icon}</span> {item.lists.title}
                </span>
              ) : (
                <span
                  className="rounded px-1.5 py-0.5 text-xs text-white"
                  style={{ backgroundColor: item.lists.color ?? DEFAULT_LIST_COLOR }}
                >
                  {item.lists.title}
                </span>
              )
            ) : null}
            {budgetLinks.map((link) => (
              <a
                key={link.id}
                href={`/budget?item=${link.id}`}
                className="rounded bg-tierA/10 px-1.5 py-0.5 text-xs text-tierA hover:underline"
                title={`Linked budget line: ${link.label}`}
              >
                💰 {link.label}
              </a>
            ))}
          </div>

          {item.notes ? <p className="mt-0.5 text-xs text-muted">{item.notes}</p> : null}

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {dueMode === "fixed" ? (
              <>
                <input
                  type="date"
                  value={dueDate ?? ""}
                  onChange={(e) => onDateChange(e.target.value)}
                  aria-label={`Due date for "${item.title}"`}
                  className="rounded border border-line bg-transparent px-1 py-0.5 text-muted"
                />
                {dueDate ? (
                  <button
                    type="button"
                    onClick={() => onDateChange("")}
                    aria-label={`Clear due date for "${item.title}"`}
                    className="text-muted hover:text-ink"
                  >
                    ×
                  </button>
                ) : null}
              </>
            ) : (
              <span className="flex items-center gap-1 text-muted">
                <input
                  type="number"
                  min={0}
                  value={offsetWeeks}
                  onChange={(e) => {
                    const weeks = Math.max(0, Math.trunc(Number(e.target.value)) || 0);
                    setOffsetWeeks(weeks);
                    applyOffset(weeks, offsetDirection);
                  }}
                  aria-label={`Weeks ${offsetDirection} the wedding, for "${item.title}"`}
                  className="w-12 rounded border border-line bg-transparent px-1 py-0.5"
                />
                weeks
                <select
                  value={offsetDirection}
                  onChange={(e) => {
                    const direction = e.target.value as "before" | "after";
                    setOffsetDirection(direction);
                    applyOffset(offsetWeeks, direction);
                  }}
                  aria-label={`Before or after the wedding, for "${item.title}"`}
                  className="rounded border border-line bg-transparent px-1 py-0.5"
                >
                  <option value="before">before</option>
                  <option value="after">after</option>
                </select>
                the wedding{dueDate ? ` → ${dueDate}` : ""}
              </span>
            )}
            <button
              type="button"
              onClick={dueMode === "fixed" ? switchToRelative : switchToFixed}
              className="text-[11px] text-muted underline hover:text-ink"
            >
              {dueMode === "fixed" ? "Calculate from the wedding date" : "Use a fixed date"}
            </button>
            <button
              type="button"
              onClick={onToggleFlag}
              aria-pressed={flagged}
              aria-label={flagged ? "Remove flag" : "Flag"}
              className={flagged ? "text-amber-700" : "text-muted hover:text-ink"}
            >
              ⚑
            </button>
            <button
              type="button"
              onClick={onPriorityClick}
              aria-label="Cycle priority"
              className="text-muted hover:text-ink"
            >
              !
            </button>
            {collaborators.length > 0 ? (
              <select
                value={assignedTo ?? ""}
                onChange={(e) => onAssign(e.target.value)}
                aria-label={`Assign "${item.title}"`}
                className="rounded border border-line bg-transparent px-1 py-0.5 text-muted"
              >
                <option value="">Unassigned</option>
                {collaborators.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {collaboratorLabel(c, currentUserId)}
                  </option>
                ))}
              </select>
            ) : null}
            {allowSubItems && sections && sections.length > 0 && onSelectSection ? (
              <select
                value={currentSectionId ?? ""}
                onChange={(e) => onSelectSection(item.id, e.target.value || null)}
                aria-label={`Section for "${item.title}"`}
                className="rounded border border-line bg-transparent px-1 py-0.5 text-muted"
              >
                <option value="">No section</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            ) : null}
            {allowSubItems && !item.parent_item_id ? (
              <button type="button" onClick={() => setAddingSub((v) => !v)} className="text-muted hover:text-ink">
                + sub-item
              </button>
            ) : null}
            <button type="button" onClick={onDelete} className="text-red-700 hover:underline">
              Remove
            </button>
          </div>

          {addingSub ? (
            <input
              autoFocus
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddSub();
                if (e.key === "Escape") setAddingSub(false);
              }}
              onBlur={() => {
                if (!subTitle.trim()) setAddingSub(false);
              }}
              placeholder="Sub-item title, then Enter"
              className="field mt-1 max-w-xs text-xs"
            />
          ) : null}

          {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}

          {subItems.length > 0 ? (
            <div className="mt-2 space-y-1 border-l border-line pl-3">
              {subItems.map((sub) => (
                <ItemRow
                  key={sub.id}
                  item={sub}
                  collaborators={collaborators}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
