"use client";

import { useEffect, useRef } from "react";
import { formatDate } from "@/lib/format";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import type { TimelineItemView } from "@/lib/types/database";

const STATUS_LABEL: Record<TimelineItemView["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/**
 * Click a task card on /calendar or /timeline, see a quick preview, click
 * through to the task's real location on /lists/[id] to act on it — same
 * click-through pattern BudgetLinksPopup already uses for a budget line
 * (spec 6). Read-only: editing status, date, or assignment stays on
 * /lists/[id] and /board, this is just a look before you commit to
 * navigating there.
 */
export function TaskPreviewPopup({
  item,
  timezone,
  open,
  onClose,
}: {
  item: TimelineItemView | null;
  timezone: string;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-sm rounded-lg border border-line bg-white p-0 shadow-lg backdrop:bg-black/30"
    >
      {item ? (
        <div className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-serif text-lg">{item.title}</h2>
            <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              {item.list_icon ? (
                <span aria-hidden>{item.list_icon}</span>
              ) : (
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ backgroundColor: item.list_color ?? DEFAULT_LIST_COLOR }}
                  aria-hidden
                />
              )}
              {item.list_title}
            </span>
            <span>{STATUS_LABEL[item.status]}</span>
            <span>Due {formatDate(item.due_date, timezone)}</span>
            {item.flagged ? <span>⚑ Flagged</span> : null}
            {item.priority > 0 ? <span>{"!".repeat(item.priority)} priority</span> : null}
          </div>

          {item.notes ? <p className="text-sm">{item.notes}</p> : null}

          <a href={`/lists/${item.list_id}?highlight=${item.id}`} className="btn-primary inline-block px-3 py-1.5 text-sm">
            Open task →
          </a>
        </div>
      ) : null}
    </dialog>
  );
}
