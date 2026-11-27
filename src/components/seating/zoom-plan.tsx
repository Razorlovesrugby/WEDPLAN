"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { gestureFactor, wheelAction } from "@/lib/seating/canvas";
import { FIT, STEP, clampPan, isZoomedIn, keyAction, panBy, percentOf, viewWheel, zoomAbout, zoomToPercent, type ZoomState } from "@/lib/seating/view-zoom";
import { useNavMode } from "./canvas-prefs";

/**
 * Zoom and pan for a plan that is looked at, not edited (spec 60 D.1): the plan a vendor opens from a link, and a table's
 * close-up. It wraps whatever it is given (a server-rendered picture, a form) and moves it with a CSS transform.
 *
 * - Pinch and Ctrl/⌘ + scroll zoom about the pointer, 10% to 800% (100% is fitted to the page). A plain scroll is NOT taken:
 *   these pages have more below the plan, so the page scrolls.
 * - Dragging a zoomed plan pans it; Fit and the zoom box are on screen; `+` `−` `0` and Shift+1 work with the plan focused.
 * - Nothing here writes.
 *
 * `roomNav` is for the planner's own close-up, where items are placed: it follows the Room view's navigation (Trackpad or
 * Mouse mode, Space and drag, the Hand) instead, so the page never scrolls under the pointer.
 */
export function ZoomPlan({ children, label, roomNav = false }: { children: ReactNode; label: string; roomNav?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState<ZoomState>(FIT);
  const zRef = useRef(z);
  zRef.current = z;
  const [navMode, setNavMode] = useNavMode();
  const navRef = useRef(navMode);
  navRef.current = navMode;
  const [hand, setHand] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** Applies a change, keeping part of the picture on screen. */
  const set = useCallback((next: ZoomState | ((cur: ZoomState) => ZoomState)) => {
    setZ((cur) => {
      const raw = typeof next === "function" ? next(cur) : next;
      const b = box.current;
      const c = content.current;
      return b && c ? clampPan(raw, { w: b.clientWidth, h: b.clientHeight }, { w: c.offsetWidth, h: c.offsetHeight }) : raw;
    });
  }, []);
  const centre = () => ({ x: (box.current?.clientWidth ?? 0) / 2, y: (box.current?.clientHeight ?? 0) / 2 });
  const local = (clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  // Wheel and Safari's pinch, as native listeners: React's wheel handler is passive and cannot stop the page zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const at = local(e.clientX, e.clientY);
      if (roomNav) {
        e.preventDefault();
        const a = wheelAction(e, navRef.current);
        if (a.kind === "zoom") set((cur) => zoomAbout(cur, at, a.factor));
        else set((cur) => panBy(cur, -a.dx, -a.dy));
        return;
      }
      const a = viewWheel(e);
      if (!a) return; // a plain scroll: the page's
      e.preventDefault();
      set((cur) => zoomAbout(cur, at, a.factor));
    };
    let last = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      last = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      const f = gestureFactor(g.scale, last);
      last = g.scale;
      set((cur) => zoomAbout(cur, local(g.clientX, g.clientY), f));
    };
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", stop);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", stop);
    };
  }, [roomNav, set]);

  // Pointers: one finger or the mouse pans (when zoomed in, or with Space or the Hand); two fingers pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; z: ZoomState; mid: { x: number; y: number } } | null>(null);
  // View only: a zoomed plan pans when dragged. The planner's close-up places and drags items on the plan, so a drag there is the
  // item's; panning is the Hand, Space or the middle button, as in the Room view.
  const canPan = roomNav ? hand || spaceHeld : isZoomedIn(z);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("[data-zoom-control]")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pan.current = null;
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), z: zRef.current, mid: local((a!.x + b!.x) / 2, (a!.y + b!.y) / 2) };
      setDragging(false);
      return;
    }
    if ((e.button === 0 && canPan) || e.button === 1) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      pan.current = { x: e.clientX, y: e.clientY };
      setDragging(true);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const base = pinch.current;
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      set(zoomAbout(base.z, base.mid, dist / Math.max(base.dist, 1)));
      return;
    }
    if (pan.current) {
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      pan.current = { x: e.clientX, y: e.clientY };
      set((cur) => panBy(cur, dx, dy));
    }
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      pan.current = null;
      setDragging(false);
    }
  };

  const act = (a: "in" | "out" | "hundred" | "fit") => {
    if (a === "fit") return set(FIT);
    if (a === "hundred") return set((cur) => zoomToPercent(cur, 100, centre()));
    set((cur) => zoomAbout(cur, centre(), a === "in" ? STEP : 1 / STEP));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (roomNav && e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") {
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }
    const a = keyAction(e);
    if (a) {
      e.preventDefault();
      act(a);
    }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === " ") setSpaceHeld(false);
  };

  const btn = "rounded px-2 py-1 text-sm hover:bg-line/50 focus-visible:outline focus-visible:outline-2";
  return (
    <div
      ref={box}
      role="group"
      aria-label={`${label}. Pinch or hold Ctrl or ⌘ and scroll to zoom; plus, minus, 0 and Shift 1 work when this is focused.`}
      tabIndex={0}
      className="relative overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ touchAction: canPan || roomNav ? "none" : "pan-y", cursor: dragging ? "grabbing" : canPan ? "grab" : undefined }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => setSpaceHeld(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div ref={content} style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.k})`, transformOrigin: "0 0" }}>
        {children}
      </div>
      <div data-zoom-control role="toolbar" aria-label="Zoom" className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-line bg-white/95 p-0.5 shadow">
        <button type="button" className={btn} aria-label="Zoom out" title="Zoom out (−)" onClick={() => act("out")}>
          −
        </button>
        <button type="button" className={`${btn} min-w-[3.5rem] tabular-nums`} aria-live="polite" title="Back to 100% (0)" onClick={() => act("hundred")}>
          {percentOf(z)}%
        </button>
        <button type="button" className={btn} aria-label="Zoom in" title="Zoom in (+)" onClick={() => act("in")}>
          +
        </button>
        <button type="button" className={btn} title="Fit to the page (Shift+1)" onClick={() => act("fit")}>
          Fit
        </button>
        {roomNav ? (
          <>
            <button type="button" className={`${btn} ${hand ? "bg-ink text-white hover:bg-ink" : ""}`} aria-pressed={hand} title="Hand: drag to pan (H, or hold Space)" onClick={() => setHand((on) => !on)}>
              Hand
            </button>
            <button type="button" className={btn} title="Trackpad: scroll pans, pinch zooms. Mouse: the wheel zooms." onClick={() => setNavMode(navMode === "trackpad" ? "mouse" : "trackpad")}>
              {navMode === "trackpad" ? "Trackpad" : "Mouse"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
