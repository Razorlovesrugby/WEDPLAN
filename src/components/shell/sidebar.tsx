"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref, navGroupsFor, type Viewer } from "@/lib/nav-groups";

/**
 * The laptop sidebar (spec 41 §4.1): the groups in `nav-groups.ts`, Mac
 * source-list style. Shown from `md:` up; below that the tab bar takes over.
 * Plain links to real routes, one `<nav aria-label="Main">`, with
 * `aria-current` on the lit entry, so a screen reader or an AI assistant
 * driving the browser reads it as the app's main menu.
 */
export function Sidebar({ viewer, badges = {} }: { viewer: Viewer; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const groups = navGroupsFor(viewer);
  const current = activeHref(pathname, groups);

  return (
    <nav aria-label="Main" className="space-y-4 px-2 py-4 text-sm">
      {groups.map((group) => (
        <div key={group.id} role="group" aria-labelledby={group.label ? `nav-${group.id}` : undefined}>
          {group.label ? (
            <h2 id={`nav-${group.id}`} className="px-3 pb-1 text-xs font-medium text-muted">
              {group.label}
            </h2>
          ) : null}
          <ul className="space-y-0.5">
            {group.entries.map((entry) => {
              const active = entry.href === current;
              const badge = badges[entry.href] ?? 0;
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-md px-3 py-1.5 transition-colors ${
                      active ? "bg-line font-medium text-ink" : "text-ink/80 hover:bg-line/50 hover:text-ink"
                    }`}
                  >
                    {entry.label}
                    {/* Spec 43: what needs the couple, e.g. Inbox's count. */}
                    {badge > 0 ? (
                      <span className="text-xs tabular-nums text-muted">
                        {badge}
                        <span className="sr-only"> need you</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
