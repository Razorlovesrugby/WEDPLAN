"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * The side panel (spec 44): a Mac-style inspector on the right from `lg:` up,
 * a bottom sheet below that. One per window; opening another replaces it.
 *
 * What's open is in the URL as `?inspect=<key>` (e.g. `task:<id>`), so a link
 * opens it, a reload keeps it, and an AI assistant can go straight to it.
 * Rows that already hold their data (a task, a budget line) open it in place
 * with `openInspector`, which only rewrites the address. Server-rendered
 * panels (a vendor, a section's ⋯ settings) are real links and pass a
 * `closeHref` to navigate back to.
 */

type Active = { key: string; title: string; close: () => void } | null;

type InspectorContextValue = {
  target: HTMLElement | null;
  active: Active;
  setActive: (active: Active) => void;
  /** The key in the address bar, for rows deciding whether they're the open one. */
  openKey: string | null;
  openInspector: (key: string) => void;
  closeInspector: () => void;
};

const InspectorContext = createContext<InspectorContextValue | null>(null);

function writeKey(key: string | null) {
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("inspect", key);
  else url.searchParams.delete("inspect");
  window.history.replaceState(window.history.state, "", url);
}

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState<Active>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // The address bar is the source of truth on load and on Back/Forward.
  useEffect(() => {
    const read = () => setOpenKey(new URL(window.location.href).searchParams.get("inspect"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const openInspector = useCallback((key: string) => {
    writeKey(key);
    setOpenKey(key);
  }, []);
  const closeInspector = useCallback(() => {
    writeKey(null);
    setOpenKey(null);
  }, []);

  return (
    <InspectorContext.Provider value={{ target, active, setActive, openKey, openInspector, closeInspector }}>
      {children}
      <InspectorPanel onTarget={setTarget} />
    </InspectorContext.Provider>
  );
}

export function useInspector() {
  const value = useContext(InspectorContext);
  if (!value) throw new Error("useInspector needs InspectorProvider (the planner shell)");
  return value;
}

function InspectorPanel({ onTarget }: { onTarget: (node: HTMLElement | null) => void }) {
  const { active } = useInspector();
  const heading = useRef<HTMLHeadingElement>(null);

  // Esc closes it, as a sheet should; focus moves into it when it opens.
  useEffect(() => {
    if (!active) return;
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") active.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <>
      {active ? (
        <button
          type="button"
          aria-label="Close the panel"
          className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          onClick={active.close}
        />
      ) : null}
      <aside
        aria-label={active ? active.title : undefined}
        hidden={!active}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl border-t border-line bg-white shadow-2xl lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:h-dvh lg:max-h-none lg:w-[420px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <h2 ref={heading} tabIndex={-1} className="min-w-0 truncate font-medium outline-none">
            {active?.title}
          </h2>
          <button type="button" className="btn" onClick={() => active?.close()}>
            Done
          </button>
        </div>
        <div ref={onTarget} className="space-y-4 p-4" />
      </aside>
    </>
  );
}

/**
 * Put `children` in the side panel while this is mounted. A row renders it
 * only while it's the open one; a server page renders it when its URL says so.
 */
export function InspectorPortal({
  inspectKey,
  title,
  closeHref,
  onClose,
  children,
}: {
  inspectKey: string;
  title: string;
  /** For server-rendered panels: where Done goes. */
  closeHref?: string;
  /** For panels a row opened in place. Defaults to clearing `?inspect=`. */
  onClose?: () => void;
  children: ReactNode;
}) {
  const { target, setActive, closeInspector } = useInspector();
  const router = useRouter();

  useEffect(() => {
    const close = () => {
      if (closeHref) router.push(closeHref, { scroll: false });
      else (onClose ?? closeInspector)();
    };
    setActive({ key: inspectKey, title, close });
    return () => setActive(null);
  }, [inspectKey, title, closeHref, onClose, closeInspector, router, setActive]);

  return target ? createPortal(children, target) : null;
}
