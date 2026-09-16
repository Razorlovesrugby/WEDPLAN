"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  assignItem,
  addSubItem,
  deleteItem,
  setDueDate as setDueDateAction,
  setPriority as setPriorityAction,
  setStatus,
  toggleFlag,
} from "@/server/actions/lists";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import type { CollaboratorRow, ListItemRow } from "@/lib/types/database";

export type ItemWithList = ListItemRow & {
  lists?: { title: string; color: string | null; kind: string } | null;
};

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
            <span className={`text-sm ${checked ? "text-muted line-through" : ""}`}>{item.title}</span>
            {priority > 0 ? (
              <span className="text-xs font-medium text-amber-700" title={`Priority ${priority}`}>
                {"!".repeat(priority)}
              </span>
            ) : null}
            {showListLabel && item.lists ? (
              <span
                className="rounded px-1.5 py-0.5 text-xs text-white"
                style={{ backgroundColor: item.lists.color ?? DEFAULT_LIST_COLOR }}
              >
                {item.lists.title}
              </span>
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
            <input
              type="date"
              value={dueDate ?? ""}
              onChange={(e) => onDateChange(e.target.value)}
              aria-label={`Due date for "${item.title}"`}
              className="rounded border border-line bg-transparent px-1 py-0.5 text-muted"
            />
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
                    {c.user_id === currentUserId ? "You" : c.role === "owner" ? "Owner" : "Partner"}
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
