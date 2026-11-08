"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { InspectorProvider } from "./inspector";
import { OPEN_SHORTCUTS_EVENT, openPalette } from "./command-palette";
import { isTypingTarget, shortcutFor } from "@/lib/shortcuts";

const STORAGE_KEY = "wedplan.sidebar.collapsed";

/**
 * The two-column frame from `md:` up: sidebar, then everything else. The
 * sidebar can be hidden (spec 41 Q6), remembered per browser. Storage can
 * throw or come back empty (private windows, blocked site data), so every
 * read and write is guarded and the default is "shown".
 */
export function ShellFrame({
  sidebar,
  canOpenSettings = true,
  children,
}: {
  sidebar: ReactNode;
  /** A planner login can't open Settings, so ⌘, does nothing for them. */
  canOpenSettings?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Keep the default.
    }
  }, []);

  // The keyboard shortcuts (spec 46). Esc is handled by whatever is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = shortcutFor(event, isTypingTarget(event.target as HTMLElement | null));
      if (!action) return;
      if (action === "settings" && !canOpenSettings) return;
      event.preventDefault();
      if (action === "palette") openPalette();
      else if (action === "settings") router.push("/settings");
      else if (action === "sidebar") toggle();
      else window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle() {
    setCollapsed((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // A per-browser convenience; fine to lose.
      }
      return next;
    });
  }

  return (
    <div data-planner className="min-h-dvh md:flex md:items-start">
      <aside
        id="sidebar"
        aria-label="Sidebar"
        className={`hidden shrink-0 border-r border-line bg-line/20 ${
          collapsed ? "" : "md:sticky md:top-0 md:block md:h-dvh md:w-56 md:overflow-y-auto"
        }`}
      >
        {sidebar}
      </aside>
      {/* The side panel (spec 44) sits in this row, after the content, from lg: up. */}
      <InspectorProvider>
      <div className="min-w-0 flex-1">
        <div className="hidden bg-white px-4 pt-2 md:block">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-muted hover:bg-line/50 hover:text-ink"
            aria-controls="sidebar"
            aria-expanded={!collapsed}
            onClick={toggle}
          >
            {collapsed ? "Show sidebar" : "Hide sidebar"}
          </button>
        </div>
        {children}
      </div>
      </InspectorProvider>
    </div>
  );
}
