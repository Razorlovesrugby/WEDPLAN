"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { saveSeatingDrawing } from "@/server/actions/seating-spaces";
import {
  LIMITS,
  bulgeFromPoint,
  constrainAngle,
  drawingIds,
  emptyDrawing,
  formatLength,
  nearestOnWall,
  newDrawingId,
  parseDrawing,
  removeWall,
  snapCorner,
  splitWall,
  wallLength,
  wallRadius,
  type Area,
  type Drawing,
  type Pt,
  type Wall,
} from "@/lib/seating/drawing";
import { polygonDistance, tablePolygon, type Point } from "@/lib/seating/geometry";
import { classifyWalkway, parseSettings, type Walkway } from "@/lib/seating/plan-settings";
import { MARKER_LABEL, MARKER_SIZE, OPENING_LABEL, OPENING_WIDTH, SELECT, toolAfterPlacing } from "@/lib/seating/tools";
import { useSeating } from "./seating-state";
import { VenueLayer, WallPreview, type DrawingPick } from "./venue-layer";
import { NotesLayer } from "./notes-layer";
import { useLayerLocks } from "./canvas-prefs";
import { addressee, newNoteAt, numberNotes } from "@/lib/seating/notes";

const CORNER_SNAP_CM = 20;
const OPENING_REACH_CM = 60;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const WALKWAY_COLOUR: Record<Walkway, string> = { comfortable: "#2f7d4f", tight: "#c27c0e", too_tight: "#b91c1c" };
const WALKWAY_WORD: Record<Walkway, string> = { comfortable: "comfortable", tight: "tight", too_tight: "too tight" };

type Measure = { a: Pt; b: Pt | null };

/**
 * The venue-drawing tools of the Room view (spec 57 Part B). Owns the shown
 * space's drawing (kept in step with the server's), what the current tool has
 * half-drawn, and the selection; the Room view gives it pointer events and
 * draws what it hands back. Every finished edit is one undoable write.
 */
export function useDrawingTools({
  toRoom,
  snapOn,
  roomW,
  roomD,
  unit,
}: {
  toRoom: (clientX: number, clientY: number) => Point;
  snapOn: boolean;
  roomW: number;
  roomD: number;
  /** Room centimetres per screen pixel. */
  unit: number;
}) {
  const { eventId, layoutId, spaceId, data, tables, tool, setTool, track, refresh, setError, show } = useSeating();
  const [layerLocks] = useLayerLocks();
  const [, startTransition] = useTransition();
  const space = data.spaces.find((s) => s.id === spaceId) ?? data.spaces[0] ?? null;
  const hasImage = Boolean(space?.background_path);

  const serverKey = JSON.stringify(space?.drawing ?? {});
  const stored = useMemo(() => {
    const r = parseDrawing(space?.drawing);
    return r.ok ? r.drawing : emptyDrawing();
    // The server's copy changes when its text does, not each time it is sent again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);
  const [drawing, setDrawing] = useState<Drawing>(stored);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const storedRef = useRef(stored);
  storedRef.current = stored;
  useEffect(() => setDrawing(stored), [stored]);

  const [selected, setSelected] = useState<DrawingPick | null>(null);
  const [chain, setChain] = useState<Pt[]>([]);
  const [arc, setArc] = useState<{ a: Pt; b: Pt | null }>({ a: [0, 0], b: null });
  const [arcOn, setArcOn] = useState(false);
  const [areaPts, setAreaPts] = useState<Pt[]>([]);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);

  // Changing tool abandons what the last one had half done.
  useEffect(() => {
    setChain([]);
    setArcOn(false);
    setAreaPts([]);
    if (tool.kind !== "measure") setMeasure(null);
    if (tool.kind !== "select") setSelected(null);
  }, [tool]);
  // And so does moving to another room.
  useEffect(() => setSelected(null), [spaceId]);

  const limitX = hasImage ? roomW : 20000;
  const limitY = hasImage ? roomD : 20000;

  const commit = useCallback(
    (next: Drawing, label: string) => {
      setDrawing(next);
      if (!space) return;
      startTransition(async () => {
        const r = await track(label, () => saveSeatingDrawing(eventId, space.id, next, layoutId));
        if (!r.ok) {
          setError(r.error);
          setDrawing(storedRef.current);
        }
        refresh();
      });
    },
    [space, track, eventId, layoutId, setError, refresh],
  );

  const grid = snapOn ? 25 : 0;
  const snapPoint = (p: Point, shift: boolean, from?: Pt): Pt => {
    let q = snapCorner([p.x, p.y], drawingRef.current.walls, grid, CORNER_SNAP_CM);
    if (shift && from) q = constrainAngle(from, q);
    return [clamp(q[0], 0, limitX), clamp(q[1], 0, limitY)];
  };
  const freshId = (prefix: string) => newDrawingId(prefix, drawingIds(drawingRef.current));

  // ---- finishing what a tool was drawing ---------------------------------
  const finishChain = (points: Pt[], closed: boolean) => {
    const pts = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1]) >= 5);
    const segments: [Pt, Pt][] = [];
    for (let i = 0; i + 1 < pts.length; i++) segments.push([pts[i]!, pts[i + 1]!]);
    if (closed && pts.length >= 3) segments.push([pts[pts.length - 1]!, pts[0]!]);
    setChain([]);
    if (segments.length === 0) return;
    const taken = drawingIds(drawingRef.current);
    const walls: Wall[] = segments.map(([a, b]) => {
      const id = newDrawingId("w", taken);
      taken.add(id);
      return { id, a, b, thick: LIMITS.thick.default, bulge: 0 };
    });
    if (drawingRef.current.walls.length + walls.length > LIMITS.walls) {
      setError(`A space holds up to ${LIMITS.walls} walls.`);
      return;
    }
    commit({ ...drawingRef.current, walls: [...drawingRef.current.walls, ...walls] }, walls.length === 1 ? "Drew a wall" : `Drew ${walls.length} walls`);
  };

  const finishArea = (points: Pt[]) => {
    setAreaPts([]);
    if (points.length < 3) return;
    const name = window.prompt("Name this area (the lawn, the bar, the dance floor)", "")?.trim();
    if (!name) return;
    const outdoor = window.confirm("Is it outdoors? OK for outdoors (hatched), Cancel for indoors.");
    const area: Area = { id: freshId("a"), name: name.slice(0, LIMITS.areaName), points, tint: null, outdoor };
    commit({ ...drawingRef.current, areas: [...drawingRef.current.areas, area] }, `Drew the area “${area.name}”`);
  };

  // ---- the pointer ---------------------------------------------------------
  const onCanvasClick = (p: Point, e: { shiftKey: boolean }): boolean => {
    switch (tool.kind) {
      case "wall": {
        const last = chain[chain.length - 1];
        const q = snapPoint(p, e.shiftKey, last);
        if (!last) {
          setChain([q]);
          return true;
        }
        const first = chain[0]!;
        if (chain.length >= 3 && Math.hypot(q[0] - first[0], q[1] - first[1]) <= CORNER_SNAP_CM) {
          finishChain(chain, true);
          return true;
        }
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 5) return true;
        setChain([...chain, q]);
        return true;
      }
      case "arc": {
        if (!arcOn) {
          setArc({ a: snapPoint(p, false), b: null });
          setArcOn(true);
        } else if (!arc.b) {
          const b = snapPoint(p, e.shiftKey, arc.a);
          if (Math.hypot(b[0] - arc.a[0], b[1] - arc.a[1]) >= 20) setArc({ a: arc.a, b });
        } else {
          const bulge = bulgeFromPoint(arc.a, arc.b, [p.x, p.y]);
          const wall: Wall = { id: freshId("w"), a: arc.a, b: arc.b, thick: LIMITS.thick.default, bulge };
          setArcOn(false);
          commit({ ...drawingRef.current, walls: [...drawingRef.current.walls, wall] }, "Drew a curved wall");
        }
        return true;
      }
      case "area": {
        const q = snapPoint(p, e.shiftKey, areaPts[areaPts.length - 1]);
        if (areaPts.length >= 3 && Math.hypot(q[0] - areaPts[0]![0], q[1] - areaPts[0]![1]) <= CORNER_SNAP_CM) finishArea(areaPts);
        else if (areaPts.length < LIMITS.areaPoints) setAreaPts([...areaPts, q]);
        return true;
      }
      case "note": {
        if (drawingRef.current.notes.length >= LIMITS.notes) {
          setError(`A space holds up to ${LIMITS.notes} notes.`);
          return true;
        }
        // Put on a table, the note is pinned to it and moves with it; on empty floor it stays where it is.
        const note = newNoteAt(p, freshId("n"), tables, spaceId);
        commit({ ...drawingRef.current, notes: [...drawingRef.current.notes, note] }, "Added a note");
        setSelected({ kind: "note", id: note.id });
        setTool(toolAfterPlacing(tool));
        return true;
      }
      case "text": {
        const text = window.prompt("What should it say?", "")?.trim();
        if (!text) return true;
        const at = snapPoint(p, false);
        commit(
          { ...drawingRef.current, labels: [...drawingRef.current.labels, { id: freshId("l"), text: text.slice(0, LIMITS.labelText), x: at[0], y: at[1], size: LIMITS.labelSize.default }] },
          "Added some text",
        );
        setTool(toolAfterPlacing(tool));
        return true;
      }
      case "measure": {
        if (!measure || measure.b) setMeasure({ a: snapPoint(p, false), b: null });
        else setMeasure({ a: measure.a, b: snapPoint(p, e.shiftKey, measure.a) });
        return true;
      }
      case "opening": {
        const hit = nearestOnWall(drawingRef.current.walls, [p.x, p.y], OPENING_REACH_CM);
        if (!hit) {
          setError("Click on a wall to put it there. Draw the walls first.");
          return true;
        }
        if (drawingRef.current.openings.length >= LIMITS.openings) {
          setError(`A space holds up to ${LIMITS.openings} doors and windows.`);
          return true;
        }
        const id = freshId("o");
        commit(
          {
            ...drawingRef.current,
            openings: [...drawingRef.current.openings, { id, kind: tool.opening, wall: hit.wall.id, at: Math.round(hit.t * 1000) / 1000, width: OPENING_WIDTH[tool.opening], swing: "in", hinge: "a" }],
          },
          `Added a ${OPENING_LABEL[tool.opening].toLowerCase()}`,
        );
        setTool(SELECT);
        setSelected({ kind: "opening", id });
        return true;
      }
      case "marker": {
        const at = snapPoint(p, false);
        const size = MARKER_SIZE[tool.marker];
        const id = freshId("m");
        commit(
          { ...drawingRef.current, markers: [...drawingRef.current.markers, { id, kind: tool.marker, x: at[0], y: at[1], w: size.w, d: size.d, rot: 0 }] },
          `Added ${MARKER_LABEL[tool.marker].toLowerCase()}`,
        );
        setTool(SELECT);
        setSelected({ kind: "marker", id });
        return true;
      }
      default:
        return false;
    }
  };

  const onCanvasMove = (p: Point, shift: boolean) => {
    const live = (tool.kind === "wall" && chain.length > 0) || (tool.kind === "arc" && arcOn) || (tool.kind === "area" && areaPts.length > 0) || (tool.kind === "measure" && measure && !measure.b);
    if (!live) return;
    const from = tool.kind === "wall" ? chain[chain.length - 1] : tool.kind === "area" ? areaPts[areaPts.length - 1] : tool.kind === "measure" ? measure?.a : tool.kind === "arc" ? arc.a : undefined;
    setCursor(tool.kind === "arc" && arc.b ? [Math.round(p.x), Math.round(p.y)] : snapPoint(p, shift, from));
  };

  const onDoubleClick = (): boolean => {
    if (tool.kind === "wall" && chain.length >= 2) {
      finishChain(chain, false);
      return true;
    }
    if (tool.kind === "area" && areaPts.length >= 3) {
      finishArea(areaPts);
      return true;
    }
    return false;
  };

  const remove = (pick: DrawingPick) => {
    const d = drawingRef.current;
    setSelected(null);
    if (pick.kind === "wall") commit(removeWall(d, pick.id), "Deleted a wall");
    else if (pick.kind === "opening") commit({ ...d, openings: d.openings.filter((o) => o.id !== pick.id) }, "Deleted a door or window");
    else if (pick.kind === "marker") commit({ ...d, markers: d.markers.filter((m) => m.id !== pick.id) }, "Deleted a marker");
    else if (pick.kind === "area") commit({ ...d, areas: d.areas.filter((a) => a.id !== pick.id) }, "Deleted an area");
    else if (pick.kind === "label") commit({ ...d, labels: d.labels.filter((l) => l.id !== pick.id) }, "Deleted some text");
    else if (pick.kind === "note") commit({ ...d, notes: d.notes.filter((n) => n.id !== pick.id) }, "Deleted a note");
    else commit({ ...d, dimensions: d.dimensions.filter((x) => x.id !== pick.id) }, "Deleted a measurement");
  };

  const keepMeasure = () => {
    if (!measure?.b) return;
    const d = drawingRef.current;
    if (d.dimensions.length >= LIMITS.dimensions) return setError(`A space holds up to ${LIMITS.dimensions} kept measurements.`);
    commit({ ...d, dimensions: [...d.dimensions, { id: freshId("k"), a: measure.a, b: measure.b }] }, "Kept a measurement");
    setMeasure(null);
  };

  /** Keys the drawing tools own while the canvas has focus. True when one was used. */
  const onKey = (e: RKeyboardEvent): boolean => {
    if (e.key === "Escape") {
      if (chain.length || arcOn || areaPts.length || measure) {
        setChain([]);
        setArcOn(false);
        setAreaPts([]);
        setMeasure(null);
        return true;
      }
      if (tool.kind !== "select") {
        setTool(SELECT);
        return true;
      }
      if (selected) {
        setSelected(null);
        return true;
      }
      return false;
    }
    if (e.key === "Enter") {
      if (tool.kind === "wall" && chain.length >= 2) return finishChain(chain, false), true;
      if (tool.kind === "area" && areaPts.length >= 3) return finishArea(areaPts), true;
      if (tool.kind === "measure" && measure?.b) return keepMeasure(), true;
      return false;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      remove(selected);
      return true;
    }
    return false;
  };

  // ---- dragging a picked item ---------------------------------------------
  const beginDrag = (e: RPointerEvent, apply: (base: Drawing, dx: number, dy: number, at: Point) => Drawing, label: string) => {
    e.stopPropagation();
    const start = toRoom(e.clientX, e.clientY);
    const base = drawingRef.current;
    let latest = base;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const p = toRoom(ev.clientX, ev.clientY);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (!moved && Math.hypot(dx, dy) < 8 * unit) return;
      moved = true;
      latest = apply(base, dx, dy, p);
      setDrawing(latest);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      if (moved) commit(latest, label);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  const snapTo = (v: number) => (grid ? Math.round(v / grid) * grid : Math.round(v));

  const onPick = (pick: DrawingPick, e: RPointerEvent) => {
    if (tool.kind !== "select") return;
    e.stopPropagation();
    setSelected(pick);
    const d = drawingRef.current;
    if (pick.kind === "marker") {
      const m = d.markers.find((x) => x.id === pick.id);
      if (m) beginDrag(e, (b, dx, dy) => ({ ...b, markers: b.markers.map((x) => (x.id === m.id ? { ...x, x: clamp(snapTo(m.x + dx), 0, limitX), y: clamp(snapTo(m.y + dy), 0, limitY) } : x)) }), "Moved a marker");
    } else if (pick.kind === "note") {
      const n = d.notes.find((x) => x.id === pick.id);
      // A note on a table keeps its offset from the table's centre, so dragging it moves that offset by the same amount.
      if (n) beginDrag(e, (b, dx, dy) => ({ ...b, notes: b.notes.map((x) => (x.id === n.id ? { ...x, x: Math.round(n.x + dx), y: Math.round(n.y + dy) } : x)) }), "Moved a note");
    } else if (pick.kind === "label") {
      const l = d.labels.find((x) => x.id === pick.id);
      if (l) beginDrag(e, (b, dx, dy) => ({ ...b, labels: b.labels.map((x) => (x.id === l.id ? { ...x, x: clamp(snapTo(l.x + dx), 0, limitX), y: clamp(snapTo(l.y + dy), 0, limitY) } : x)) }), "Moved some text");
    } else if (pick.kind === "opening") {
      const o = d.openings.find((x) => x.id === pick.id);
      const wall = o && d.walls.find((w) => w.id === o.wall);
      if (o && wall) {
        beginDrag(
          e,
          (b, _dx, _dy, at) => {
            const hit = nearestOnWall([wall], [at.x, at.y], 1e9);
            return hit ? { ...b, openings: b.openings.map((x) => (x.id === o.id ? { ...x, at: Math.round(hit.t * 1000) / 1000 } : x)) } : b;
          },
          "Slid a door or window",
        );
      }
    }
  };

  /** Drags a wall's end; every wall that meets it there comes along. */
  const onCornerPointerDown = (wallId: string, end: "a" | "b", e: RPointerEvent) => {
    const d = drawingRef.current;
    const w = d.walls.find((x) => x.id === wallId);
    if (!w) return;
    const origin = w[end];
    beginDrag(
      e,
      (b, _dx, _dy, at) => {
        const to = snapPoint(at, e.shiftKey);
        return {
          ...b,
          walls: b.walls.map((x) => ({
            ...x,
            a: x.a[0] === origin[0] && x.a[1] === origin[1] ? to : x.a,
            b: x.b[0] === origin[0] && x.b[1] === origin[1] ? to : x.b,
          })),
        };
      },
      "Moved a wall's corner",
    );
  };

  // ---- what to draw on the canvas ----------------------------------------------
  /** The venue's drawing; `pickable` is false while its layer is locked, so a click or a selection box goes through to the furniture. */
  const showHere = (show: boolean, pickable = true) =>
    show ? <VenueLayer drawing={drawing} unit={unit} selected={selected} onPick={tool.kind === "select" && pickable ? onPick : undefined} /> : null;

  const nearTable = (pt: Pt): Point[] | null => {
    const probe: Point[] = [
      { x: pt[0] - 1, y: pt[1] - 1 },
      { x: pt[0] + 1, y: pt[1] - 1 },
      { x: pt[0] + 1, y: pt[1] + 1 },
      { x: pt[0] - 1, y: pt[1] + 1 },
    ];
    for (const t of tables) {
      const poly = tablePolygon(t);
      if (poly && polygonDistance(probe, poly) <= 40) return poly;
    }
    return null;
  };

  const walkway = useMemo(() => {
    if (!measure?.b) return null;
    const pa = nearTable(measure.a);
    const pb = nearTable(measure.b);
    if (!pa || !pb || pa === pb) return null;
    const gap = polygonDistance(pa, pb);
    return { gap, state: classifyWalkway(gap, parseSettings(data.plan?.settings)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, tables, data.plan?.settings]);

  const overlay: ReactNode = (
    <g style={{ pointerEvents: "none" }}>
      {tool.kind === "wall" && chain.length > 0 ? (
        <>
          {chain.slice(1).map((p, i) => (
            <WallPreview key={i} from={chain[i]!} to={p} unit={unit} />
          ))}
          {cursor ? <WallPreview from={chain[chain.length - 1]!} to={cursor} unit={unit} /> : null}
        </>
      ) : null}
      {tool.kind === "arc" && arcOn ? (
        <>
          <circle cx={arc.a[0]} cy={arc.a[1]} r={5 * unit} fill="#b0532b" />
          {cursor && !arc.b ? <WallPreview from={arc.a} to={cursor} unit={unit} /> : null}
          {arc.b ? <WallPreview from={arc.a} to={arc.b} bulge={cursor ? bulgeFromPoint(arc.a, arc.b, cursor) : 0} unit={unit} /> : null}
        </>
      ) : null}
      {tool.kind === "area" && areaPts.length > 0 ? (
        <>
          <polyline points={[...areaPts, ...(cursor ? [cursor] : [])].map((p) => p.join(",")).join(" ")} fill="#e6dff0" fillOpacity={0.4} stroke="#b0532b" strokeWidth={2 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`} />
          {areaPts.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={(i === 0 ? 6 : 4) * unit} fill="#b0532b" />
          ))}
        </>
      ) : null}
      {tool.kind === "measure" && measure ? (
        <MeasureLine a={measure.a} b={measure.b ?? cursor} unit={unit} colour={walkway ? WALKWAY_COLOUR[walkway.state] : "#1d6fa5"} note={walkway ? `${formatLength(walkway.gap)} between tables — ${WALKWAY_WORD[walkway.state]}` : null} />
      ) : null}
      {show.notes ? (
        <NotesLayer notes={numberNotes(drawing.notes, tables, data.vendors)} unit={unit} selectedId={selected?.kind === "note" ? selected.id : null} onPick={tool.kind === "select" && !layerLocks.notes ? (id, e) => onPick({ kind: "note", id }, e) : undefined} />
      ) : null}
      {selected?.kind === "wall"
        ? (() => {
            const w = drawing.walls.find((x) => x.id === selected.id);
            return w ? (
              <>
                {(["a", "b"] as const).map((end) => (
                  <circle
                    key={end}
                    cx={w[end][0]}
                    cy={w[end][1]}
                    r={7 * unit}
                    fill="#ffffff"
                    stroke="#b0532b"
                    strokeWidth={2.5 * unit}
                    style={{ pointerEvents: "all", cursor: "grab" }}
                    onPointerDown={(e) => onCornerPointerDown(w.id, end, e)}
                  />
                ))}
              </>
            ) : null;
          })()
        : null}
    </g>
  );

  // ---- editing the selected item ------------------------------------------------
  const selectionPanel: ReactNode = selected ? (
    <SelectionPanel
      pick={selected}
      drawing={drawing}
      vendors={data.vendors}
      tableLabel={(id) => tables.find((t) => t.id === id)?.label ?? null}
      onChange={(next, label) => commit(next, label)}
      onDelete={() => remove(selected)}
      onSplit={(wallId) => {
        const next = splitWall(drawingRef.current, wallId, freshId("w"));
        if (next !== drawingRef.current) commit(next, "Split a wall");
      }}
    />
  ) : tool.kind === "measure" && measure?.b ? (
    <div className="card flex flex-wrap items-center gap-2 p-2 text-sm">
      <span>
        <strong>{formatLength(Math.hypot(measure.b[0] - measure.a[0], measure.b[1] - measure.a[1]))}</strong>
        {walkway ? <span style={{ color: WALKWAY_COLOUR[walkway.state] }}> · between tables: {formatLength(walkway.gap)}, {WALKWAY_WORD[walkway.state]}</span> : null}
      </span>
      <button type="button" className="btn ml-auto py-1" onClick={keepMeasure}>
        Keep this measurement
      </button>
      <button type="button" className="btn py-1" onClick={() => setMeasure(null)}>
        Clear
      </button>
    </div>
  ) : null;

  const status =
    tool.kind === "wall"
      ? chain.length === 0
        ? "Click to start a wall. Shift keeps it straight; click the first corner to close the room, double-click or Enter to finish."
        : "Click the next corner. Double-click or Enter to finish, Esc to stop."
      : tool.kind === "arc"
        ? !arcOn
          ? "Click where the curved wall starts."
          : !arc.b
            ? "Click where it ends."
            : "Move to bend it, then click to set the curve."
        : tool.kind === "area"
          ? areaPts.length < 3
            ? "Click the corners of the area. Click the first one, or press Enter, to close it."
            : "Click the first corner or press Enter to close the area."
          : tool.kind === "note"
            ? "Click where the note goes. On a table, it moves with the table."
          : tool.kind === "text"
            ? "Click where the text goes."
            : tool.kind === "measure"
              ? "Click two points to measure. Shift keeps it straight."
              : tool.kind === "opening"
                ? `Click on a wall to put the ${OPENING_LABEL[tool.opening].toLowerCase()} there.`
                : tool.kind === "marker"
                  ? `Click to put ${MARKER_LABEL[tool.marker].toLowerCase()} down.`
                  : null;

  /** Add a note here (right-click): on a table it is pinned to it. */
  const addNoteAt = (p: Point) => {
    if (drawingRef.current.notes.length >= LIMITS.notes) return setError(`A space holds up to ${LIMITS.notes} notes.`);
    const note = newNoteAt(p, freshId("n"), tables, spaceId);
    commit({ ...drawingRef.current, notes: [...drawingRef.current.notes, note] }, "Added a note");
    setSelected({ kind: "note", id: note.id });
  };

  return { drawing, showHere, overlay, selectionPanel, status, onCanvasClick, onCanvasMove, onDoubleClick, onKey, selected, setSelected, commit, addNoteAt, hasSelection: selected !== null };
}

function MeasureLine({ a, b, unit, colour, note }: { a: Pt; b: Pt | null; unit: number; colour: string; note: string | null }) {
  if (!b) return <circle cx={a[0]} cy={a[1]} r={5 * unit} fill={colour} />;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return (
    <g>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={colour} strokeWidth={3 * unit} />
      <circle cx={a[0]} cy={a[1]} r={5 * unit} fill={colour} />
      <circle cx={b[0]} cy={b[1]} r={5 * unit} fill={colour} />
      <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 10 * unit} textAnchor="middle" fontSize={14 * unit} fill={colour} stroke="#ffffff" strokeWidth={4 * unit} paintOrder="stroke">
        {note ?? formatLength(len)}
      </text>
    </g>
  );
}

/** A number the person types, saved when they leave it or press Enter. */
function NumberField({ label, value, min, max, step = 1, suffix, onSave }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const save = () => {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n)) {
      const v = clamp(Math.round(n / step) * step, min, max);
      setText(String(v));
      if (v !== value) onSave(v);
    } else setText(String(value));
  };
  return (
    <label>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <input className="field w-24" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), e.preventDefault())} />
        {suffix ? <span className="text-xs text-muted">{suffix}</span> : null}
      </span>
    </label>
  );
}

function SelectionPanel({
  pick,
  drawing,
  vendors,
  tableLabel,
  onChange,
  onDelete,
  onSplit,
}: {
  pick: DrawingPick;
  drawing: Drawing;
  vendors: { id: string; name: string }[];
  tableLabel: (tableId: string) => string | null;
  onChange: (next: Drawing, label: string) => void;
  onDelete: () => void;
  onSplit: (wallId: string) => void;
}) {
  const del = (
    <button type="button" className="btn ml-auto text-red-700" onClick={onDelete}>
      Delete
    </button>
  );
  if (pick.kind === "wall") {
    const w = drawing.walls.find((x) => x.id === pick.id);
    if (!w) return null;
    const set = (patch: Partial<Wall>, label: string) => onChange({ ...drawing, walls: drawing.walls.map((x) => (x.id === w.id ? { ...x, ...patch } : x)) }, label);
    const r = wallRadius(w);
    return (
      <div className="card flex flex-wrap items-end gap-2 p-2 text-sm">
        <span>
          <strong>{r === null ? "Wall" : "Curved wall"}</strong> · {formatLength(wallLength(w))}
          {r !== null ? ` · radius ${formatLength(r)}` : ""}
        </span>
        <NumberField label="Thickness" value={w.thick} min={LIMITS.thick.min} max={LIMITS.thick.max} suffix="cm" onSave={(v) => set({ thick: v }, "Changed a wall's thickness")} />
        {r === null ? (
          <button type="button" className="btn" onClick={() => set({ bulge: Math.max(20, Math.round(wallLength(w) / 6)) }, "Bent a wall")}>
            Bend it
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => set({ bulge: 0 }, "Straightened a wall")}>
            Straighten
          </button>
        )}
        <button type="button" className="btn" onClick={() => onSplit(w.id)}>
          Split in two
        </button>
        {del}
      </div>
    );
  }
  if (pick.kind === "opening") {
    const o = drawing.openings.find((x) => x.id === pick.id);
    if (!o) return null;
    const set = (patch: Partial<typeof o>, label: string) => onChange({ ...drawing, openings: drawing.openings.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) }, label);
    return (
      <div className="card flex flex-wrap items-end gap-2 p-2 text-sm">
        <strong>{OPENING_LABEL[o.kind]}</strong>
        <NumberField label="Width" value={o.width} min={LIMITS.openingWidth.min} max={LIMITS.openingWidth.max} step={5} suffix="cm" onSave={(v) => set({ width: v }, "Resized a door or window")} />
        {o.kind === "door" || o.kind === "double_door" ? (
          <>
            <button type="button" className="btn" onClick={() => set({ swing: o.swing === "in" ? "out" : "in" }, "Flipped a door's swing")}>
              Opens {o.swing === "in" ? "to the left of the wall" : "to the right of the wall"} — flip
            </button>
            {o.kind === "door" ? (
              <button type="button" className="btn" onClick={() => set({ hinge: o.hinge === "a" ? "b" : "a" }, "Moved a door's hinge")}>
                Hinge at the {o.hinge === "a" ? "start" : "end"} — swap
              </button>
            ) : null}
          </>
        ) : null}
        <span className="text-xs text-muted">Drag it along its wall.</span>
        {del}
      </div>
    );
  }
  if (pick.kind === "marker") {
    const m = drawing.markers.find((x) => x.id === pick.id);
    if (!m) return null;
    const set = (patch: Partial<typeof m>, label: string) => onChange({ ...drawing, markers: drawing.markers.map((x) => (x.id === m.id ? { ...x, ...patch } : x)) }, label);
    return (
      <div className="card flex flex-wrap items-end gap-2 p-2 text-sm">
        <strong>{MARKER_LABEL[m.kind]}</strong>
        <NumberField label="Width" value={m.w} min={10} max={2000} suffix="cm" onSave={(v) => set({ w: v }, "Resized a marker")} />
        <NumberField label="Depth" value={m.d} min={10} max={2000} suffix="cm" onSave={(v) => set({ d: v }, "Resized a marker")} />
        <NumberField label="Turned" value={m.rot} min={0} max={359} step={15} suffix="°" onSave={(v) => set({ rot: v }, "Turned a marker")} />
        {del}
      </div>
    );
  }
  if (pick.kind === "area") {
    const a = drawing.areas.find((x) => x.id === pick.id);
    if (!a) return null;
    const set = (patch: Partial<typeof a>, label: string) => onChange({ ...drawing, areas: drawing.areas.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) }, label);
    return (
      <form
        className="card flex flex-wrap items-end gap-2 p-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
          if (name && name !== a.name) set({ name: name.slice(0, LIMITS.areaName) }, "Renamed an area");
        }}
      >
        <label>
          <span className="mb-1 block text-xs text-muted">Area</span>
          <input name="name" className="field" defaultValue={a.name} key={a.id + a.name} maxLength={LIMITS.areaName} />
        </label>
        <label className="flex items-center gap-1.5 pb-2">
          <input type="checkbox" checked={a.outdoor} onChange={(e) => set({ outdoor: e.target.checked }, "Changed an area")} /> Outdoors (hatched)
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted">Tint</span>
          <input type="color" className="h-9 w-12 rounded border border-line" value={a.tint ?? (a.outdoor ? "#cfe3c4" : "#e6dff0")} onChange={(e) => set({ tint: e.target.value }, "Tinted an area")} />
        </label>
        <button type="submit" className="btn">
          Rename
        </button>
        {del}
      </form>
    );
  }
  if (pick.kind === "note") {
    const n = drawing.notes.find((x) => x.id === pick.id);
    if (!n) return null;
    const set = (patch: Partial<typeof n>, label: string) => onChange({ ...drawing, notes: drawing.notes.map((x) => (x.id === n.id ? { ...x, ...patch } : x)) }, label);
    const on = n.table_id ? tableLabel(n.table_id) : null;
    return (
      <form
        className="card space-y-2 p-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const text = String(new FormData(e.currentTarget).get("text") ?? "").trim();
          if (text && text !== n.text) set({ text: text.slice(0, LIMITS.noteText) }, "Changed a note");
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Note{on ? ` on ${on}: it moves with the table` : ""}</span>
          <textarea name="text" className="field w-full" rows={3} defaultValue={n.text} key={n.id + n.text} maxLength={LIMITS.noteText} />
        </label>
        <fieldset>
          <legend className="mb-1 text-xs text-muted">For {addressee(n, vendors)}</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={n.vendor_ids.length === 0} onChange={() => set({ vendor_ids: [] }, "Addressed a note to everyone")} />
              Everyone
            </label>
            {vendors.map((v) => (
              <label key={v.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={n.vendor_ids.includes(v.id)}
                  onChange={(e) => set({ vendor_ids: e.target.checked ? [...n.vendor_ids, v.id].slice(0, LIMITS.noteVendors) : n.vendor_ids.filter((x) => x !== v.id) }, "Addressed a note")}
                />
                {v.name}
              </label>
            ))}
          </div>
          {vendors.length === 0 ? <p className="text-xs text-muted">Add your suppliers on the Vendors page to address a note to one.</p> : null}
        </fieldset>
        <div className="flex gap-2">
          <button type="submit" className="btn">
            Save
          </button>
          {del}
        </div>
      </form>
    );
  }
  if (pick.kind === "label") {
    const l = drawing.labels.find((x) => x.id === pick.id);
    if (!l) return null;
    const set = (patch: Partial<typeof l>, label: string) => onChange({ ...drawing, labels: drawing.labels.map((x) => (x.id === l.id ? { ...x, ...patch } : x)) }, label);
    return (
      <form
        className="card flex flex-wrap items-end gap-2 p-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const text = String(new FormData(e.currentTarget).get("text") ?? "").trim();
          if (text && text !== l.text) set({ text: text.slice(0, LIMITS.labelText) }, "Changed some text");
        }}
      >
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-xs text-muted">Text</span>
          <input name="text" className="field w-full" defaultValue={l.text} key={l.id + l.text} maxLength={LIMITS.labelText} />
        </label>
        <NumberField label="Size" value={l.size} min={LIMITS.labelSize.min} max={LIMITS.labelSize.max} suffix="px" onSave={(v) => set({ size: v }, "Resized some text")} />
        <button type="submit" className="btn">
          Save
        </button>
        {del}
      </form>
    );
  }
  const k = drawing.dimensions.find((x) => x.id === pick.id);
  if (!k) return null;
  return (
    <div className="card flex flex-wrap items-center gap-2 p-2 text-sm">
      <strong>Measurement</strong> {formatLength(Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]))}
      {del}
    </div>
  );
}
