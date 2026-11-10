"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SubTab } from "@/lib/nav-tabs";

/**
 * The one way to switch between a section's views (spec 41 §4.3): a Mac-style
 * segmented control at the top of the content, the same in every section
 * (Tasks, Guest list, Invitations, Website, Registry).
 *
 * Each segment is a plain link to that view's own route, not a client-side tab
 * panel, so Back, bookmarks and an AI assistant all land on the same view
 * (spec 13 §1B). It wraps rather than scrolls on a narrow phone, where it
 * spans the width like an iOS segmented control (spec 48).
 */
export function SubTabs({ tabs }: { tabs: readonly SubTab[] }) {
  const pathname = usePathname();
  // The most specific match wins, so /invitations/save-the-date lights its
  // own tab and not /invitations as well.
  const activeHref = tabs
    .flatMap((tab) =>
      [tab.href, ...(tab.matchPrefixes ?? [])]
        .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
        .map((prefix) => ({ href: tab.href, length: prefix.length })),
    )
    .sort((a, b) => b.length - a.length)[0]?.href;

  return (
    <nav
      aria-label="Views"
      className="mb-4 flex w-full flex-wrap gap-0.5 rounded-[0.6rem] bg-line/50 p-0.5 md:inline-flex md:w-auto md:max-w-full md:rounded-lg md:border md:border-line md:bg-line/30"
    >
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-9 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-[13px] transition-colors md:min-h-0 md:flex-none md:text-sm ${
              active ? "bg-white font-medium text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
