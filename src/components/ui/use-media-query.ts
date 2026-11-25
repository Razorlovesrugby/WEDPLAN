"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, following the window. Rendered on the
 * server (and hydrated) as `serverValue`, so the first paint agrees.
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** Tablet width and up: where the designer lets you draw and move furniture (spec 57 Part A). */
export const TABLET_UP = "(min-width: 768px)";
