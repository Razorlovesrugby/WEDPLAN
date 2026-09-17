"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The second-level tab strip inside a hub `Nav` collapsed several routes
 * into (spec 13) — the Guests hub's Guests/Ranking/Invitations, and the
 * Tasks hub's Tasks/Calendar/Board/Timeline. Styled like `Nav` itself, one
 * level down (spec 13 §5 answer 4), rather than `ListsSidebar`'s vertical
 * list: same active/inactive pill and `aria-current`, so a planner reads
 * "this is how tabs work here" without a second visual language to learn.
 *
 * Each tab is a plain link to that screen's own already-existing route —
 * not a client-side tab panel — since every one of them is its own server
 * page with its own data fetching (spec 13 §1B).
 */
export function SubTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Section" className="mb-4 flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
