"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { DEFAULT_LIST_COLOR } from "@/lib/list-colors";
import type { ListRow } from "@/lib/types/database";

const SMART_VIEWS = [
  { view: "today", label: "Today" },
  { view: "scheduled", label: "Scheduled" },
  { view: "flagged", label: "Flagged" },
  { view: "all", label: "All" },
  { view: "mine", label: "Assigned to me" },
] as const;

/**
 * The smart views sit alongside the wedding's own lists, and are never
 * edited directly — they're filters, not storage (spec 1, section 1).
 */
export function ListsSidebar({ lists }: { lists: ListRow[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeView = pathname === "/lists" ? (searchParams.get("view") ?? "today") : null;

  return (
    <nav aria-label="Lists" className="w-full shrink-0 space-y-4 sm:w-48">
      <div className="space-y-0.5">
        {SMART_VIEWS.map(({ view, label }) => (
          <Link
            key={view}
            href={`/lists?view=${view}`}
            aria-current={activeView === view ? "page" : undefined}
            className={`block rounded px-2 py-1.5 text-sm ${
              activeView === view ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div>
        <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-muted">Your lists</p>
        <div className="space-y-0.5">
          {lists.map((list) => {
            const active = pathname === `/lists/${list.id}`;
            return (
              <Link
                key={list.id}
                href={`/lists/${list.id}`}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                  active ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: list.color ?? DEFAULT_LIST_COLOR }}
                  aria-hidden
                />
                {list.icon ? <span aria-hidden>{list.icon}</span> : null}
                <span className="truncate">{list.title}</span>
              </Link>
            );
          })}
          {lists.length === 0 ? <p className="px-2 text-xs text-muted">No lists yet.</p> : null}
        </div>
      </div>
    </nav>
  );
}
