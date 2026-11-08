"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { INBOX_KIND_LABEL, type InboxItem } from "@/lib/inbox";
import { setQuestionStatus } from "@/server/actions/questions-inbox";
import { setSongStatus } from "@/server/actions/songs";
import { setNoteStatus } from "@/server/actions/guestbook";
import { markClaimsViewed } from "@/server/actions/registry";

type Action = { label: string; run: () => Promise<{ ok: boolean; error?: string }> };

/**
 * Each row's own actions, using the actions its source screen already uses.
 * List actions take effect when pressed, as on those screens (spec 42 §13).
 */
function actionsFor(item: InboxItem): Action[] {
  switch (item.kind) {
    case "question":
      return item.status === "new"
        ? [
            { label: "Mark answered", run: () => setQuestionStatus(item.id, "answered") },
            { label: "Dismiss", run: () => setQuestionStatus(item.id, "dismissed") },
          ]
        : [{ label: "Move back to new", run: () => setQuestionStatus(item.id, "new") }];
    case "song":
      return item.status === "new"
        ? [
            { label: "Approve", run: () => setSongStatus(item.id, "approved") },
            { label: "Ignore", run: () => setSongStatus(item.id, "ignored") },
          ]
        : [];
    case "guestbook":
      return item.status === "new"
        ? [
            { label: "Approve", run: () => setNoteStatus(item.id, "approved") },
            { label: "Ignore", run: () => setNoteStatus(item.id, "ignored") },
          ]
        : [];
    case "claim":
      // "Seen" is one timestamp for every claim (spec 36), so this clears them all.
      return item.needsYou ? [{ label: "Mark claims seen", run: () => markClaimsViewed() }] : [];
    case "unable":
      return [];
  }
}

export function InboxList({ items, timeZone }: { items: InboxItem[]; timeZone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const when = new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", timeZone });

  function run(action: Action) {
    startTransition(async () => {
      const result = await action.run();
      setError(result.ok ? null : (result.error ?? "That didn't save."));
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="card divide-y divide-line">
        {items.map((item) => {
          const actions = actionsFor(item);
          const date = new Date(item.at);
          return (
            <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="rounded bg-line/50 px-1.5 py-0.5 text-xs">{INBOX_KIND_LABEL[item.kind]}</span>
                  <span className="font-medium">{item.who}</span>
                  {item.needsYou ? <span className="text-xs text-accent">Needs you</span> : null}
                  <span className="text-xs text-muted">{Number.isNaN(date.getTime()) ? "" : when.format(date)}</span>
                </p>
                <p className="break-words text-sm text-ink/80">{item.preview}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actions.map((action) => (
                  <button key={action.label} type="button" className="btn" disabled={pending} onClick={() => run(action)}>
                    {action.label}
                  </button>
                ))}
                <Link href={item.href} className="text-sm text-muted underline">
                  Open
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
