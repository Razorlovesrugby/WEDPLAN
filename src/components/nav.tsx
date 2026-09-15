"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/guests", label: "Guests" },
  { href: "/guests/rank", label: "Ranking" },
  { href: "/events", label: "Events" },
  { href: "/invitations", label: "Invitations" },
  { href: "/questions", label: "Questions" },
  { href: "/lists", label: "Lists" },
  { href: "/timeline", label: "Timeline" },
  { href: "/calendar", label: "Calendar" },
  { href: "/board", label: "Board" },
  { href: "/budget", label: "Budget" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string): boolean {
  // "/" would otherwise match everything; "/guests" must not stay lit
  // while you are on "/guests/rank", which is its own destination.
  if (href === "/") return pathname === "/";
  return pathname === href || (pathname.startsWith(`${href}/`) && href !== "/guests");
}

/**
 * Nine destinations is too many for a bottom tab bar without its own
 * overflow menu (spec 03, section 7, decision 5), so below `sm:` this
 * collapses behind a hamburger button into a dropdown panel instead of
 * wrapping into a multi-row link soup. `sm:` and up keeps today's plain
 * wrapping link row unchanged.
 */
export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closing on navigation, not just on link click, catches back/forward too.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav aria-label="Main">
      <button
        type="button"
        className="btn mb-2 gap-2 sm:hidden"
        aria-expanded={open}
        aria-controls="main-nav-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
        Menu
      </button>

      <div
        id="main-nav-panel"
        className={`${open ? "flex" : "hidden"} flex-col gap-1 pb-2 sm:flex sm:flex-row sm:flex-wrap sm:pb-0`}
      >
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded px-3 py-2 text-sm transition-colors sm:py-1.5 ${
                active ? "bg-ink text-white" : "text-muted hover:bg-line/50 hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
