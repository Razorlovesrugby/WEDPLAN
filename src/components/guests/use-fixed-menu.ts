"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Where a cell's menu goes (spec 47).
 *
 * The guest table scrolls sideways inside its card, and a box that scrolls
 * clips anything absolutely placed inside it: a menu opened on the last few
 * rows was cut off at the card's bottom edge. A fixed-position menu escapes
 * that. It opens upward when there isn't room below, stays on screen
 * sideways, and closes when anything scrolls, since it would no longer sit
 * beside its button.
 */
const HIDDEN: CSSProperties = { position: "fixed", visibility: "hidden", top: 0, left: 0 };

export function useFixedMenu(
  open: boolean,
  close: () => void,
  /** The button the menu hangs from. */
  anchor: RefObject<HTMLElement | null>,
  /** Holds the button and the menu, so scrolling inside the menu doesn't close it. */
  container: RefObject<HTMLElement | null>,
  width: number,
): CSSProperties {
  // Until it's measured, the menu is fixed and invisible, so its first render
  // can't push the row taller and move the button it's measured against.
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);

  useLayoutEffect(() => {
    if (!open || !anchor.current) {
      setStyle(HIDDEN);
      return;
    }
    const rect = anchor.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const upward = below < 280 && rect.top > below;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setStyle({
      position: "fixed",
      left,
      width,
      ...(upward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });

    const onMove = (event: Event) => {
      // Scrolling inside the menu itself is fine.
      if (event.target instanceof Node && container.current?.contains(event.target)) return;
      close();
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close, anchor, container, width]);

  return style;
}
