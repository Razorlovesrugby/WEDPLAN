"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem =
  | "sep"
  | {
      label: string;
      onSelect?: () => void;
      disabled?: boolean;
      /** The key that does the same, shown on the right. */
      keys?: string;
      checked?: boolean;
      /** A submenu: opens in place under its label. */
      children?: MenuItem[];
    };

/**
 * The right-click menu on the plan (spec 59 Part B). A plain list at the
 * pointer: arrow keys move, Enter picks, Esc or a click elsewhere closes. A
 * submenu opens inside the list rather than beside it, so it can't run off
 * the screen.
 */
export function CanvasMenu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const [open, setOpen] = useState<string | null>(null);

  // Keep it on the screen: flip to the left or upwards if the pointer was near an edge.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)),
    });
  }, [at, open]);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const all = [...(box.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
        const at = all.indexOf(document.activeElement as HTMLElement);
        all[(at + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
      }
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const row = "flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-paper focus:bg-paper focus:outline-none disabled:text-muted/60 disabled:hover:bg-transparent";
  const render = (list: MenuItem[], depth = 0): React.ReactNode =>
    list.map((item, i) => {
      if (item === "sep") return <div key={`s${depth}-${i}`} role="separator" className="my-1 border-t border-line" />;
      const id = `${depth}:${item.label}`;
      if (item.children) {
        return (
          <div key={id}>
            <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === id} className={row} disabled={item.disabled} onClick={() => setOpen(open === id ? null : id)}>
              {item.label}
              <span aria-hidden>{open === id ? "▾" : "▸"}</span>
            </button>
            {open === id ? <div className="border-y border-line/60 bg-paper/60 pl-3">{render(item.children, depth + 1)}</div> : null}
          </div>
        );
      }
      return (
        <button
          key={id}
          type="button"
          role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={item.checked}
          className={row}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect?.();
          }}
        >
          <span>
            {item.checked === undefined ? "" : <span aria-hidden className="mr-1.5 inline-block w-3">{item.checked ? "✓" : ""}</span>}
            {item.label}
          </span>
          {item.keys ? <kbd className="font-sans text-[10px] text-muted">{item.keys}</kbd> : null}
        </button>
      );
    });

  return (
    <div ref={box} role="menu" aria-label="Plan actions" className="fixed z-50 max-h-[calc(100vh-1rem)] w-60 overflow-y-auto rounded border border-line bg-white py-1 text-sm shadow-xl" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {render(items)}
    </div>
  );
}
