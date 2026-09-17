"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Eight destinations (spec 13) — collapsed down from a flat fourteen.
 * "Guests" and "Tasks" each cover several routes underneath them; a page
 * living under one of `matchPrefixes` keeps that top-level entry lit even
 * though its own URL isn't the link's own `href` (spec 13 §1B/§1A's hub
 * pages, plus `/households`, which stays reachable only from a guest row —
 * not its own tab — but is still "Guests" territory for nav purposes).
 */
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/guests", label: "Guests", matchPrefixes: ["/guests", "/invitations", "/households"] },
  { href: "/budget", label: "Budget" },
  { href: "/events", label: "Events" },
  { href: "/questions", label: "Questions" },
  { href: "/lists", label: "Tasks", matchPrefixes: ["/lists", "/calendar", "/board", "/timeline"] },
  { href: "/moodboards", label: "Moodboards" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(pathname: string, link: { href: string; matchPrefixes?: readonly string[] }): boolean {
  if (link.href === "/") return pathname === "/";
  const prefixes = link.matchPrefixes ?? [link.href];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Eight destinations still wraps into more than one row on a narrow phone,
 * so below `sm:` this collapses behind a hamburger button into a dropdown
 * panel instead (spec 03, section 7, decision 5). `sm:` and up keeps a
 * plain wrapping link row.
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
          const active = isActive(pathname, link);
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
