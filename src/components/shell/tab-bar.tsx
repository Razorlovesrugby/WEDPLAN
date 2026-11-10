"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { activeHref, activeTabId, moreGroupsFor, tabsFor, type Viewer } from "@/lib/nav-groups";
import { NavIcon } from "./nav-icon";

/**
 * The phone's tab bar (spec 48), below `md:`. Modelled on an iOS tab bar: an
 * icon over a short label, the current tab in the accent colour, and every
 * tab going straight to its page. "More" opens a sheet from the bottom with
 * every other place; it is a link to `/menu`, so it still works before the
 * page's JavaScript has loaded.
 */
export function TabBar({ viewer, badges = {} }: { viewer: Viewer; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const tabs = tabsFor(viewer);
  const groups = moreGroupsFor(viewer);
  const current = sheetOpen ? "more" : activeTabId(pathname, viewer);
  const moreBadge = groups.flatMap((g) => g.entries).reduce((sum, e) => sum + (badges[e.href] ?? 0), 0);

  // Arriving somewhere closes the sheet.
  useEffect(() => setSheetOpen(false), [pathname]);

  const item = "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[10px] font-medium";
  const tone = (active: boolean) => (active ? "text-accent" : "text-muted");

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-white/90 backdrop-blur-xl backdrop-saturate-150 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((tab) => {
            const active = current === tab.id;
            const badge = badges[tab.href] ?? 0;
            return (
              <li key={tab.id} className="flex-1">
                <Link href={tab.href} aria-current={active ? "page" : undefined} className={`${item} ${tone(active)}`}>
                  <span className="relative">
                    <NavIcon name={tab.href} />
                    <Badge count={badge} />
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}
          {groups.length > 0 ? (
            <li className="flex-1">
              <Link
                href="/menu"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                aria-current={current === "more" && !sheetOpen ? "page" : undefined}
                className={`${item} ${tone(current === "more")}`}
                onClick={(event) => {
                  // Modifier-clicks open /menu in a new tab, as a link should.
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  setSheetOpen((open) => !open);
                }}
              >
                <span className="relative">
                  <NavIcon name="more" />
                  <Badge count={moreBadge} />
                </span>
                More
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>
      {sheetOpen ? (
        <MoreSheet
          groups={groups}
          badges={badges}
          currentHref={activeHref(pathname)}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-2.5 -top-1 min-w-[1.125rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[1.125rem] text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> need you</span>
    </span>
  );
}

/**
 * The More sheet: an iOS-style bottom sheet with inset grouped lists. Closes
 * on the dimmed backdrop, Escape, a downward swipe, or arriving at a page.
 */
function MoreSheet({
  groups,
  badges,
  currentHref,
  onClose,
}: {
  groups: ReturnType<typeof moreGroupsFor>;
  badges: Record<string, number>;
  currentHref: string | null;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="sheet-backdrop absolute inset-0 h-full w-full cursor-default bg-black/30"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
        tabIndex={-1}
        className="sheet-panel absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[1.25rem] bg-paper shadow-2xl outline-none"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
          transform: drag > 0 ? `translateY(${drag}px)` : undefined,
        }}
        onTouchStart={(event) => {
          // Only a swipe that starts at the top of the sheet drags it.
          if ((panel.current?.scrollTop ?? 0) === 0) startY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          if (startY.current === null) return;
          setDrag(Math.max(0, (event.touches[0]?.clientY ?? 0) - startY.current));
        }}
        onTouchEnd={() => {
          if (drag > 80) onClose();
          startY.current = null;
          setDrag(0);
        }}
      >
        <div className="sticky top-0 z-[1] bg-paper/95 px-4 pb-2 pt-2 backdrop-blur">
          <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted/30" />
          <div className="flex items-center justify-between">
            <h2 id="more-sheet-title" className="text-lg font-semibold">
              More
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="touch-target -mr-2 inline-flex items-center justify-center rounded-full text-sm font-medium text-accent"
            >
              Done
            </button>
          </div>
        </div>
        <div className="space-y-5 px-4 pt-1">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={group.label ? `more-${group.id}` : undefined}>
              {group.label ? (
                <h3 id={`more-${group.id}`} className="mb-1.5 px-4 text-xs font-medium uppercase tracking-wide text-muted">
                  {group.label}
                </h3>
              ) : null}
              <ul className="overflow-hidden rounded-xl bg-white">
                {group.entries.map((entry) => {
                  const here = entry.href === currentHref;
                  const badge = badges[entry.href] ?? 0;
                  return (
                    <li key={entry.href} className="border-b border-line/70 last:border-b-0">
                      <Link
                        href={entry.href}
                        aria-current={here ? "page" : undefined}
                        onClick={onClose}
                        className="flex min-h-12 items-center gap-3 px-4 active:bg-line/50"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <NavIcon name={entry.href} className="h-5 w-5" />
                        </span>
                        <span className={`flex-1 text-[15px] ${here ? "font-semibold" : ""}`}>{entry.label}</span>
                        {badge > 0 ? (
                          <span className="rounded-full bg-red-600 px-2 text-xs font-semibold leading-5 text-white">
                            {badge}
                            <span className="sr-only"> need you</span>
                          </span>
                        ) : null}
                        <span aria-hidden className="text-lg text-muted/60">
                          ›
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
