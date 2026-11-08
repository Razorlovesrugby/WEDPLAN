"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { activeTabId, tabsFor, type Viewer } from "@/lib/nav-groups";

/**
 * The phone's tab bar (spec 41 §4.2), below `md:`. Built from the same
 * `nav-groups.ts` as the sidebar. A tab holding one entry links straight to
 * it; a tab holding several opens `/menu?group=<tab>`, a plain page listing
 * them (a page rather than a popover, so it can be linked to and Back works).
 */
export function TabBar({ viewer, badges = {} }: { viewer: Viewer; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabs = tabsFor(viewer);
  const current = pathname === "/menu" ? searchParams.get("group") : activeTabId(pathname, viewer);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-xl">
        {tabs.map((tab) => {
          const entries = tab.groups.flatMap((group) => group.entries);
          const href = entries.length === 1 && entries[0] ? entries[0].href : `/menu?group=${tab.id}`;
          const active = tab.id === current;
          const badge = entries.reduce((sum, entry) => sum + (badges[entry.href] ?? 0), 0);
          return (
            <li key={tab.id} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block px-1 py-3 text-center text-xs ${active ? "font-semibold text-ink" : "text-muted"}`}
              >
                {tab.label}
                {badge > 0 ? (
                  <span className="ml-1 rounded-full bg-ink px-1.5 text-[10px] text-white">
                    {badge}
                    <span className="sr-only"> need you</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
