"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tap a photograph to look at it (spec 27 D5).
 *
 * One native `<dialog>` for the whole page, driven by **event delegation**:
 * any element carrying `data-zoom` opens it, with `data-full` as the picture
 * and the page's other `data-zoom` elements, in document order, as the set to
 * move through. So a photograph needs no client component of its own, a block
 * with the switch off simply has no `data-zoom` attributes, and a page where
 * nothing is zoomable ships no listeners that do anything.
 *
 * What the browser gives for free, and why this is a `<dialog>` and not a
 * hand-rolled overlay: `showModal()` makes the rest of the page inert, traps
 * focus, closes on Escape, and **returns focus to the photograph that opened
 * it** — the four things a lightbox built from divs gets wrong first.
 *
 * What it adds: arrow keys and buttons to move, a swipe on touch, a click on
 * the backdrop to close, and the next photograph preloaded so moving is not a
 * wait. Left and right are never wrapped around: a viewer that loops tells
 * somebody they have finished when they have not.
 *
 * Off inside the builder's preview (`enabled={false}`), where a click on a
 * block selects it.
 */

type Item = { src: string; alt: string };

function collect(): { element: HTMLElement; item: Item }[] {
  return [...document.querySelectorAll<HTMLElement>("[data-zoom]")].map((element) => ({
    element,
    item: {
      src: element.getAttribute("data-full") ?? (element as HTMLImageElement).currentSrc ?? "",
      alt: (element as HTMLImageElement).alt ?? "",
    },
  }));
}

export function PhotoViewer({ enabled = true }: { enabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);

  const open = useCallback((element: HTMLElement) => {
    const all = collect();
    const at = all.findIndex((entry) => entry.element === element);
    if (at < 0) return;
    setItems(all.map((entry) => entry.item));
    setIndex(at);
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const target = (event: Event) =>
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-zoom]") : null;

    const onClick = (event: MouseEvent) => {
      const element = target(event);
      if (element) open(element);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const element = target(event);
      if (!element) return;
      event.preventDefault();
      open(element);
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [enabled, open]);

  const go = useCallback(
    (delta: -1 | 1) => setIndex((was) => Math.min(items.length - 1, Math.max(0, was + delta))),
    [items.length],
  );

  // Arrow keys while it is open, and the next picture warming up.
  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);

    for (const neighbour of [items[index - 1], items[index + 1]]) {
      if (neighbour) new Image().src = neighbour.src;
    }
    return () => document.removeEventListener("keydown", onKey);
  }, [index, items, go]);

  // Keep the page behind from scrolling while a photograph is up.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const lock = () => {
      document.documentElement.style.overflow = "hidden";
    };
    const unlock = () => {
      document.documentElement.style.overflow = "";
    };
    element.addEventListener("close", unlock);
    const observer = new MutationObserver(() => (element.open ? lock() : unlock()));
    observer.observe(element, { attributes: true, attributeFilter: ["open"] });
    return () => {
      unlock();
      observer.disconnect();
      element.removeEventListener("close", unlock);
    };
  }, []);

  if (!enabled) return null;
  const current = items[index];

  return (
    <dialog
      ref={dialog}
      className="site-viewer no-print-site"
      aria-label="Photograph"
      // A click on anything that is neither the picture nor a button — the
      // empty space around it, which is most of the screen — closes it.
      onClick={(event) => {
        if (event.target instanceof Element && !event.target.closest("img, button")) {
          dialog.current?.close();
        }
      }}
      onPointerDown={(event) => {
        touchStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (start === null) return;
        const dx = event.clientX - start;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      {current ? (
        <figure className="site-viewer-figure">
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own stable photo address */}
          <img src={current.src} alt={current.alt} className="site-viewer-image" decoding="async" />
        </figure>
      ) : null}

      <button
        type="button"
        className="site-viewer-close"
        aria-label="Close"
        onClick={() => dialog.current?.close()}
      >
        ×
      </button>
      {items.length > 1 ? (
        <>
          <button
            type="button"
            className="site-viewer-prev"
            aria-label="Previous photo"
            disabled={index === 0}
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="site-viewer-next"
            aria-label="Next photo"
            disabled={index === items.length - 1}
            onClick={() => go(1)}
          >
            ›
          </button>
          <p className="site-viewer-count" aria-live="polite">
            {index + 1} / {items.length}
          </p>
        </>
      ) : null}
    </dialog>
  );
}
