import { flushSync } from "react-dom";

/**
 * Run a state change as a view transition, where the browser has them
 * (spec 27 §4, §7).
 *
 * The browser snapshots the page, the update runs, and it cross-fades or
 * morphs between the two — and elements sharing a `view-transition-name`
 * (the RSVP panel and its confirmation card) are matched across the change.
 *
 * **It is an enhancement and nothing else.** Without the API, or for a guest who
 * has asked for reduced motion, the update simply runs; nothing about what the
 * page *does* depends on the transition. `flushSync` is what the browser needs:
 * the DOM must have changed by the time the callback returns, or it snapshots a
 * page that has not moved.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (typeof doc.startViewTransition !== "function" || calm) {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
  });
}
