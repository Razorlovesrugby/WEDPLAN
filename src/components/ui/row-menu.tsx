"use client";

import { useEffect, useId, useRef, useState } from "react";
import { moveTargets } from "@/lib/reorder";

export type RowMenuItem = { label: string; onSelect: () => void; disabled?: boolean };

/**
 * A row's "⋯" menu (spec 45): the way to do with a tap or the keyboard what
 * a drag does with a mouse. 44 × 44 pt target, as Apple asks for on iPad.
 * Arrow keys move between items, Esc closes and returns focus to the button.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const enabled = items.filter((item) => !item.disabled);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([disabled])")?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);

  if (enabled.length === 0) return null;

  function onKeyDown(event: React.KeyboardEvent) {
    const all = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      all[(at + 1) % all.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      all[(at - 1 + all.length) % all.length]?.focus();
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((was) => !was)}
        className="touch-target inline-flex items-center justify-center rounded text-muted hover:bg-line/50 hover:text-ink"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open ? (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute right-0 z-40 mt-1 w-48 rounded-md border border-line bg-white p-1 text-sm shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                item.onSelect();
              }}
              className="block min-h-11 w-full rounded px-3 py-2 text-left hover:bg-line/50 disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const LIST_WORDS = { up: "Move up", down: "Move down", top: "Move to top", bottom: "Move to bottom" };
/** For a grid of pictures, where "up" isn't where the next one goes. */
export const GRID_WORDS = { up: "Move earlier", down: "Move later", top: "Move to the start", bottom: "Move to the end" };

/** The standard four moves for a row at `index` of `count`; `move(to)` does the reorder. */
export function moveItems(
  index: number,
  count: number,
  move: (to: number) => void,
  words: typeof LIST_WORDS = LIST_WORDS,
): RowMenuItem[] {
  const targets = moveTargets(index, count);
  return [
    { label: words.up, target: targets.up },
    { label: words.down, target: targets.down },
    { label: words.top, target: targets.top },
    { label: words.bottom, target: targets.bottom },
  ]
    .filter((entry): entry is { label: string; target: number } => entry.target !== null)
    .map((entry) => ({ label: entry.label, onSelect: () => move(entry.target) }));
}
