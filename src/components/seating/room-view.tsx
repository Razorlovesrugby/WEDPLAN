"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  calibrateSeatingRoom,
  createSeatingFixture,
  createSeatingTable,
  deleteSeatingFixture,
  moveSeatingTable,
  removeSeatingBackground,
  updateSeatingFixture,
  updateSeatingRoom,
} from "@/server/actions/seating";
import { createSeatingFixtures, deleteSeatingItems, duplicateSeatingItems, moveSeatingItems } from "@/server/actions/seating-items";
import { applyTableStyle } from "@/server/actions/seating-styles";
import { chairDetail, chairFirstName, chairMarks, initials, readableText, type ChairDetail } from "@/lib/seating/chairs";
import { colourCounts, guestColour } from "@/lib/seating/colour";
import { declinedSeats } from "@/lib/seating/declined";
import {
  FIXTURE_DEFAULTS,
  banquetPieces,
  rowBlocks,
  normaliseDegrees,
  seatPositions,
  serpentinePath,
  snap,
  tableSize,
  type Point,
} from "@/lib/seating/geometry";
import {
  LAYERS,
  alignBodies,
  boundsOf,
  boxFrom,
  boxHits,
  clampDelta,
  distributeBodies,
  fitBox,
  fixtureBody,
  gestureFactor,
  gridBodies,
  panView,
  parseKey,
  selectSimilar,
  snapGuides,
  tableBody,
  unionBox,
  viewAtPercent,
  wheelAction,
  zoomPercent,
  zoomViewAbout,
  type Align,
  type Body,
  type Box,
  type Delta,
  type Guide,
  type View,
} from "@/lib/seating/canvas";
import { classifyWalkway } from "@/lib/seating/plan-settings";
import { isTypingTarget } from "@/lib/shortcuts";
import type { SeatingFixture, SeatingTable } from "@/lib/seating/model";
import type { SeatingFixtureKind } from "@/lib/types/database";
import { useSeating } from "./seating-state";
import { useBackgroundUpload } from "./background-upload";
import { PdfPagePicker } from "./pdf-picker";
import { useDrawingTools } from "./drawing-tools";
import { DRAG_ITEM_TYPE } from "./library-panel";
import { carriesQuantity, fixtureGroup, isStampable, libraryTiles, tileByRef } from "@/lib/seating/library";
import { choiceForKey, defaultStep, lineStops, pushRecent, repeatStops, stampChoices } from "@/lib/seating/stamp";
import { isDrawing, SELECT, toolForKey, type PlaceItem } from "@/lib/seating/tools";
import { TABLET_UP, useMediaQuery } from "@/components/ui/use-media-query";
import { useFlag, useLayerLocks, useNavMode, useRail, useRecentStamps } from "./canvas-prefs";
import { FloatingToolbar } from "./canvas-toolbar";
import { CanvasMenu, type MenuItem } from "./canvas-menu";
import { FirstVisitTips, ShortcutSheet } from "./canvas-help";
import { MultiSelectionPanel } from "./selection-inspector";
import { TableInspector } from "./table-inspector";
import { setDesignerHandler } from "./designer-bridge";

const GRID_CM = 25;
/** How close, on screen, a dragged outline must come to a neighbour's edge or centre before it snaps (spec 59 A.5). */
const SNAP_PX = 8;
const WALKWAY_COLOUR = { comfortable: "#2f7d4f", tight: "#c27c0e", too_tight: "#b91c1c" } as const;

/** What Copy last took, with where the group's centre was, so Paste puts that centre at the pointer. Held for this visit, not stored. */
let clipboard: { layoutId: string | undefined; items: { kind: "table" | "fixture"; id: string; x: number; y: number; rotation: number }[]; centre: Point } | null = null;

type Drag =
  | { mode: "move"; keys: string[]; primary: string; start: Point; origins: Map<string, Body>; startBox: Box; others: Box[]; moved: boolean; copy: boolean; wasSelected: boolean; shift: boolean; delta: Delta }
  | { mode: "rotate"; key: string; centre: Point; last: number; origin: Body }
  | { mode: "pan"; start: { x: number; y: number }; view: View; moved: boolean }
  | { mode: "box"; start: Point; base: Set<string>; moved: boolean }
  /** Stamp along a line: Shift+drag with Stamp in hand. */
  | { mode: "line"; start: Point; item: PlaceItem }
  | null;

/** The view with its height following the window's shape, so a screen pixel is the same distance both ways. */
const withAspect = (v: View, size: { w: number; h: number }): View => ({ ...v, h: (v.w * size.h) / size.w });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const kindOf = (key: string) => parseKey(key)!;

/**
 * The Room view (spec 33 Part C, spec 59): an SVG floor plan in room
 * centimetres, so it's to scale by construction.
 *
 * Navigation is the design-tool model: scroll or the wheel pans or zooms
 * (Trackpad or Mouse mode, per device), pinch zooms, Space+drag or the Hand
 * tool pans, and a drag on empty floor draws a selection box. Click, Shift-click
 * and the box pick tables, furniture and décor; a drag moves the whole
 * selection, snapping to neighbours. Every selection edit is one write and one
 * undo step. Moves save once, on release, never per frame.
 *
 * Pointer events throughout, not dnd-kit (amendment 23: geometry, not lists).
 * Guests still drop onto tables here, and tap-to-place works as in the Tables view.
 */
export function RoomView({ focus = false, onLeaveFocus }: { focus?: boolean; onLeaveFocus?: () => void } = {}) {
  const { eventId, layoutId, spaceId, data, tables, setTables, fixtures, setFixtures, holdSync, refresh, setError, held, hold, move, track, tool, setTool, show, locked, leftTab, setLeftTab, openTable, settings, assignments } = useSeating();
  // Below tablet width the room is for looking at and seating people: no moving furniture, no drawing (spec 57 Part A). A locked room is the same (Part D).
  const editable = useMediaQuery(TABLET_UP) && !locked;
  const plan = data.plan;
  const roomW = plan?.room_width_cm ?? 2000;
  const roomD = plan?.room_depth_cm ?? 1500;
  const svgRef = useRef<SVGSVGElement>(null);
  const [navMode, setNavMode] = useNavMode();
  const [locks, setLocks] = useLayerLocks();
  const [navHintSeen, setNavHintSeen] = useFlag("wedplan.seating.navhint");
  const [navNote, setNavNote] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null);

  // The window's size, and the view: its width and corner are state, its height follows the window.
  const [size, setSize] = useState({ w: 1000, h: 650 });
  const sizeRef = useRef(size);
  const [view, setViewState] = useState<View>(() => withAspect(fitBox({ x0: 0, y0: 0, x1: roomW, y1: roomD }, 1000 / 650, 0.05), { w: 1000, h: 650 }));
  const setView = useCallback((next: View | ((v: View) => View)) => {
    setViewState((v) => {
      const base = withAspect(v, sizeRef.current);
      return withAspect(typeof next === "function" ? next(base) : next, sizeRef.current);
    });
  }, []);
  const viewRef = useRef(view);
  viewRef.current = withAspect(view, size);
  const fitView = useCallback((): View => fitBox({ x0: 0, y0: 0, x1: roomW, y1: roomD }, sizeRef.current.w / sizeRef.current.h, 0.05), [roomW, roomD]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    let first = true;
    const ro = new ResizeObserver(() => {
      const w = svg.clientWidth;
      const h = svg.clientHeight;
      if (!w || !h) return;
      const prev = sizeRef.current;
      if (!first && prev.w === w && prev.h === h) return;
      sizeRef.current = { w, h };
      setSize({ w, h });
      if (first) {
        // The first measure, and a new room size: show the whole room.
        first = false;
        setViewState(fitBox({ x0: 0, y0: 0, x1: roomW, y1: roomD }, w / h, 0.05));
      } else {
        // The window changed shape (a panel opened): keep the centre and the zoom.
        setViewState((v) => {
          const cx = v.x + v.w / 2;
          const cy = v.y + (v.w * prev.h) / prev.w / 2;
          const nw = (v.w * w) / prev.w;
          return { x: cx - nw / 2, y: cy - (nw * h) / w / 2, w: nw, h: (nw * h) / w };
        });
      }
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [roomW, roomD]);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [rings, setRings] = useState(false);
  const [calibrating, setCalibrating] = useState<Point[] | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dragView, setDragView] = useState<{ keys: Set<string>; dx: number; dy: number; copy: boolean } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [box, setBox] = useState<Box | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setSelection(new Set()), [spaceId, layoutId]);

  const unit = view.w / size.w;
  // 1 when the whole room fits; 2 when the view is half as wide.
  const detail = chairDetail(fitView().w / view.w);
  const zoomPct = zoomPercent(view.w, size.w);

  // Each room shows its own tables and furniture; a table with no place yet waits to be put in whichever room is open.
  const placed = useMemo(() => tables.filter((t) => t.pos_x_cm !== null && (!spaceId || t.space_id === spaceId) && show.tables), [tables, spaceId, show.tables]);
  const unplaced = tables.filter((t) => t.pos_x_cm === null);
  const hereFixtures = useMemo(
    () =>
      fixtures.filter((f) => {
        if (spaceId && f.space_id !== spaceId) return false;
        return fixtureGroup(f.kind) === "decor" ? show.decor : show.furniture;
      }),
    [fixtures, spaceId, show.decor, show.furniture],
  );

  // What can be picked: tables, furniture and décor in this room, on layers that are shown. A locked layer is drawn but never picked.
  const bodies = useMemo(() => {
    const list: Body[] = [];
    for (const t of placed) {
      const b = tableBody(t);
      if (b) list.push(b);
    }
    for (const f of hereFixtures) list.push(fixtureBody(f));
    return list;
  }, [placed, hereFixtures]);
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;
  const bodyByKey = useMemo(() => new Map(bodies.map((b) => [b.key, b])), [bodies]);
  const pickable = useCallback((b: Body) => !locks[b.layer] && !b.locked, [locks]);
  // Keys of things that are gone (deleted, or in another room) drop out of the selection without a second render.
  const sel = useMemo(() => new Set([...selection].filter((k) => bodyByKey.has(k))), [selection, bodyByKey]);
  const selBodies = useMemo(() => [...sel].map((k) => bodyByKey.get(k)!).filter(pickable), [sel, bodyByKey, pickable]);
  const selRef = useRef(sel);
  selRef.current = sel;

  /** Screen point → room centimetres. */
  const toRoom = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // The venue drawing and its tools. `unit` is room centimetres per screen pixel, so lines and text stay readable at any zoom.
  const tools = useDrawingTools({ toRoom, snapOn, roomW, roomD, unit });
  // The building is locked until asked for: it unlocks while the Venue panel is open or a drawing tool is active (spec 59 A.5).
  const [rail, setRail] = useRail();
  const panelsHidden = focus && rail.hidden;
  // Stamp (spec 59 Part C): the Library's tiles, the last six stamped (this device), and where a Shift+drag line is heading.
  const [recent, setRecent] = useRecentStamps();
  const tiles = useMemo(() => libraryTiles(data.customItems, data.marquees, settings.defaultSizes), [data.customItems, data.marquees, settings.defaultSizes]);
  const [stampStep, setStampStep] = useState<number | null>(null);
  const [lineAt, setLineAt] = useState<{ item: PlaceItem; stops: Point[] } | null>(null);
  const lastStamp = useRef<PlaceItem | null>(null);
  useEffect(() => {
    if (tool.kind === "place") lastStamp.current = tool.item;
    setStampStep(null);
  }, [tool]);
  const venueOpen = !locks.venue || (focus ? rail.panel === "venue" && !rail.hidden : leftTab === "venue") || isDrawing(tool);

  // One thing is selected at a time across the building and the furniture.
  useEffect(() => {
    if (tools.hasSelection) setSelection(new Set());
  }, [tools.hasSelection]);
  useEffect(() => {
    if (!venueOpen) tools.setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueOpen]);

  const lastPointer = useRef<Point | null>(null);

  // ---- writing ---------------------------------------------------------------
  /** Puts the items where they now are, on screen, ahead of the server. */
  const applyMoves = useCallback(
    (moves: { key: string; x: number; y: number; rotation?: number }[]) => {
      const byKey = new Map(moves.map((m) => [m.key, m]));
      setTables((ts) =>
        ts.map((t) => {
          const m = byKey.get(`t:${t.id}`);
          return m ? { ...t, pos_x_cm: Math.round(m.x), pos_y_cm: Math.round(m.y), rotation_deg: m.rotation === undefined ? t.rotation_deg : normaliseDegrees(m.rotation) } : t;
        }),
      );
      setFixtures((fs) =>
        fs.map((f) => {
          const m = byKey.get(`f:${f.id}`);
          return m ? { ...f, pos_x_cm: Math.round(m.x), pos_y_cm: Math.round(m.y), rotation_deg: m.rotation === undefined ? f.rotation_deg : normaliseDegrees(m.rotation) } : f;
        }),
      );
    },
    [setTables],
  );

  /** One write for the whole selection, and one undo step. */
  const commitMoves = useCallback(
    (moves: { key: string; x: number; y: number; rotation?: number }[], label: string) => {
      if (moves.length === 0) return;
      startTransition(async () => {
        const r = await track(label, () =>
          moveSeatingItems(
            eventId,
            layoutId,
            moves.map((m) => ({ ...kindOf(m.key), x: m.x, y: m.y, rotation: m.rotation })),
          ),
        );
        if (!r.ok) setError(r.error);
        refresh();
      });
    },
    [eventId, layoutId, track, setError, refresh],
  );

  const moveLabel = (keys: string[]) => (keys.length === 1 ? (keys[0]!.startsWith("t:") ? "Moved a table" : "Moved an item in the room") : `Moved ${keys.length} things`);

  /** Copies of `items` at their new centres (Duplicate, Alt-drag, Paste), selected once they exist. */
  const copyItems = useCallback(
    (items: { kind: "table" | "fixture"; id: string; x: number; y: number; rotation?: number }[], label: string) => {
      if (items.length === 0) return;
      startTransition(async () => {
        const r = await track(label, () => duplicateSeatingItems(eventId, layoutId, { spaceId, items }));
        if (!r.ok) setError(r.error);
        else setSelection(new Set([...r.data.tables.map((id) => `t:${id}`), ...r.data.fixtures.map((id) => `f:${id}`)]));
        refresh();
      });
    },
    [eventId, layoutId, spaceId, track, setError, refresh],
  );

  const inRoom = (p: Point): Point => ({ x: Math.round(clamp(p.x, 0, roomW)), y: Math.round(clamp(p.y, 0, roomD)) });

  const duplicateSelection = (list: Body[] = selBodies) => {
    if (!editable) return;
    copyItems(
      list.map((b) => {
        const at = inRoom({ x: b.x + 50, y: b.y + 50 });
        return { kind: b.kind, id: b.id, x: at.x, y: at.y };
      }),
      list.length === 1 ? "Duplicated an item" : `Duplicated ${list.length} things`,
    );
  };

  const copySelection = (list: Body[] = selBodies) => {
    if (list.length === 0) return;
    const box = unionBox(list.map((b) => boundsOf(b.poly)))!;
    clipboard = {
      layoutId,
      centre: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 },
      items: list.map((b) => ({ kind: b.kind, id: b.id, x: b.x, y: b.y, rotation: b.rotation })),
    };
  };

  /** Paste with the group's centre at `at` (the pointer, or the view's centre). Also into another room of the same layout. */
  const pasteAt = (at: Point | null) => {
    if (!editable || !clipboard) return;
    if (clipboard.layoutId !== layoutId) return setError("That was copied from another layout. Copy and paste work within one layout.");
    const v = viewRef.current;
    const target = at ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    const dx = target.x - clipboard.centre.x;
    const dy = target.y - clipboard.centre.y;
    copyItems(
      clipboard.items.map((i) => {
        const p = inRoom({ x: i.x + dx, y: i.y + dy });
        return { kind: i.kind, id: i.id, x: p.x, y: p.y, rotation: i.rotation };
      }),
      clipboard.items.length === 1 ? "Pasted an item" : `Pasted ${clipboard.items.length} things`,
    );
  };

  const deleteSelection = (list: Body[] = selBodies) => {
    if (!editable || list.length === 0) return;
    const tableIds = new Set(list.filter((b) => b.kind === "table").map((b) => b.id));
    const seated = assignments.filter((a) => tableIds.has(a.tableId)).length;
    if (seated > 0 && !window.confirm(`Delete ${list.length === 1 ? "this table" : `these ${tableIds.size} tables`}? ${seated} ${seated === 1 ? "guest goes" : "guests go"} back to the tray. You can undo it.`)) return;
    const gone = new Set(list.map((b) => b.key));
    setSelection(new Set());
    setTables((ts) => ts.filter((t) => !gone.has(`t:${t.id}`)));
    setFixtures((fs) => fs.filter((f) => !gone.has(`f:${f.id}`)));
    startTransition(async () => {
      const r = await track(list.length === 1 ? "Deleted an item" : `Deleted ${list.length} things`, () => deleteSeatingItems(eventId, layoutId, list.map((b) => ({ kind: b.kind, id: b.id }))));
      if (!r.ok) setError(r.error);
      refresh();
    });
  };

  // Arrow keys and R repeat quickly: the screen follows every press, and one write goes out when they stop.
  const pending = useRef<{ keys: Set<string>; label: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    commitMoves(
      [...p.keys].flatMap((k) => {
        const b = bodiesRef.current.find((x) => x.key === k);
        return b ? [{ key: k, x: b.x, y: b.y, rotation: b.rotation }] : [];
      }),
      p.label,
    );
    // The write is queued (and counted) by now, so the server's copy stays held until it lands.
    holdSync("nudges", false);
  }, [commitMoves, holdSync]);
  // Only on unmount: a re-render must never cut a run of key presses short.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);
  const later = (keys: string[], label: string) => {
    holdSync("nudges", true);
    const timer = setTimeout(flush, 400);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { keys: new Set([...(pending.current?.keys ?? []), ...keys]), label, timer };
  };

  const nudge = (dx: number, dy: number) => {
    if (!editable || selBodies.length === 0) return;
    const d = clampDelta(selBodies, { dx, dy }, roomW, roomD);
    applyMoves(selBodies.map((b) => ({ key: b.key, x: b.x + d.dx, y: b.y + d.dy, rotation: b.rotation })));
    later(selBodies.map((b) => b.key), moveLabel(selBodies.map((b) => b.key)));
  };

  /** Each item turns about its own centre. */
  const turn = (deg: number, now = false) => {
    if (!editable || selBodies.length === 0) return;
    const moves = selBodies.map((b) => ({ key: b.key, x: b.x, y: b.y, rotation: normaliseDegrees(b.rotation + deg) }));
    applyMoves(moves);
    const label = selBodies.length === 1 ? "Turned an item" : `Turned ${selBodies.length} things`;
    if (now) commitMoves(moves, label);
    else later(selBodies.map((b) => b.key), label);
  };

  const arrange = (deltas: Map<string, Delta>, label: string) => {
    if (!editable || deltas.size === 0) return;
    const moves = selBodies.flatMap((b) => {
      const d = deltas.get(b.key);
      return d && (d.dx !== 0 || d.dy !== 0) ? [{ key: b.key, x: clamp(b.x + d.dx, 0, roomW), y: clamp(b.y + d.dy, 0, roomD), rotation: b.rotation }] : [];
    });
    if (moves.length === 0) return;
    applyMoves(moves);
    commitMoves(moves, label);
  };
  const align = (how: Align) => arrange(alignBodies(selBodies, how), `Aligned ${selBodies.length} things`);
  const distribute = (axis: "x" | "y") => arrange(distributeBodies(selBodies, axis), `Spaced ${selBodies.length} things evenly`);
  const grid = (gap: number) => arrange(gridBodies(selBodies, gap), `Arranged ${selBodies.length} things in a grid`);

  const selectAll = () => setSelection(new Set(bodies.filter(pickable).map((b) => b.key)));
  const selectLike = () => setSelection(new Set(selectSimilar(bodies.filter(pickable), sel)));

  // ---- the view --------------------------------------------------------------
  /** Keyboard shortcuts live on the plan: after a toolbar button, put focus back there. */
  const focusPlan = () => svgRef.current?.focus({ preventScroll: true });
  const zoomBy = (factor: number) => setView((v) => zoomViewAbout(v, { x: v.x + v.w / 2, y: v.y + v.h / 2 }, factor, sizeRef.current.w));
  const setPercent = (pct: number) => setView((v) => viewAtPercent(v, pct, sizeRef.current.w));
  const showFit = () => setView(fitView());
  const showSelection = () => {
    const b = unionBox(selBodies.map((x) => boundsOf(x.hit)));
    if (b) setView(fitBox(b, sizeRef.current.w / sizeRef.current.h, 0.15));
  };

  // Wheel and pinch, as native listeners: React's are passive and can't stop the page scrolling or zooming. The page never moves
  // while the pointer is over the plan. Safari's pinch is a gesture event, not a wheel, so both are taken.
  const navRef = useRef(navMode);
  navRef.current = navMode;
  const hintSeenRef = useRef(navHintSeen);
  hintSeenRef.current = navHintSeen;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const at = (v: View, cx: number, cy: number): Point => {
      const r = svg.getBoundingClientRect();
      return { x: v.x + ((cx - r.left) * v.w) / r.width, y: v.y + ((cy - r.top) * v.w) / r.width };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!hintSeenRef.current) {
        hintSeenRef.current = true;
        setNavHintSeen(true);
        setNavNote(true);
        setTimeout(() => setNavNote(false), 9000);
      }
      const a = wheelAction(e, navRef.current);
      if (a.kind === "zoom") setView((v) => zoomViewAbout(v, at(v, e.clientX, e.clientY), a.factor, svg.clientWidth));
      else setView((v) => panView(v, a.dx, a.dy, svg.clientWidth));
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
      setView((v) => zoomViewAbout(v, at(v, g.clientX, g.clientY), f, svg.clientWidth));
    };
    const stop = (e: Event) => e.preventDefault();
    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("gesturestart", onGestureStart);
    svg.addEventListener("gesturechange", onGestureChange);
    svg.addEventListener("gestureend", stop);
    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("gesturestart", onGestureStart);
      svg.removeEventListener("gesturechange", onGestureChange);
      svg.removeEventListener("gestureend", stop);
    };
  }, [setView, setNavHintSeen]);

  // ---- placing from the Library ----------------------------------------------
  /** Puts a library item down at a point: a table becomes a table, anything else a fixture. */
  const tileOf = (item: PlaceItem) => tiles.find((t) => JSON.stringify(t.item) === JSON.stringify(item));
  /** `stay`: a click with Stamp in hand puts one down and keeps the tool; a drop from the Library puts one down and returns to Select. */
  const placeAt = (item: PlaceItem, p: Point, stay = false) => {
    const ref = tileOf(item)?.id;
    if (ref) setRecent(pushRecent(recent, ref));
    const at = { x: clamp(snap(p.x, snapOn ? GRID_CM : 0), 0, roomW), y: clamp(snap(p.y, snapOn ? GRID_CM : 0), 0, roomD) };
    startTransition(async () => {
      const r =
        item.type === "table"
          ? await track(`Added ${item.label.toLowerCase()}`, () =>
              createSeatingTable(eventId, { shape: item.shape, capacity: item.capacity, pos_x_cm: at.x, pos_y_cm: at.y, ...item.extra }, layoutId, spaceId),
            )
          : await track(`Added ${item.label.toLowerCase()} to the room`, () =>
              createSeatingFixture(
                eventId,
                {
                  kind: item.kind,
                  pos_x_cm: at.x,
                  pos_y_cm: at.y,
                  width_cm: item.width,
                  depth_cm: item.depth,
                  label: item.kind === "custom" || item.kind === "marquee" ? item.label : null,
                  custom_item_id: item.customItemId ?? null,
                  marquee_id: item.marqueeId ?? null,
                },
                layoutId,
                spaceId,
              ),
            );
      if (!r.ok) setError(r.error);
      refresh();
    });
    if (!stay) setTool(SELECT);
  };

  /** Stamp along a line: one write and one undo step for the lot. Fixtures go in as one insert; tables one at a time inside the one step. */
  const placeLine = (item: PlaceItem, stops: Point[]) => {
    // Exact spacing: only where the line starts is snapped (at the pointer's press), never each stamp, or "every 80 cm" would wobble 75, 100, 75.
    const pts = stops.map((p) => ({ x: clamp(Math.round(p.x), 0, roomW), y: clamp(Math.round(p.y), 0, roomD) }));
    const ref = tileOf(item)?.id;
    if (ref) setRecent(pushRecent(recent, ref));
    startTransition(async () => {
      const r = await track(`Stamped ${pts.length} ${item.label.toLowerCase()}`, async () => {
        if (item.type === "fixture") {
          return createSeatingFixtures(eventId, layoutId, {
            spaceId,
            items: pts.map((p) => ({
              kind: item.kind,
              x: p.x,
              y: p.y,
              width_cm: item.width,
              depth_cm: item.depth,
              label: item.kind === "custom" || item.kind === "marquee" ? item.label : null,
              custom_item_id: item.customItemId ?? null,
              marquee_id: item.marqueeId ?? null,
            })),
          });
        }
        let last: { ok: boolean; error?: string } = { ok: true };
        for (const p of pts) {
          last = await createSeatingTable(eventId, { shape: item.shape, capacity: item.capacity, pos_x_cm: p.x, pos_y_cm: p.y, ...item.extra }, layoutId, spaceId);
          if (!last.ok) break;
        }
        return last as { ok: boolean; error: string };
      });
      if (!r.ok) setError((r as { error: string }).error);
      refresh();
    });
  };

  /** S: Stamp with the last thing stamped, else the first favourite or recent item; with none, open the Library to pick one. */
  const startStamp = () => {
    if (!editable) return;
    const fromRef = (ref: string | undefined) => {
      const t = ref ? tileByRef(tiles, ref) : undefined;
      return t && isStampable(t) ? t.item : null;
    };
    const item = lastStamp.current ?? fromRef(settings.favourites[0]) ?? fromRef(recent[0]);
    if (item) setTool({ kind: "place", item });
    else if (focus) setRail({ panel: "library", hidden: false });
    else setLeftTab("library");
  };
  /** Repeat: N more of the one selected item, in a row across or a column down, each a gap clear of the last. */
  const repeatSelection = (count: number, gap: number, dir: "across" | "down") => {
    const b = selBodies.length === 1 ? selBodies[0]! : null;
    if (!editable || !b) return;
    const box = boundsOf(b.poly);
    const stops = repeatStops({ x: b.x, y: b.y }, { w: box.x1 - box.x0, h: box.y1 - box.y0 }, count, gap, dir);
    const fits = stops.filter((p) => p.x >= 0 && p.x <= roomW && p.y >= 0 && p.y <= roomD);
    if (fits.length < stops.length) setError(`Only ${fits.length} of ${stops.length} fit in the room.`);
    copyItems(
      fits.map((p) => ({ kind: b.kind, id: b.id, x: Math.round(p.x), y: Math.round(p.y), rotation: b.rotation })),
      `Repeated an item ${fits.length} times`,
    );
  };

  // ---- the pointer -----------------------------------------------------------
  const drag = useRef<Drag>(null);
  /** A drag, a selection box or a stamp line holds the server's copy back until it ends (spec 60 E.1); a pan writes nothing. */
  const setDrag = (d: Drag) => {
    drag.current = d;
    holdSync("gesture", d !== null && d.mode !== "pan");
  };
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; view: View; mid: Point } | null>(null);
  const panBy = tool.kind === "hand" || spaceHeld;

  const startPan = (e: RPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ mode: "pan", start: { x: e.clientX, y: e.clientY }, view: viewRef.current, moved: false });
    setPanning(true);
  };

  const onItemPointerDown = (e: RPointerEvent, key: string) => {
    if (calibrating || isDrawing(tool) || tool.kind === "place") return;
    if (e.button === 1) return startPan(e);
    if (e.button !== 0) return;
    const body = bodyByKey.get(key);
    if (!body) return;
    e.stopPropagation();
    svgRef.current?.focus({ preventScroll: true });
    tools.setSelected(null);
    // A guest in hand seats at the table tapped; picking and moving are for when nobody is held.
    let keys = [...sel];
    const wasSelected = sel.has(key);
    if (!held) {
      if (e.shiftKey) {
        const next = new Set(sel);
        if (!next.delete(key)) next.add(key);
        setSelection(next);
        if (!next.has(key)) return;
        keys = [...next];
      } else if (!wasSelected) {
        setSelection(new Set([key]));
        keys = [key];
      }
    } else keys = [key];
    const movable = keys.map((k) => bodyByKey.get(k)).filter((b): b is Body => Boolean(b) && pickable(b!));
    if (movable.length === 0) return;
    const startBox = unionBox(movable.map((b) => boundsOf(b.poly)))!;
    const moving = new Set(movable.map((b) => b.key));
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({
      mode: "move",
      keys: movable.map((b) => b.key),
      primary: movable.some((b) => b.key === key) ? key : movable[0]!.key,
      start: toRoom(e.clientX, e.clientY),
      origins: new Map(movable.map((b) => [b.key, b])),
      startBox,
      others: bodies.filter((b) => !moving.has(b.key)).map((b) => boundsOf(b.poly)),
      moved: false,
      // Alt before the drag copies; Alt during one turns snapping off.
      copy: e.altKey && editable && !held,
      wasSelected,
      shift: e.shiftKey,
      delta: { dx: 0, dy: 0 },
    });
  };

  const onRotatePointerDown = (e: RPointerEvent, key: string) => {
    if (!editable) return;
    const b = bodyByKey.get(key);
    if (!b) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ mode: "rotate", key, centre: { x: b.x, y: b.y }, last: b.rotation, origin: b });
  };

  const onBackgroundPointerDown = (e: RPointerEvent) => {
    svgRef.current?.focus({ preventScroll: true });
    if (e.button === 2) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setDrag(null);
      setPanning(false);
      pinch.current = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), view: viewRef.current, mid: toRoom((a!.x + b!.x) / 2, (a!.y + b!.y) / 2) };
      return;
    }
    if (tool.kind === "place" && editable && e.shiftKey && e.button === 0 && e.pointerType !== "touch" && !panBy) {
      const raw = toRoom(e.clientX, e.clientY);
      const start = { x: snap(raw.x, snapOn ? GRID_CM : 0), y: snap(raw.y, snapOn ? GRID_CM : 0) };
      setDrag({ mode: "line", start, item: tool.item });
      setLineAt({ item: tool.item, stops: [start] });
      return;
    }
    // Pan: the middle button, Space, the Hand tool, a finger, and any tool that draws (a click is its click, a drag moves the view).
    // Otherwise the Select tool draws a selection box.
    if (e.button === 1 || panBy || e.pointerType === "touch" || tool.kind !== "select") {
      setDrag({ mode: "pan", start: { x: e.clientX, y: e.clientY }, view: viewRef.current, moved: false });
      if (e.button === 1 || panBy) setPanning(true);
    } else {
      setDrag({ mode: "box", start: toRoom(e.clientX, e.clientY), base: e.shiftKey ? new Set(sel) : new Set(), moved: false });
    }
  };

  const onPointerMove = (e: RPointerEvent) => {
    lastPointer.current = toRoom(e.clientX, e.clientY);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const base = pinch.current;
      setView(zoomViewAbout(base.view, base.mid, dist / Math.max(base.dist, 1), sizeRef.current.w));
      return;
    }
    if (isDrawing(tool) || tool.kind === "place") tools.onCanvasMove(lastPointer.current, e.shiftKey);
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      if (!editable) return;
      const p = lastPointer.current;
      const raw = { dx: p.x - d.start.x, dy: p.y - d.start.y };
      if (!d.moved && Math.hypot(raw.dx, raw.dy) < 4 * unit) return;
      d.moved = true;
      const prim = d.origins.get(d.primary)!;
      let dx: number;
      let dy: number;
      if (snapOn && !(e.altKey && !d.copy)) {
        // Guides first, the grid on whichever axis found no neighbour.
        const g = snapGuides({ x0: d.startBox.x0 + raw.dx, y0: d.startBox.y0 + raw.dy, x1: d.startBox.x1 + raw.dx, y1: d.startBox.y1 + raw.dy }, d.others, SNAP_PX * unit);
        dx = g.x ? raw.dx + g.dx : snap(prim.x + raw.dx, GRID_CM) - prim.x;
        dy = g.y ? raw.dy + g.dy : snap(prim.y + raw.dy, GRID_CM) - prim.y;
        setGuides(g.guides);
      } else {
        dx = Math.round(prim.x + raw.dx) - prim.x;
        dy = Math.round(prim.y + raw.dy) - prim.y;
        setGuides([]);
      }
      d.delta = clampDelta([...d.origins.values()], { dx, dy }, roomW, roomD);
      setDragView({ keys: new Set(d.keys), dx: d.delta.dx, dy: d.delta.dy, copy: d.copy });
    } else if (d.mode === "rotate") {
      const p = lastPointer.current;
      const deg = (Math.atan2(p.y - d.centre.y, p.x - d.centre.x) * 180) / Math.PI + 90;
      d.last = normaliseDegrees(e.shiftKey ? deg : Math.round(deg / 15) * 15);
      applyMoves([{ key: d.key, x: d.centre.x, y: d.centre.y, rotation: d.last }]);
    } else if (d.mode === "pan") {
      const scale = d.view.w / sizeRef.current.w;
      const dx = (e.clientX - d.start.x) * scale;
      const dy = (e.clientY - d.start.y) * scale;
      if (Math.hypot(dx, dy) > 4 * scale) d.moved = true;
      setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
    } else if (d.mode === "line") {
      setLineAt({ item: d.item, stops: lineStops(d.start, lastPointer.current, stampStep ?? defaultStep(tileOf(d.item)?.w ?? 60)) });
    } else if (d.mode === "box") {
      const p = lastPointer.current;
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 4 * unit) return;
      d.moved = true;
      const rect = boxFrom(d.start, p);
      setBox(rect);
      const hits = boxHits(bodies.filter(pickable), rect, e.altKey ? "contain" : "touch");
      setSelection(new Set([...d.base, ...hits]));
    }
  };

  /** A click on empty floor: the calibration's point, a tool's click, or "pick nothing". */
  const clickEmpty = (p: Point, e: { shiftKey: boolean }) => {
    if (calibrating) {
      const next = [...calibrating, p];
      if (next.length === 2) finishCalibration(next);
      else setCalibrating(next);
    } else if (editable && tool.kind === "place") placeAt(tool.item, p, true);
    else if (editable && tools.onCanvasClick(p, e)) {
      // The tool took the click.
    } else {
      if (!e.shiftKey) setSelection(new Set());
      tools.setSelected(null);
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    setDrag(null);
    setPanning(false);
    setBox(null);
    if (!d) return;
    if (d.mode === "move") {
      setDragView(null);
      setGuides([]);
      if (d.moved) {
        const moves = d.keys.map((k) => {
          const o = d.origins.get(k)!;
          return { key: k, x: o.x + d.delta.dx, y: o.y + d.delta.dy, rotation: o.rotation };
        });
        if (d.copy) copyItems(moves.map((m) => ({ ...kindOf(m.key), x: m.x, y: m.y, rotation: m.rotation })), moves.length === 1 ? "Copied an item" : `Copied ${moves.length} things`);
        else {
          applyMoves(moves);
          commitMoves(moves, moveLabel(d.keys));
        }
      } else if (held && d.origins.get(d.primary)?.kind === "table") {
        move(held.guestIds, d.origins.get(d.primary)!.id);
        hold(null);
      } else if (d.wasSelected && !d.shift && sel.size > 1) {
        // A plain click on one of several picks just that one.
        setSelection(new Set([d.primary]));
      }
    } else if (d.mode === "rotate") {
      commitMoves([{ key: d.key, x: d.centre.x, y: d.centre.y, rotation: d.last }], "Turned an item");
    } else if (d.mode === "line") {
      setLineAt(null);
      // A cancelled pointer (the window lost focus) is not a drop: nothing is placed.
      if (e.type === "pointercancel") return;
      placeLine(d.item, lineStops(d.start, toRoom(e.clientX, e.clientY), stampStep ?? defaultStep(tileOf(d.item)?.w ?? 60)));
    } else if (d.mode === "pan" && !d.moved) {
      clickEmpty(toRoom(e.clientX, e.clientY), e);
    } else if (d.mode === "box" && !d.moved) {
      clickEmpty(toRoom(e.clientX, e.clientY), e);
    }
  };

  // ---- the keyboard ----------------------------------------------------------
  const onKeyDown = (e: RKeyboardEvent) => {
    if (isTypingTarget(e.target as HTMLElement)) return;
    if (e.key === " ") {
      e.preventDefault();
      if (!e.repeat) setSpaceHeld(true);
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      // Not also the shell's "all shortcuts" sheet: on the plan, ? is about the plan.
      e.stopPropagation();
      setSheet(true);
      return;
    }
    if (editable && tools.onKey(e)) return;
    const command = e.metaKey || e.ctrlKey;
    if (command) {
      const k = e.key.toLowerCase();
      if (k === "a") {
        e.preventDefault();
        if (e.shiftKey) selectLike();
        else selectAll();
      } else if (k === "d" && editable) {
        e.preventDefault();
        duplicateSelection();
      } else if (k === "c" && selBodies.length > 0) {
        e.preventDefault();
        copySelection();
      } else if (k === "v" && editable) {
        e.preventDefault();
        pasteAt(lastPointer.current);
      }
      return;
    }
    if (e.altKey) return;
    // While Stamp is in hand, 1 to 9 switch between the favourites and the recent items (spec 59 Part C).
    if (tool.kind === "place" && !e.shiftKey && /^[1-9]$/.test(e.key)) {
      const ref = choiceForKey(e.key, stampChoices(settings.favourites, recent));
      const t = ref ? tileByRef(tiles, ref) : undefined;
      if (t && isStampable(t)) setTool({ kind: "place", item: t.item });
      return;
    }
    if ((e.key === "s" || e.key === "S") && !e.shiftKey) return startStamp();
    const step = e.shiftKey ? 25 : 5;
    if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.25);
    else if (e.key === "0") setPercent(100);
    else if (e.shiftKey && e.code === "Digit1") showFit();
    else if (e.shiftKey && e.code === "Digit2") showSelection();
    else if (e.key === "Escape") {
      if (sel.size) setSelection(new Set());
      // Nothing picked and no tool in hand: Esc leaves focus mode.
      else if (focus && tool.kind === "select" && !tools.hasSelection) onLeaveFocus?.();
    }
    else if (e.key === "ArrowLeft" && sel.size) (e.preventDefault(), nudge(-step, 0));
    else if (e.key === "ArrowRight" && sel.size) (e.preventDefault(), nudge(step, 0));
    else if (e.key === "ArrowUp" && sel.size) (e.preventDefault(), nudge(0, -step));
    else if (e.key === "ArrowDown" && sel.size) (e.preventDefault(), nudge(0, step));
    else if ((e.key === "r" || e.key === "R") && sel.size) turn(e.shiftKey ? -15 : 15);
    else if ((e.key === "Delete" || e.key === "Backspace") && sel.size) (e.preventDefault(), deleteSelection());
    else {
      const next = toolForKey(e.key);
      if (next && !e.shiftKey && (editable || next.kind === "select" || next.kind === "hand")) setTool(tool.kind === next.kind && next.kind !== "select" ? SELECT : next);
    }
  };
  const onKeyUp = (e: RKeyboardEvent) => {
    if (e.key === " ") setSpaceHeld(false);
  };

  const finishCalibration = (points: Point[]) => {
    setCalibrating(null);
    if (!plan?.background_w_px || !plan.background_h_px) return;
    const metres = window.prompt("How far apart are those two points, in metres?");
    const real = metres ? Number(metres.replace(",", ".")) * 100 : NaN;
    if (!Number.isFinite(real) || real <= 0) return;
    // Room centimetres → image pixels: the room box is the image.
    const toPx = (p: Point) => ({ x: (p.x / roomW) * plan.background_w_px!, y: (p.y / roomD) * plan.background_h_px! });
    startTransition(async () => {
      const r = await track("Calibrated the room", () => calibrateSeatingRoom(eventId, toPx(points[0]!), toPx(points[1]!), real, layoutId, spaceId));
      if (!r.ok) setError(r.error);
      refresh();
    });
  };

  // ---- right-click -----------------------------------------------------------
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (calibrating || isDrawing(tool)) return;
    const el = (e.target as Element).closest("[data-key]");
    const key = el?.getAttribute("data-key") ?? null;
    const at = { x: e.clientX, y: e.clientY };
    const here = toRoom(e.clientX, e.clientY);
    const navigation: MenuItem = {
      label: "Navigation",
      children: [
        { label: "Trackpad: scroll pans, pinch zooms", checked: navMode === "trackpad", onSelect: () => setNavMode("trackpad") },
        { label: "Mouse: the wheel zooms", checked: navMode === "mouse", onSelect: () => setNavMode("mouse") },
      ],
    };
    if (!key || !bodyByKey.has(key)) {
      setMenu({
        at,
        items: [
          { label: "Paste here", keys: "⌘V", disabled: !editable || !clipboard, onSelect: () => pasteAt(here) },
          "sep",
          { label: "Fit the room", keys: "⇧1", onSelect: showFit },
          navigation,
          {
            label: "Lock or unlock a layer",
            children: LAYERS.filter((l) => l.id !== "notes").map((l) => ({ label: l.label, checked: locks[l.id], onSelect: () => setLocks({ ...locks, [l.id]: !locks[l.id] }) })),
          },
        ],
      });
      return;
    }
    const body = bodyByKey.get(key)!;
    if (!pickable(body)) return;
    const list = sel.has(key) ? selBodies : [body];
    if (!sel.has(key)) setSelection(new Set([key]));
    const one = list.length === 1 ? list[0]! : null;
    const tableIds = list.filter((b) => b.kind === "table").map((b) => b.id);
    const tableBodies = list.filter((b) => b.kind === "table");
    const styleItems: MenuItem[] = [
      { label: "No style", onSelect: () => applyStyle(tableIds, null) },
      ...data.styles.map((s): MenuItem => ({ label: s.name, onSelect: () => applyStyle(tableIds, s.id) })),
    ];
    const aligns: [string, Align][] = [["Left", "left"], ["Centre across", "centre"], ["Right", "right"], ["Top", "top"], ["Middle down", "middle"], ["Bottom", "bottom"]];
    setMenu({
      at,
      items: [
        { label: "Duplicate", keys: "⌘D", disabled: !editable, onSelect: () => duplicateSelection(list) },
        { label: "Copy", keys: "⌘C", onSelect: () => copySelection(list) },
        { label: "Paste", keys: "⌘V", disabled: !editable || !clipboard, onSelect: () => pasteAt(here) },
        { label: "Delete", keys: "Del", disabled: !editable, onSelect: () => deleteSelection(list) },
        "sep",
        { label: "Turn 90°", disabled: !editable, onSelect: () => turn(90, true) },
        { label: "Select similar", keys: "⌘⇧A", onSelect: () => setSelection(new Set(selectSimilar(bodies.filter(pickable), list.map((b) => b.key)))) },
        ...(list.length > 1
          ? ([
              {
                label: "Align and space",
                disabled: !editable,
                children: [
                  ...aligns.map(([label, how]): MenuItem => ({ label, onSelect: () => align(how) })),
                  { label: "Space evenly across", disabled: list.length < 3, onSelect: () => distribute("x") },
                  { label: "Space evenly down", disabled: list.length < 3, onSelect: () => distribute("y") },
                  { label: "Arrange in a grid (50 cm gap)", onSelect: () => grid(50) },
                ],
              },
            ] as MenuItem[])
          : []),
        ...(tableBodies.length > 0
          ? ([
              "sep",
              ...(one && one.kind === "table" ? ([{ label: "Open close-up", onSelect: () => openTable(one.id) }] as MenuItem[]) : []),
              { label: "Apply style", disabled: !editable || data.styles.length === 0, children: styleItems },
            ] as MenuItem[])
          : []),
      ],
    });
  };

  const applyStyle = (ids: string[], styleId: string | null) =>
    startTransition(async () => {
      const r = await track(styleId ? "Applied a table style" : "Took a style off", () => applyTableStyle(eventId, styleId, ids));
      if (!r.ok) setError(r.error);
      refresh();
    });

  // ⌘K reaches the plan through one handler, registered while this view is on screen and kept current by a ref.
  const commandRef = useRef<(id: string) => void>(() => {});
  commandRef.current = (id) => {
    const aligns: Record<string, Align> = { "align-left": "left", "align-centre": "centre", "align-right": "right", "align-top": "top", "align-middle": "middle", "align-bottom": "bottom" };
    if (aligns[id]) return align(aligns[id]!);
    switch (id) {
      case "fit": return showFit();
      case "zoom-selection": return showSelection();
      case "zoom-100": return setPercent(100);
      case "zoom-in": return zoomBy(1.25);
      case "zoom-out": return zoomBy(1 / 1.25);
      case "tool-select": return setTool(SELECT);
      case "tool-hand": return setTool({ kind: "hand" });
      case "tool-wall": return editable ? setTool({ kind: "wall" }) : undefined;
      case "tool-arc": return editable ? setTool({ kind: "arc" }) : undefined;
      case "tool-area": return editable ? setTool({ kind: "area" }) : undefined;
      case "tool-text": return editable ? setTool({ kind: "text" }) : undefined;
      case "tool-measure": return editable ? setTool({ kind: "measure" }) : undefined;
      case "select-all": return selectAll();
      case "select-similar": return selectLike();
      case "duplicate": return duplicateSelection();
      case "delete": return deleteSelection();
      case "turn": return turn(90, true);
      case "space-across": return distribute("x");
      case "space-down": return distribute("y");
      case "grid": return grid(50);
      case "nav-trackpad": return setNavMode("trackpad");
      case "nav-mouse": return setNavMode("mouse");
      case "shortcuts": return setSheet(true);
    }
  };
  useEffect(() => {
    setDesignerHandler((id) => commandRef.current(id));
    return () => setDesignerHandler(null);
  }, []);

  // ---- drawing ---------------------------------------------------------------
  const single = sel.size === 1 ? [...sel][0]! : null;
  const selectedTable = single?.startsWith("t:") ? tables.find((t) => `t:${t.id}` === single) : undefined;
  const selectedFixture = single?.startsWith("f:") ? fixtures.find((f) => `f:${f.id}` === single) : undefined;
  const handleR = view.w / 40;
  const fontSize = Math.max(14, view.w / 70);

  const itemCursor = !editable ? (locked ? "not-allowed" : "pointer") : held ? "copy" : "move";
  const cursor = panning ? "grabbing" : panBy ? "grab" : isDrawing(tool) || tool.kind === "place" ? "crosshair" : "default";
  const shift = (key: string) => (dragView && !dragView.copy && dragView.keys.has(key) ? `translate(${dragView.dx} ${dragView.dy})` : undefined);

  // Stable handlers, so a drag redraws only what moved: every shape is memoised on these.
  const handlers = useRef({ down: onItemPointerDown });
  handlers.current = { down: onItemPointerDown };
  const stableDown = useCallback((e: RPointerEvent, key: string) => handlers.current.down(e, key), []);

  const selectionOutline = useMemo(() => {
    if (selBodies.length < 2) return null;
    return unionBox(selBodies.map((b) => boundsOf(b.poly)));
  }, [selBodies]);

  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of selBodies) {
      const f = b.kind === "fixture" ? fixtures.find((x) => x.id === b.id) : undefined;
      const label = b.kind === "table" ? "table" : (f?.label ?? FIXTURE_DEFAULTS[f?.kind ?? ""]?.label ?? "item").toLowerCase();
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, n]) => (label === "table" ? `${n} table${n === 1 ? "" : "s"}` : `${n} ${label}`)).join(", ");
  }, [selBodies, fixtures]);

  const hint = calibrating
    ? `Click two points on the floor plan whose real distance you know — two walls, a doorway.${calibrating.length === 1 ? " Now the second." : ""}`
    : held
      ? `Tap a table to seat ${held.label}.`
      : navNote
        ? navMode === "trackpad"
          ? "Trackpad mode: two-finger scroll pans, pinch or ⌘/Ctrl+scroll zooms. On a mouse, switch to Mouse mode in the zoom box or by right-clicking the plan."
          : "Mouse mode: the wheel zooms, Shift+wheel pans sideways. On a trackpad, switch to Trackpad mode in the zoom box or by right-clicking the plan."
        : tool.kind === "place"
          ? `Stamp: ${tool.item.label} · click to place · Shift+drag a line · 1–9 switch · Esc to stop`
          : tools.status
            ? tools.status
            : tool.kind === "hand" || spaceHeld
              ? "Hand: drag to pan · V for Select"
              : sel.size > 0
                ? `${sel.size} selected · drag to move · arrows nudge · R turns · Alt before dragging copies · Delete removes`
                : "Select: click, or drag a box · Shift adds · Space+drag pans · ? for shortcuts";

  const strip = (
    <RoomStrip
      roomW={roomW}
      roomD={roomD}
      snapOn={snapOn}
      setSnapOn={setSnapOn}
      rings={rings}
      setRings={setRings}
      calibrating={calibrating !== null}
      setCalibrating={(on) => setCalibrating(on ? [] : null)}
      editable={editable}
      onFit={() => (showFit(), focusPlan())}
    />
  );

  const unplacedChips =
    unplaced.length > 0 ? (
      <div className={focus ? "flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-white px-2 py-1 text-sm" : "card flex flex-wrap items-center gap-2 p-2 text-sm"}>
        <span className="text-xs text-muted">Not in the room yet:</span>
        {unplaced.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn py-1"
            onClick={() => {
              const v = viewRef.current;
              const at = {
                x: clamp(snap(v.x + v.w / 2, GRID_CM), 0, roomW),
                y: clamp(snap(v.y + v.h / 2, GRID_CM), 0, roomD),
              };
              applyMoves([{ key: `t:${t.id}`, x: at.x, y: at.y, rotation: t.rotation_deg }]);
              startTransition(async () => {
                const r = await track("Put a table in the room", () => moveSeatingTable(t.id, eventId, { x: at.x, y: at.y, rotation: t.rotation_deg, spaceId }));
                if (!r.ok) setError(r.error);
                refresh();
              });
            }}
          >
            Place {t.label}
          </button>
        ))}
      </div>
    ) : null;

  // What the inspector shows: the venue's own selection, one table (Seats, Style, Notes), one fixture, or several things.
  const inspector = (
    <>
      {tools.selectionPanel}
      {selectedTable ? (
        focus ? (
          <TableInspector table={selectedTable} seats={<SelectedTablePanel table={selectedTable} onUnplace={() => setSelection(new Set())} editable={editable} onRepeat={repeatSelection} />} />
        ) : (
          <SelectedTablePanel table={selectedTable} onUnplace={() => setSelection(new Set())} editable={editable} onRepeat={repeatSelection} />
        )
      ) : null}
      {selectedFixture ? <SelectedFixturePanel fixture={selectedFixture} onDone={() => setSelection(new Set())} editable={editable} onRepeat={repeatSelection} /> : null}
      {sel.size > 1 ? (
        <MultiSelectionPanel
          summary={summary}
          count={sel.size}
          editable={editable}
          onAlign={align}
          onDistribute={distribute}
          onGrid={grid}
          onSimilar={selectLike}
          onDuplicate={() => duplicateSelection()}
          onTurn={() => turn(90, true)}
          onDelete={() => deleteSelection()}
          onClear={() => setSelection(new Set())}
        />
      ) : null}
    </>
  );
  const hasInspector = Boolean(tools.selectionPanel) || sel.size > 0;

  const overlays = (
    <>
      {menu ? <CanvasMenu at={menu.at} items={menu.items} onClose={() => setMenu(null)} /> : null}
      {sheet ? <ShortcutSheet onClose={() => { setSheet(false); svgRef.current?.focus({ preventScroll: true }); }} /> : null}
    </>
  );

  const canvas = (
    <>
      <CanvasLegend />
      {editable ? <FirstVisitTips /> : null}
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className={`block w-full touch-none select-none bg-[#f6f3ee] outline-none ${focus ? "h-full" : "h-[72vh] min-h-[28rem]"}`}
        style={{ cursor }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => setSpaceHeld(false)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        onDoubleClick={() => editable && tools.onDoubleClick()}
        onDragOver={(e) => {
          if (editable && e.dataTransfer.types.includes(DRAG_ITEM_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(DRAG_ITEM_TYPE);
          if (!editable || !raw) return;
          e.preventDefault();
          try {
            placeAt(JSON.parse(raw) as PlaceItem, toRoom(e.clientX, e.clientY));
          } catch {
            /* not one of ours */
          }
        }}
        aria-label="Floor plan"
        role="application"
      >
          <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill="transparent" onPointerDown={onBackgroundPointerDown} />
          <g style={{ pointerEvents: "none" }}>
            <rect x={0} y={0} width={roomW} height={roomD} fill="#ffffff" stroke="#8a8580" strokeWidth={view.w / 400} />
            {data.backgroundUrl && show.venue ? (
              <image
                href={data.backgroundUrl}
                x={0}
                y={0}
                width={roomW}
                height={roomD}
                preserveAspectRatio="none"
                opacity={(data.spaces.find((s) => s.id === spaceId)?.background_opacity ?? 55) / 100}
              />
            ) : null}
            <Grid roomW={roomW} roomD={roomD} strokeWidth={view.w / 1200} />
          </g>

          {tools.showHere(show.venue, venueOpen)}

          {/* While a drawing tool, the Hand or Space is in hand, a click goes to the plan underneath, not to a table or a bar. */}
          <g style={isDrawing(tool) || tool.kind === "place" || panBy ? { pointerEvents: "none" } : undefined}>
            {hereFixtures.map((f) => {
              const key = `f:${f.id}`;
              return (
                <g key={f.id} transform={shift(key)} style={locks[fixtureBodyLayer(f)] ? { pointerEvents: "none" } : undefined}>
                  <FixtureShape
                    fixture={f}
                    itemKey={key}
                    selected={sel.has(key)}
                    hovered={hoverKey === key}
                    cursor={itemCursor}
                    fontSize={fontSize}
                    onPointerDown={stableDown}
                    onHover={setHoverKey}
                  />
                </g>
              );
            })}

            {placed.map((t) => {
              const key = `t:${t.id}`;
              return (
                <g key={t.id} transform={shift(key)} style={locks.tables ? { pointerEvents: "none" } : undefined}>
                  <TableShape
                    table={t}
                    itemKey={key}
                    selected={sel.has(key)}
                    hovered={hoverKey === key}
                    cursor={itemCursor}
                    rings={rings}
                    fontSize={fontSize}
                    detail={detail}
                    onPointerDown={stableDown}
                    onHover={setHoverKey}
                  />
                </g>
              );
            })}
          </g>

          {tools.overlay}

          {calibrating?.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={view.w / 150} fill="#b0532b" style={{ pointerEvents: "none" }} />
          ))}

          {/* An Alt-drag leaves the originals where they are and shows where the copies will land. */}
          {dragView?.copy ? (
            <g transform={`translate(${dragView.dx} ${dragView.dy})`} style={{ pointerEvents: "none" }} opacity={0.6}>
              {[...dragView.keys].map((k) => {
                const b = bodyByKey.get(k);
                return b ? <polygon key={k} points={b.poly.map((p) => `${p.x},${p.y}`).join(" ")} fill="#fbeee6" stroke="#b0532b" strokeWidth={unit * 2} strokeDasharray={`${unit * 6} ${unit * 4}`} /> : null;
              })}
            </g>
          ) : null}

          {selectionOutline ? (
            <rect
              x={selectionOutline.x0 + (dragView && !dragView.copy ? dragView.dx : 0) - 10 * unit}
              y={selectionOutline.y0 + (dragView && !dragView.copy ? dragView.dy : 0) - 10 * unit}
              width={selectionOutline.x1 - selectionOutline.x0 + 20 * unit}
              height={selectionOutline.y1 - selectionOutline.y0 + 20 * unit}
              fill="none"
              stroke="#b0532b"
              strokeWidth={unit * 1.5}
              strokeDasharray={`${unit * 6} ${unit * 4}`}
              style={{ pointerEvents: "none" }}
            />
          ) : null}

          {box ? <rect x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0} fill="#b0532b" fillOpacity={0.08} stroke="#b0532b" strokeWidth={unit * 1.5} strokeDasharray={`${unit * 5} ${unit * 3}`} style={{ pointerEvents: "none" }} /> : null}

          {guides.length > 0 ? <GuideLines guides={guides} unit={unit} settings={settings} /> : null}

          {lineAt ? (
            <g style={{ pointerEvents: "none" }}>
              {lineAt.stops.map((p, i) => {
                const t = tileOf(lineAt.item);
                const w = t?.w ?? 60;
                const d = t?.d ?? 60;
                return lineAt.item.type === "table" && lineAt.item.shape === "round" ? (
                  <ellipse key={i} cx={p.x} cy={p.y} rx={w / 2} ry={d / 2} fill="#fbeee6" fillOpacity={0.7} stroke="#b0532b" strokeWidth={unit * 1.5} strokeDasharray={`${unit * 5} ${unit * 3}`} />
                ) : (
                  <rect key={i} x={p.x - w / 2} y={p.y - d / 2} width={w} height={d} fill="#fbeee6" fillOpacity={0.7} stroke="#b0532b" strokeWidth={unit * 1.5} strokeDasharray={`${unit * 5} ${unit * 3}`} />
                );
              })}
              <text x={lineAt.stops[lineAt.stops.length - 1]!.x} y={lineAt.stops[lineAt.stops.length - 1]!.y - 24 * unit} textAnchor="middle" fontSize={13 * unit} fill="#b0532b" stroke="#ffffff" strokeWidth={3.5 * unit} paintOrder="stroke">
                {lineAt.stops.length} × {lineAt.item.label.toLowerCase()}
              </text>
            </g>
          ) : null}

          {editable && selectedTable && !dragView && selectedTable.pos_x_cm !== null ? (
            <RotateHandle item={selectedTable} r={handleR} onPointerDown={(e) => onRotatePointerDown(e, `t:${selectedTable.id}`)} />
          ) : null}
          {editable && selectedFixture && !dragView ? <RotateHandle item={selectedFixture} r={handleR} onPointerDown={(e) => onRotatePointerDown(e, `f:${selectedFixture.id}`)} /> : null}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-1.5 px-3">
        <FloatingToolbar
          tool={tool}
          setTool={(t) => setTool(t)}
          canDraw={editable}
          toolsHidden={panelsHidden}
          zoomPct={zoomPct}
          zoomBy={zoomBy}
          onFit={showFit}
          onSelection={showSelection}
          hasSelection={selBodies.length > 0}
          onPercent={setPercent}
          navMode={navMode}
          setNavMode={setNavMode}
          onDone={focusPlan}
          onStamp={startStamp}
        />
        {panelsHidden ? null : (
          <p className="max-w-full rounded bg-white/90 px-2 py-0.5 text-center text-xs text-muted shadow-sm" role="status" aria-live="polite">
            {hint}
          </p>
        )}
        {tool.kind === "place" && !panelsHidden ? (
          // How far apart a Shift+drag line stamps: the item's width and 20 cm by default, typed here to change it.
          <label className="pointer-events-auto flex items-center gap-1.5 rounded bg-white/90 px-2 py-0.5 text-xs text-muted shadow-sm">
            Shift+drag stamps every
            <input
              type="number"
              min={5}
              max={2000}
              className="field w-16 py-0 text-xs"
              aria-label="Distance between stamps along a line, in centimetres"
              value={stampStep ?? defaultStep(tileOf(tool.item)?.w ?? 60)}
              onChange={(e) => {
                const n = Number(e.target.value);
                setStampStep(Number.isFinite(n) && n > 0 ? Math.min(2000, Math.max(5, Math.round(n))) : null);
              }}
            />
            cm
          </label>
        ) : null}
      </div>
    </>
  );

  if (focus) {
    return (
      <div className="flex h-full min-h-0 w-full">
        <div className="flex min-w-0 flex-1 flex-col">
          {panelsHidden ? null : <div className="shrink-0 border-b border-line bg-white px-2 py-1">{strip}</div>}
          {panelsHidden ? null : unplacedChips}
          {/* Filled absolutely: a percentage height doesn't resolve inside a flex item, and the plan must fit the window exactly. */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-0">{canvas}</div>
          </div>
        </div>
        {hasInspector && !panelsHidden ? (
          <aside aria-label="Inspector" className="w-80 shrink-0 space-y-2 overflow-y-auto border-l border-line bg-paper p-2">
            {inspector}
          </aside>
        ) : null}
        {overlays}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {strip}
      <div className="card relative overflow-hidden">{canvas}</div>
      {unplacedChips}
      {inspector}
      {editable ? (
        <>
          <AddFixture view={view} roomW={roomW} roomD={roomD} />
          <RoomSettings />
        </>
      ) : null}
      {overlays}
    </div>
  );
}

/** The layer a fixture is on: décor, or furniture. */
function fixtureBodyLayer(f: SeatingFixture): "decor" | "furniture" {
  return fixtureGroup(f.kind) === "decor" ? "decor" : "furniture";
}

/** The lines a drag draws: edges and centres it lined up with, and the equal gaps it kept, labelled in cm and coloured by the walkway thresholds. */
function GuideLines({ guides, unit, settings }: { guides: Guide[]; unit: number; settings: Parameters<typeof classifyWalkway>[1] }) {
  const GUIDE = "#d6336c";
  return (
    <g style={{ pointerEvents: "none" }}>
      {guides.map((g, i) => {
        const horizontal = g.axis === "y";
        if (g.kind !== "spacing") {
          return horizontal ? (
            <line key={i} x1={g.from} y1={g.at} x2={g.to} y2={g.at} stroke={GUIDE} strokeWidth={unit} strokeDasharray={g.kind === "centre" ? `${unit * 4} ${unit * 3}` : undefined} />
          ) : (
            <line key={i} x1={g.at} y1={g.from} x2={g.at} y2={g.to} stroke={GUIDE} strokeWidth={unit} strokeDasharray={g.kind === "centre" ? `${unit * 4} ${unit * 3}` : undefined} />
          );
        }
        // A spacing guide: a dimension line across the gap with end ticks and its length.
        const colour = WALKWAY_COLOUR[classifyWalkway(g.gap ?? 0, settings)];
        const x1 = g.axis === "y" ? g.from : g.at;
        const y1 = g.axis === "y" ? g.at : g.from;
        const x2 = g.axis === "y" ? g.to : g.at;
        const y2 = g.axis === "y" ? g.at : g.to;
        const tick = 5 * unit;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth={1.5 * unit} />
            {g.axis === "y" ? (
              <>
                <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} stroke={colour} strokeWidth={1.5 * unit} />
                <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} stroke={colour} strokeWidth={1.5 * unit} />
              </>
            ) : (
              <>
                <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} stroke={colour} strokeWidth={1.5 * unit} />
                <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} stroke={colour} strokeWidth={1.5 * unit} />
              </>
            )}
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6 * unit} textAnchor="middle" fontSize={12 * unit} fill={colour} stroke="#ffffff" strokeWidth={3.5 * unit} paintOrder="stroke">
              {Math.round(g.gap ?? 0)} cm
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** What the chair colours mean, counted, with the dashed outline and dietary dots (spec 57 A.2). */
function CanvasLegend() {
  const { colourBy, data, assignments, guestById } = useSeating();
  const [open, setOpen] = useState(false);
  const seated = assignments.map((a) => guestById.get(a.guestId)).filter((g): g is NonNullable<typeof g> => Boolean(g));
  const rows = colourCounts(seated, colourBy, data.colour);
  const declined = declinedSeats(data.guests, assignments).length;
  const allergy = seated.filter((g) => g.dietaryNeeds.some((n) => n.isAllergy)).length;
  const preference = seated.filter((g) => g.dietaryNeeds.length > 0 && !g.dietaryNeeds.some((n) => n.isAllergy)).length;
  if (rows.length === 0 && declined === 0 && allergy === 0 && preference === 0) return null;
  // One small chip until asked for (spec 59 A.2): the key is rarely the thing being looked at.
  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1">
      <button type="button" aria-expanded={open} className="rounded border border-line bg-white/90 px-2 py-0.5 text-[0.7rem] shadow-sm hover:bg-white" onClick={() => setOpen((o) => !o)}>
        Key {open ? "▴" : "▾"}
      </button>
      {open ? (
        <div className="pointer-events-none max-w-[14rem] space-y-0.5 rounded border border-line bg-white/90 px-2 py-1.5 text-[0.7rem] leading-snug shadow-sm" aria-label="Legend">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.colour }} />
              <span className="truncate">{r.label}</span>
              <span className="ml-auto text-muted">{r.count}</span>
            </div>
          ))}
          {declined > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-dashed border-orange-600" />
              <span>Declined, in a seat</span>
              <span className="ml-auto text-muted">{declined}</span>
            </div>
          ) : null}
          {allergy > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#c81e1e]" />
              <span>Allergy</span>
              <span className="ml-auto text-muted">{allergy}</span>
            </div>
          ) : null}
          {preference > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#d97706]" />
              <span>Dietary preference</span>
              <span className="ml-auto text-muted">{preference}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Grid({ roomW, roomD, strokeWidth }: { roomW: number; roomD: number; strokeWidth: number }) {
  const lines = [];
  for (let x = 100; x < roomW; x += 100) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={roomD} />);
  for (let y = 100; y < roomD; y += 100) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={roomW} y2={y} />);
  return (
    <g stroke="#e6e2dc" strokeWidth={strokeWidth}>
      {lines}
    </g>
  );
}

const TableShape = memo(TableShapeBase);

function TableShapeBase({
  table,
  itemKey,
  selected,
  hovered,
  cursor,
  rings,
  fontSize,
  detail,
  onPointerDown,
  onHover,
}: {
  table: SeatingTable;
  itemKey: string;
  selected: boolean;
  hovered: boolean;
  cursor: string;
  rings: boolean;
  fontSize: number;
  detail: ChairDetail;
  onPointerDown: (e: RPointerEvent, key: string) => void;
  onHover: (key: string | null) => void;
}) {
  const { occupancy, warningsByTable, assignments, guestById, colourBy, data, held, settings } = useSeating();
  const clearance = settings.walkway.comfortable;
  const { setNodeRef, isOver } = useDroppable({ id: `table:${table.id}` });
  const { length, width } = tableSize(table);
  const occ = occupancy.get(table.id)!;
  const warn = (warningsByTable.get(table.id) ?? []).some((w) => w.severity === "warning");
  const seats = seatPositions({ ...table, pos_x_cm: 0, pos_y_cm: 0, rotation_deg: 0 }) ?? [];
  const byChair = new Map(
    assignments.filter((a) => a.tableId === table.id && a.seatIndex !== null).map((a) => [a.seatIndex!, a.guestId]),
  );
  const stroke = selected ? "#1a1a1a" : hovered ? "#b0532b" : warn ? "#b45309" : isOver ? "#7c5c3e" : "#8a8580";
  // Big enough to read zoomed out, never wider than the table it names.
  const fs = Math.min(fontSize, Math.max(length, width) / (0.62 * Math.max(4, table.label.length)));

  return (
    <g
      ref={setNodeRef as unknown as React.Ref<SVGGElement>}
      transform={`translate(${table.pos_x_cm} ${table.pos_y_cm}) rotate(${table.rotation_deg})`}
      data-key={itemKey}
      onPointerDown={(e) => onPointerDown(e, itemKey)}
      onPointerEnter={() => onHover(itemKey)}
      onPointerLeave={() => onHover(null)}
      style={{ cursor }}
      role="button"
      aria-label={`${table.label}, ${occ.chairsTaken} of ${table.capacity}`}
    >
      {rings ? (
        table.shape === "round" ? (
          <circle r={length / 2 + clearance} fill="none" stroke="#c9c4bb" strokeDasharray="12 10" strokeWidth={3} />
        ) : (
          <rect
            x={-length / 2 - clearance}
            y={-width / 2 - clearance}
            width={length + 2 * clearance}
            height={width + 2 * clearance}
            fill="none"
            stroke="#c9c4bb"
            strokeDasharray="12 10"
            strokeWidth={3}
          />
        )
      ) : null}
      {table.shape === "rows" ? (
        <g>
          {rowBlocks(table).map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={isOver ? "#efe6da" : "#f3efe8"} stroke={stroke} strokeWidth={selected ? 5 : 3} />
          ))}
          {/* An invisible box over the whole block, so it is one thing to pick up. */}
          <rect x={-length / 2} y={-width / 2} width={length} height={width} fill="transparent" />
        </g>
      ) : null}
      {seats.map((p, i) => {
        const gid = byChair.get(i);
        const g = gid ? guestById.get(gid) : undefined;
        const c = g ? guestColour(g, colourBy, data.colour)?.colour ?? "#6b6560" : "#ffffff";
        const marks = g ? chairMarks(g) : null;
        const reach = Math.hypot(p.x, p.y) || 1;
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={20}
              fill={c}
              stroke={marks?.declined ? "#c2410c" : "#8a8580"}
              strokeWidth={marks?.declined ? 3 : 2}
              strokeDasharray={marks?.declined ? "6 4" : undefined}
            />
            {g && detail !== "dot" ? (
              <g transform={`translate(${p.x} ${p.y}) rotate(${-table.rotation_deg})`} style={{ pointerEvents: "none" }}>
                <text textAnchor="middle" dominantBaseline="central" fontSize={15} fontWeight={600} fill={readableText(c)}>
                  {initials(g)}
                </text>
                {detail === "name" ? (
                  <text
                    x={(p.x / reach) * 36}
                    y={(p.y / reach) * 36}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={13}
                    fill="#1a1a1a"
                    stroke="#ffffff"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {chairFirstName(g)}
                  </text>
                ) : null}
              </g>
            ) : null}
            {marks?.dietaryDot ? <circle cx={p.x + 14} cy={p.y - 14} r={6} fill={marks.dietaryDot === "allergy" ? "#c81e1e" : marks.dietaryDot === "preference" ? "#d97706" : "#8a8580"} stroke="#ffffff" strokeWidth={1.5} style={{ pointerEvents: "none" }} /> : null}
          </g>
        );
      })}
      {table.shape === "rows" ? null : table.shape === "banquet" ? (
        <g>
          {banquetPieces(table.segments, table.capacity).map((poly, i) => (
            <polygon key={i} points={poly.map((p) => `${p.x},${p.y}`).join(" ")} fill={isOver ? "#efe6da" : "#f3efe8"} stroke={stroke} strokeWidth={selected ? 5 : 3} />
          ))}
        </g>
      ) : table.shape === "round" ? (
        <circle r={length / 2} fill={isOver ? "#efe6da" : "#f3efe8"} stroke={stroke} strokeWidth={selected ? 6 : 4} />
      ) : table.shape === "serpentine" ? (
        <path d={serpentinePath(length / 2, width / 2)} fill={isOver ? "#efe6da" : "#f3efe8"} stroke={stroke} strokeWidth={selected ? 6 : 4} />
      ) : table.shape === "oval" ? (
        <ellipse rx={length / 2} ry={width / 2} fill={isOver ? "#efe6da" : "#f3efe8"} stroke={stroke} strokeWidth={selected ? 6 : 4} />
      ) : table.shape === "half_moon" ? (
        <path
          d={`M ${-length / 2} ${width / 2} A ${length / 2} ${length / 2} 0 0 1 ${length / 2} ${width / 2} Z`}
          fill={isOver ? "#efe6da" : "#f3efe8"}
          stroke={stroke}
          strokeWidth={selected ? 6 : 4}
        />
      ) : (
        <rect
          x={-length / 2}
          y={-width / 2}
          width={length}
          height={width}
          fill={isOver ? "#efe6da" : "#f3efe8"}
          stroke={stroke}
          strokeWidth={selected ? 6 : 4}
        />
      )}
      <g transform={`rotate(${-table.rotation_deg})`} style={{ pointerEvents: "none" }}>
        <text textAnchor="middle" y={-fs * 0.15} fontSize={fs} fill="#1a1a1a">
          {table.label}
        </text>
        <text
          textAnchor="middle"
          y={fs * 1.05}
          fontSize={fs * 0.8}
          fill={occ.chairsTaken > table.capacity ? "#b91c1c" : "#6b6560"}
        >
          {occ.chairsTaken}/{table.capacity}
        </text>
      </g>
    </g>
  );
}

const FIXTURE_LOOK: Record<string, { fill: string; stroke?: string; round?: boolean }> = {
  dance_floor: { fill: "#e9e1f2" },
  floral_arch: { fill: "#e3efd9" },
  garland: { fill: "#e3efd9" },
  aisle_flowers: { fill: "#f6dce6", round: true },
  candles: { fill: "#f8ecc4" },
  plant: { fill: "#d6e8c9", round: true },
  sign: { fill: "#efe6d6" },
  lantern: { fill: "#f8ecc4", round: true },
  drape: { fill: "#efe8f2" },
  tree: { fill: "#cfe3c4", round: true },
  path: { fill: "#e4e0d8" },
  pool: { fill: "#cde6f3" },
  garden_bed: { fill: "#e1d3bf" },
  slope: { fill: "#e8e3d3" },
  marquee: { fill: "#fbfaf6" },
};

const FixtureShape = memo(FixtureShapeBase);

function FixtureShapeBase({
  fixture,
  itemKey,
  selected,
  hovered,
  cursor,
  fontSize,
  onPointerDown,
  onHover,
}: {
  fixture: SeatingFixture;
  itemKey: string;
  selected: boolean;
  hovered: boolean;
  cursor: string;
  fontSize: number;
  onPointerDown: (e: RPointerEvent, key: string) => void;
  onHover: (key: string | null) => void;
}) {
  const { data } = useSeating();
  const custom = fixture.custom_item_id ? data.customItems.find((c) => c.id === fixture.custom_item_id) : undefined;
  const marquee = fixture.marquee_id ? data.marquees.find((m) => m.id === fixture.marquee_id) : undefined;
  const label = fixture.label ?? custom?.name ?? FIXTURE_DEFAULTS[fixture.kind]?.label ?? fixture.kind;
  const look = FIXTURE_LOOK[fixture.kind] ?? { fill: "#ece9e3" };
  const round = custom ? custom.shape === "round" : look.round;
  const fill = custom?.colour ?? look.fill;
  const stroke = selected ? "#1a1a1a" : hovered ? "#b0532b" : "#a39d94";
  const w = fixture.width_cm;
  const d = fixture.depth_cm;
  return (
    <g
      transform={`translate(${fixture.pos_x_cm} ${fixture.pos_y_cm}) rotate(${fixture.rotation_deg})`}
      data-key={itemKey}
      onPointerDown={(e) => onPointerDown(e, itemKey)}
      onPointerEnter={() => onHover(itemKey)}
      onPointerLeave={() => onHover(null)}
      style={{ cursor }}
      role="button"
      aria-label={fixture.quantity > 1 ? `${label}, ${fixture.quantity}` : label}
    >
      {marquee ? (
        <MarqueeBody width={w} length={d} template={marquee} fill={fill} stroke={stroke} strokeWidth={selected ? 6 : 3} />
      ) : round ? (
        <ellipse rx={w / 2} ry={d / 2} fill={fill} stroke={stroke} strokeWidth={selected ? 6 : 3} />
      ) : (
        <rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          fill={fill}
          stroke={stroke}
          strokeWidth={selected ? 6 : 3}
          strokeDasharray={fixture.kind === "entrance" ? "14 8" : fixture.kind === "slope" ? "10 6" : undefined}
        />
      )}
      {fixture.kind === "slope" ? (
        <path d={`M ${-w / 4} ${-d / 6} L ${w / 4} ${-d / 6} L ${w / 4} ${-d / 3} L ${w / 2.4} 0 L ${w / 4} ${d / 3} L ${w / 4} ${d / 6} L ${-w / 4} ${d / 6} Z`} fill="#b9ad8e" opacity={0.5} style={{ pointerEvents: "none" }} />
      ) : null}
      <text
        transform={`rotate(${-fixture.rotation_deg})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize * 0.85}
        fill="#6b6560"
        style={{ pointerEvents: "none" }}
      >
        {label}
        {fixture.quantity > 1 ? ` ×${fixture.quantity}` : ""}
      </text>
    </g>
  );
}

/** A hired marquee: its outline, rounded at the ends if it is, and its poles down the sides (and the middle). */
function MarqueeBody({
  width,
  length,
  template,
  fill,
  stroke,
  strokeWidth,
}: {
  width: number;
  length: number;
  template: { pole_spacing_cm: number | null; middle_poles: boolean; rounded_ends: boolean };
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const hw = width / 2;
  const hl = length / 2;
  const r = Math.min(hw, hl);
  const outline = template.rounded_ends
    ? `M ${-hw} ${-hl + r} A ${hw} ${r} 0 0 1 ${hw} ${-hl + r} L ${hw} ${hl - r} A ${hw} ${r} 0 0 1 ${-hw} ${hl - r} Z`
    : `M ${-hw} ${-hl} H ${hw} V ${hl} H ${-hw} Z`;
  const spacing = template.pole_spacing_cm;
  const rows = spacing ? Math.max(1, Math.floor(length / spacing)) : 0;
  const poles: { x: number; y: number }[] = [];
  if (spacing) {
    for (let i = 0; i <= rows; i++) {
      const y = -hl + (length * i) / rows;
      poles.push({ x: -hw, y }, { x: hw, y });
      if (template.middle_poles) poles.push({ x: 0, y });
    }
  }
  return (
    <g>
      <path d={outline} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {poles.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={Math.max(6, width / 80)} fill="#6b6560" />
      ))}
    </g>
  );
}

function RotateHandle({
  item,
  r,
  onPointerDown,
}: {
  item: SeatingTable | SeatingFixture;
  r: number;
  onPointerDown: (e: RPointerEvent) => void;
}) {
  const reach =
    "capacity" in item
      ? Math.max(tableSize(item).length, tableSize(item).width) / 2 + 80
      : Math.max(item.width_cm, item.depth_cm) / 2 + 60;
  const cx = item.pos_x_cm!;
  const cy = item.pos_y_cm!;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${item.rotation_deg})`}>
      <line x1={0} y1={0} x2={0} y2={-reach} stroke="#1a1a1a" strokeWidth={r / 6} style={{ pointerEvents: "none" }} />
      <circle
        cx={0}
        cy={-reach}
        r={r}
        fill="#ffffff"
        stroke="#1a1a1a"
        strokeWidth={r / 4}
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown}
        aria-label="Turn"
      />
    </g>
  );
}

function RoomStrip({
  roomW,
  roomD,
  snapOn,
  setSnapOn,
  rings,
  setRings,
  calibrating,
  setCalibrating,
  editable,
  onFit,
}: {
  editable: boolean;
  roomW: number;
  roomD: number;
  snapOn: boolean;
  setSnapOn: (v: boolean) => void;
  rings: boolean;
  setRings: (v: boolean) => void;
  calibrating: boolean;
  setCalibrating: (v: boolean) => void;
  onFit: () => void;
}) {
  const { data } = useSeating();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <button type="button" className="btn py-1" onClick={onFit}>
        Fit room
      </button>
      {editable ? (
        <label className="flex items-center gap-1.5" title="Snaps to neighbours' edges and centres, and to a 25 cm grid. Hold Alt during a drag to turn it off.">
          <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> Snap to neighbours and 25 cm
        </label>
      ) : null}
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={rings} onChange={(e) => setRings(e.target.checked)} /> Space around tables
      </label>
      {data.plan?.background_path ? (
        <button type="button" className={`btn py-1 ${calibrating ? "ring-2 ring-accent" : ""}`} onClick={() => setCalibrating(!calibrating)}>
          {calibrating ? "Cancel measuring" : data.plan.calibrated ? "Re-measure the plan" : "Set the scale"}
        </button>
      ) : null}
      <span className="ml-auto text-xs text-muted">
        Room {(roomW / 100).toLocaleString("en-NZ")} × {(roomD / 100).toLocaleString("en-NZ")} m
        {data.plan?.background_path ? (data.plan.calibrated ? " · to scale" : " · by eye") : ""}
      </span>
    </div>
  );
}

function SelectedTablePanel({ table, onUnplace, editable, onRepeat }: { table: SeatingTable; onUnplace: () => void; editable: boolean; onRepeat: (count: number, gap: number, dir: "across" | "down") => void }) {
  const { eventId, openTable, refresh, setError, setTables, track } = useSeating();
  const [, startTransition] = useTransition();
  return (
    <div className="card flex flex-wrap items-center gap-2 p-2 text-sm">
      <strong>{table.label}</strong>
      <span className="text-muted">Turned {table.rotation_deg}°. Arrow keys nudge it, R turns it.</span>
      <button type="button" className="btn ml-auto py-1" onClick={() => openTable(table.id)}>
        Open table
      </button>
      <button
        type="button"
        className="btn py-1"
        onClick={() => {
          setTables((ts) => ts.map((t) => (t.id === table.id ? { ...t, pos_x_cm: null, pos_y_cm: null } : t)));
          onUnplace();
          startTransition(async () => {
            const r = await track("Took a table out of the room", () => moveSeatingTable(table.id, eventId, { x: null, y: null }));
            if (!r.ok) setError(r.error);
            refresh();
          });
        }}
      >
        Take out of the room
      </button>
      {editable ? <RepeatForm onRepeat={onRepeat} /> : null}
    </div>
  );
}

/** Repeat (spec 59 Part C): N more of the selected item at a gap, across or down: one write, one undo step. */
function RepeatForm({ onRepeat }: { onRepeat: (count: number, gap: number, dir: "across" | "down") => void }) {
  const [count, setCount] = useState("3");
  const [gap, setGap] = useState("40");
  const [dir, setDir] = useState<"across" | "down">("across");
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v.replace(",", "."))) && v.trim() !== "" ? Number(v.replace(",", ".")) : fallback);
  return (
    <div className="flex w-full flex-wrap items-end gap-2 border-t border-line pt-2" role="group" aria-label="Repeat">
      <label>
        <span className="mb-1 block text-xs text-muted">Repeat it</span>
        <input className="field w-16" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} aria-label="How many more" />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Gap (cm)</span>
        <input className="field w-16" inputMode="numeric" value={gap} onChange={(e) => setGap(e.target.value)} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Direction</span>
        <select className="field" value={dir} onChange={(e) => setDir(e.target.value as "across" | "down")}>
          <option value="across">Across</option>
          <option value="down">Down</option>
        </select>
      </label>
      <button type="button" className="btn" onClick={() => onRepeat(Math.max(1, Math.round(num(count, 1))), Math.max(0, num(gap, 0)), dir)}>
        Repeat
      </button>
    </div>
  );
}

function SelectedFixturePanel({ fixture, onDone, editable, onRepeat }: { fixture: SeatingFixture; onDone: () => void; editable: boolean; onRepeat: (count: number, gap: number, dir: "across" | "down") => void }) {
  const { eventId, data, refresh, setError, track } = useSeating();
  const [, startTransition] = useTransition();
  const [label, setLabel] = useState(fixture.label ?? "");
  const [w, setW] = useState(fixture.width_cm);
  const [d, setD] = useState(fixture.depth_cm);
  const [quantity, setQuantity] = useState(fixture.quantity);
  const [vendor, setVendor] = useState(fixture.vendor_id ?? "");
  useEffect(() => {
    setLabel(fixture.label ?? "");
    setW(fixture.width_cm);
    setD(fixture.depth_cm);
    setQuantity(fixture.quantity);
    setVendor(fixture.vendor_id ?? "");
  }, [fixture.id, fixture.label, fixture.width_cm, fixture.depth_cm, fixture.quantity, fixture.vendor_id]);
  // Décor carries a quantity ("aisle flowers × 12") and a supplier, which feed the florist's and hire company's totals.
  const decor = carriesQuantity(fixture.kind) || fixture.kind === "custom";
  if (!editable) return null;

  return (
    <>
    <form
      className="card flex flex-wrap items-end gap-2 p-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await track("Edited an item in the room", () => updateSeatingFixture(fixture.id, eventId, { label: label || null, width_cm: w, depth_cm: d, ...(decor ? { quantity, vendor_id: vendor || null } : {}) }));
          if (!r.ok) setError(r.error);
          refresh();
        });
      }}
    >
      <label>
        <span className="mb-1 block text-xs text-muted">Label</span>
        <input
          className="field"
          value={label}
          placeholder={FIXTURE_DEFAULTS[fixture.kind]?.label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Width (cm)</span>
        <input className="field w-24" type="number" min={20} max={5000} value={w} onChange={(e) => setW(Number(e.target.value))} />
      </label>
      <label>
        <span className="mb-1 block text-xs text-muted">Depth (cm)</span>
        <input className="field w-24" type="number" min={20} max={5000} value={d} onChange={(e) => setD(Number(e.target.value))} />
      </label>
      {decor ? (
        <>
          <label>
            <span className="mb-1 block text-xs text-muted">Quantity</span>
            <input className="field w-20" type="number" min={1} max={9999} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Supplier</span>
            <select className="field" value={vendor} onChange={(e) => setVendor(e.target.value)}>
              <option value="">None</option>
              {data.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <button type="submit" className="btn">
        Save
      </button>
      <button
        type="button"
        className="btn text-red-700"
        onClick={() => {
          onDone();
          startTransition(async () => {
            const r = await track("Deleted an item in the room", () => deleteSeatingFixture(fixture.id, eventId));
            if (!r.ok) setError(r.error);
            refresh();
          });
        }}
      >
        Remove
      </button>
        </form>
    <div className="card p-2 text-sm">
      <RepeatForm onRepeat={onRepeat} />
    </div>
    </>
  );
}

function AddFixture({ view, roomW, roomD }: { view: View; roomW: number; roomD: number }) {
  const { eventId, layoutId, spaceId, refresh, setError, track } = useSeating();
  const [kind, setKind] = useState<SeatingFixtureKind>("dance_floor");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="card flex flex-wrap items-end gap-2 p-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const size = FIXTURE_DEFAULTS[kind]!;
        startTransition(async () => {
          const r = await track("Added an item to the room", () =>
            createSeatingFixture(eventId, {
              kind,
              pos_x_cm: clamp(snap(view.x + view.w / 2, GRID_CM), 0, roomW),
              pos_y_cm: clamp(snap(view.y + view.h / 2, GRID_CM), 0, roomD),
              width_cm: size.width,
              depth_cm: size.depth,
            }, layoutId, spaceId),
          );
          if (!r.ok) setError(r.error);
          refresh();
        });
      }}
    >
      <label>
        <span className="mb-1 block text-xs text-muted">Add to the room</span>
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as SeatingFixtureKind)}>
          {Object.entries(FIXTURE_DEFAULTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn" disabled={pending}>
        Add
      </button>
    </form>
  );
}

/** Room size, and the venue's own floor plan to draw over (§C.3). */
export function RoomSettings() {
  const { eventId, layoutId, spaceId, data, refresh, setError, track } = useSeating();
  const plan = data.plan;
  const [w, setW] = useState(String((plan?.room_width_cm ?? 2000) / 100));
  const [d, setD] = useState(String((plan?.room_depth_cm ?? 1500) / 100));
  const { busy, upload, pdf, takePdfPage, cancelPdf } = useBackgroundUpload();
  const [, startTransition] = useTransition();
  useEffect(() => {
    setW(String((plan?.room_width_cm ?? 2000) / 100));
    setD(String((plan?.room_depth_cm ?? 1500) / 100));
  }, [plan?.room_width_cm, plan?.room_depth_cm]);

  return (
    <details className="card p-3 text-sm">
      <summary className="cursor-pointer font-medium">The room</summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await track("Changed the room size", () =>
              updateSeatingRoom(eventId, {
                room_width_cm: Math.round(Number(w) * 100),
                room_depth_cm: Math.round(Number(d) * 100),
              }, layoutId, spaceId),
            );
            if (!r.ok) setError(r.error);
            refresh();
          });
        }}
      >
        <label>
          <span className="mb-1 block text-xs text-muted">Width (m)</span>
          <input className="field w-24" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Depth (m)</span>
          <input className="field w-24" inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} />
        </label>
        <button type="submit" className="btn">
          Set size
        </button>
      </form>

      {pdf ? <PdfPagePicker plan={pdf} onUse={(page) => void takePdfPage(page)} onCancel={cancelPdf} /> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="btn cursor-pointer">
          {plan?.background_path ? "Replace the venue's floor plan" : "Upload the venue's floor plan"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {plan?.background_path ? (
          <button
            type="button"
            className="btn text-red-700"
            onClick={() =>
              startTransition(async () => {
                const r = await removeSeatingBackground(eventId, layoutId, spaceId);
                if (!r.ok) setError(r.error);
                refresh();
              })
            }
          >
            Remove it
          </button>
        ) : null}
        {busy ? <span className="text-muted">{busy}</span> : null}
      </div>
      <p className="mt-2 text-xs text-muted">
        A photo or screenshot of the venue&rsquo;s plan works. Then &ldquo;Set the scale&rdquo; above: tap two points and say
        how far apart they are, and tables are drawn at their real size against it.
      </p>
    </details>
  );
}
