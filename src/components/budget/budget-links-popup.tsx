"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLinkedTask,
  linkBudgetItemToList,
  linkBudgetItemToTask,
  unlinkBudgetItemFromList,
  unlinkBudgetItemFromTask,
} from "@/server/actions/budget-links";
import { formatDate, pluralise } from "@/lib/format";
import type { ListRow } from "@/lib/types/database";
import type { LinkedList, LinkedTask } from "@/server/queries/budget-links";

/**
 * Clicking a budget line's label opens this — a dialog, not a route (spec 6,
 * section 4's decision against a /budget/[id] page). Shows every linked list
 * (open/done counts) and every individually-linked task, click-through to
 * either, plus a link/unlink picker and the inline "create a task here"
 * shortcut (spec 6, section 7).
 */
export function BudgetLinksPopup({
  itemId,
  itemLabel,
  lists,
  links,
  timezone,
  open,
  onClose,
}: {
  itemId: string;
  itemLabel: string;
  lists: ListRow[];
  links: { lists: LinkedList[]; tasks: LinkedTask[] };
  timezone: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [newTaskListId, setNewTaskListId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const linkedListIds = useMemo(() => new Set(links.lists.map((l) => l.id)), [links.lists]);
  const candidateLists = useMemo(
    () =>
      lists
        .filter((l) => !linkedListIds.has(l.id) && l.title.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8),
    [lists, linkedListIds, query],
  );

  function refresh() {
    router.refresh();
  }

  function onLinkList(listId: string) {
    startTransition(async () => {
      const result = await linkBudgetItemToList(itemId, listId);
      if (!result.ok) setError(result.error);
      else {
        setQuery("");
        refresh();
      }
    });
  }

  function onUnlinkList(listId: string) {
    startTransition(async () => {
      const result = await unlinkBudgetItemFromList(itemId, listId);
      if (!result.ok) setError(result.error);
      else refresh();
    });
  }

  function onUnlinkTask(listItemId: string) {
    startTransition(async () => {
      const result = await unlinkBudgetItemFromTask(itemId, listItemId);
      if (!result.ok) setError(result.error);
      else refresh();
    });
  }

  function onCreateLinkedTask() {
    if (!newTaskListId || !newTaskTitle.trim()) return;
    startTransition(async () => {
      const result = await createLinkedTask(itemId, newTaskListId, newTaskTitle.trim());
      if (!result.ok) setError(result.error);
      else {
        setNewTaskTitle("");
        refresh();
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-lg rounded-lg border border-line bg-white p-0 shadow-lg backdrop:bg-black/30"
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-serif text-lg">Linked to &ldquo;{itemLabel}&rdquo;</h2>
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Linked lists</h3>
          {links.lists.length === 0 ? (
            <p className="text-sm text-muted">No whole lists linked.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {links.lists.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <a href={`/lists/${l.id}`} className="hover:underline">
                    {l.title}
                  </a>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {pluralise(l.doneCount, "done")} of {l.openCount + l.doneCount}
                    <button
                      type="button"
                      disabled={pending}
                      className="text-red-700 hover:underline"
                      onClick={() => onUnlinkList(l.id)}
                    >
                      Unlink
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Individually-linked tasks</h3>
          {links.tasks.length === 0 ? (
            <p className="text-sm text-muted">No individual tasks linked.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {links.tasks.map((t) => (
                <li key={t.list_item_id} className="flex items-center justify-between gap-2">
                  <a href={`/lists/${t.list_id}?highlight=${t.list_item_id}`} className="hover:underline">
                    {t.title}
                  </a>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {t.status === "done" ? "done" : t.due_date ? `due ${formatDate(t.due_date, timezone)}` : "no date"}
                    <button
                      type="button"
                      disabled={pending}
                      className="text-red-700 hover:underline"
                      onClick={() => onUnlinkTask(t.list_item_id)}
                    >
                      Unlink
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2 border-t border-line pt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Link a list…</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lists…"
            className="field w-full text-sm"
          />
          {query.trim() ? (
            <ul className="max-h-32 divide-y divide-line/50 overflow-y-auto rounded border border-line text-sm">
              {candidateLists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    disabled={pending}
                    className="block w-full px-2 py-1 text-left hover:bg-paper"
                    onClick={() => onLinkList(l.id)}
                  >
                    {l.title}
                  </button>
                </li>
              ))}
              {candidateLists.length === 0 ? <li className="px-2 py-1 text-xs text-muted">No matching lists.</li> : null}
            </ul>
          ) : null}
        </section>

        <section className="space-y-2 border-t border-line pt-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
            + Create a new task and link it here
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newTaskListId ?? ""}
              onChange={(e) => setNewTaskListId(e.target.value || null)}
              className="field text-sm"
            >
              <option value="">Choose a list…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Task title"
              className="field flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateLinkedTask();
              }}
            />
            <button
              type="button"
              disabled={pending || !newTaskListId || !newTaskTitle.trim()}
              className="btn-primary px-2 py-1 text-xs"
              onClick={onCreateLinkedTask}
            >
              Create &amp; link
            </button>
          </div>
        </section>
      </div>
    </dialog>
  );
}
