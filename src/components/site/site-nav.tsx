"use client";

import { useEffect, useState } from "react";
import type { NavItem } from "@/lib/site/sections";

/**
 * The jump nav (spec 14 §3).
 *
 * Sticky on scroll, collapses to a sheet under 640px, and the RSVP call to
 * action is pinned at every width — a guest who came to reply should never
 * have to find the link.
 *
 * Deliberately anchors rather than routes: the site is one scrolling page, and
 * a router push would lose the scroll position on back.
 */
export function SiteNav({
  items,
  rsvpLabel,
  monogram,
}: {
  items: NavItem[];
  rsvpLabel: string;
  monogram: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape as well as on a link: a sheet that only closes by tapping
  // a link is a trap for anyone who opened it by accident.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const jumpItems = items.filter((item) => item.href !== "#rsvp");

  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <a href="#hero" className="shrink-0 text-xl text-ink" aria-label="Back to the top">
          {monogram}
        </a>

        <ul className="hidden flex-1 items-center justify-center gap-5 sm:flex">
          {jumpItems.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-[0.78rem] uppercase tracking-[0.12em] text-muted hover:text-accent"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
          <a
            href="#rsvp"
            className="rounded-sm border border-accent px-3 py-1.5 text-[0.72rem] uppercase tracking-[0.12em] text-accent hover:bg-accent hover:text-paper"
          >
            {rsvpLabel}
          </a>
          {jumpItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="site-nav-sheet"
              className="rounded-sm border border-line px-2.5 py-1.5 text-[0.72rem] uppercase tracking-[0.12em] text-muted sm:hidden"
            >
              {open ? "Close" : "Menu"}
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <ul id="site-nav-sheet" className="border-t border-line bg-paper px-4 py-2 sm:hidden">
          {jumpItems.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                className="block py-2.5 text-sm uppercase tracking-[0.12em] text-muted"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
