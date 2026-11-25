"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
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
import type { SeatingFixture, SeatingTable } from "@/lib/seating/model";
import type { SeatingFixtureKind } from "@/lib/types/database";
import { useSeating } from "./seating-state";
import { useBackgroundUpload } from "./background-upload";
import { PdfPagePicker } from "./pdf-picker";
import { useDrawingTools } from "./drawing-tools";
import { DRAG_ITEM_TYPE } from "./library-panel";
import { carriesQuantity, fixtureGroup } from "@/lib/seating/library";
import { isDrawing, SELECT, toolAfterPlacing, TOOL_LABEL, type PlaceItem } from "@/lib/seating/tools";
import { TABLET_UP, useMediaQuery } from "@/components/ui/use-media-query";

const GRID_CM = 25;
type Selected = { kind: "table" | "fixture"; id: string } | null;
type ViewBox = { x: number; y: number; w: number; h: number };

/**
 * The Room view (spec 33 Part C): an SVG floor plan in room centimetres, so
 * it's to scale by construction. Drag a table or fixture to move it, the
 * round handle to turn it; drag the background to pan, pinch or scroll to
 * zoom. Moves save once, on release — never per frame.
 *
 * Pointer events throughout, not dnd-kit (amendment 23: geometry, not
 * lists). Guests still drop onto tables here — each table is a dnd-kit drop
 * target too — and tap-to-place works the same as in the Tables view.
 */
export function RoomView() {
  const { eventId, layoutId, spaceId, data, tables, setTables, refresh, setError, held, hold, move, track, tool, setTool, show, locked } = useSeating();
  // Below tablet width the room is for looking at and seating people: no moving furniture, no drawing (spec 57 Part A). A locked room is the same (Part D).
  const editable = useMediaQuery(TABLET_UP) && !locked;
  const plan = data.plan;
  const roomW = plan?.room_width_cm ?? 2000;
  const roomD = plan?.room_depth_cm ?? 1500;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<ViewBox>(() => fit(roomW, roomD));
  const [selected, setSelected] = useState<Selected>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [rings, setRings] = useState(false);
  const [fixtures, setFixtures] = useState<SeatingFixture[]>(data.fixtures);
  const [calibrating, setCalibrating] = useState<Point[] | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setFixtures(data.fixtures), [data.fixtures]);
  useEffect(() => setView(fit(roomW, roomD)), [roomW, roomD]);
  // 1 when the whole room fits; 2 when the view is half as wide.
  const detail = chairDetail(fit(roomW, roomD).w / view.w);

  // Each room shows its own tables and furniture; a table with no place yet waits to be put in whichever room is open.
  const placed = tables.filter((t) => t.pos_x_cm !== null && (!spaceId || t.space_id === spaceId));
  const unplaced = tables.filter((t) => t.pos_x_cm === null);
  const hereFixtures = fixtures.filter((f) => {
    if (spaceId && f.space_id !== spaceId) return false;
    const group = fixtureGroup(f.kind);
    return group === "decor" ? show.decor : show.furniture;
  });

  /** Screen point → room centimetres. */
  const toRoom = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  // The venue drawing and its tools. `unit` is room centimetres per screen pixel, so lines and text stay readable at any zoom.
  const unit = view.w / (svgRef.current?.clientWidth || 1000);
  const tools = useDrawingTools({ toRoom, snapOn, roomW, roomD, unit });

  /** Puts a library item down at a point: a table becomes a table, anything else a fixture. */
  const placeAt = (item: PlaceItem, p: Point) => {
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
    setTool(SELECT);
  };

  // ---- dragging items, panning, pinching -------------------------------------
  const drag = useRef<
    | { mode: "move"; sel: NonNullable<Selected>; start: Point; origin: Point; moved: boolean; last: Point; rotation: number }
    | { mode: "rotate"; sel: NonNullable<Selected>; centre: Point; last: number }
    | { mode: "pan"; start: { x: number; y: number }; view: ViewBox; moved: boolean }
    | null
  >(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; view: ViewBox; mid: Point } | null>(null);

  const itemPos = (sel: NonNullable<Selected>): Point | null => {
    if (sel.kind === "table") {
      const t = tables.find((x) => x.id === sel.id);
      return t && t.pos_x_cm !== null ? { x: t.pos_x_cm, y: t.pos_y_cm! } : null;
    }
    const f = fixtures.find((x) => x.id === sel.id);
    return f ? { x: f.pos_x_cm, y: f.pos_y_cm } : null;
  };

  const setItem = (sel: NonNullable<Selected>, patch: { x?: number; y?: number; rotation?: number }) => {
    if (sel.kind === "table") {
      setTables((ts) =>
        ts.map((t) =>
          t.id === sel.id
            ? {
                ...t,
                pos_x_cm: patch.x ?? t.pos_x_cm,
                pos_y_cm: patch.y ?? t.pos_y_cm,
                rotation_deg: patch.rotation ?? t.rotation_deg,
              }
            : t,
        ),
      );
    } else {
      setFixtures((fs) =>
        fs.map((f) =>
          f.id === sel.id
            ? { ...f, pos_x_cm: patch.x ?? f.pos_x_cm, pos_y_cm: patch.y ?? f.pos_y_cm, rotation_deg: patch.rotation ?? f.rotation_deg }
            : f,
        ),
      );
    }
  };

  /** One write per drag, with the values the drag ended on. */
  const save = (sel: NonNullable<Selected>, at: { x: number | null; y: number | null; rotation: number }) => {
    startTransition(async () => {
      const r =
        sel.kind === "table"
          ? await track("Moved a table", () => moveSeatingTable(sel.id, eventId, { x: at.x, y: at.y, rotation: at.rotation, spaceId }))
          : await track("Moved an item in the room", () =>
              updateSeatingFixture(sel.id, eventId, {
                pos_x_cm: at.x ?? 0,
                pos_y_cm: at.y ?? 0,
                rotation_deg: at.rotation,
              }),
            );
      if (!r.ok) setError(r.error);
      refresh();
    });
  };

  const itemRotation = (sel: NonNullable<Selected>): number =>
    sel.kind === "table"
      ? tables.find((t) => t.id === sel.id)?.rotation_deg ?? 0
      : fixtures.find((f) => f.id === sel.id)?.rotation_deg ?? 0;

  const onItemPointerDown = (e: RPointerEvent, sel: NonNullable<Selected>) => {
    if (calibrating || isDrawing(tool)) return;
    e.stopPropagation();
    const pos = itemPos(sel);
    if (!pos) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = {
      mode: "move",
      sel,
      start: toRoom(e.clientX, e.clientY),
      origin: pos,
      moved: false,
      last: pos,
      rotation: itemRotation(sel),
    };
  };

  const onRotatePointerDown = (e: RPointerEvent, sel: NonNullable<Selected>) => {
    if (!editable) return;
    e.stopPropagation();
    const pos = itemPos(sel);
    if (!pos) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: "rotate", sel, centre: pos, last: itemRotation(sel) };
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const k = pinch.current.dist / Math.max(dist, 1);
      setView(zoomAbout(pinch.current.view, pinch.current.mid, k));
      return;
    }
    if (isDrawing(tool) || tool.kind === "place") tools.onCanvasMove(toRoom(e.clientX, e.clientY), e.shiftKey);
    const d = drag.current;
    if (!d) return;
    if (d.mode === "move") {
      if (!editable) return;
      const p = toRoom(e.clientX, e.clientY);
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 8) return;
      d.moved = true;
      const step = snapOn && !e.altKey ? GRID_CM : 0;
      d.last = {
        x: clamp(snap(d.origin.x + dx, step), 0, roomW),
        y: clamp(snap(d.origin.y + dy, step), 0, roomD),
      };
      setItem(d.sel, d.last);
    } else if (d.mode === "rotate") {
      const p = toRoom(e.clientX, e.clientY);
      const deg = (Math.atan2(p.y - d.centre.y, p.x - d.centre.x) * 180) / Math.PI + 90;
      d.last = normaliseDegrees(e.shiftKey ? deg : Math.round(deg / 15) * 15);
      setItem(d.sel, { rotation: d.last });
    } else if (d.mode === "pan") {
      const svg = svgRef.current;
      if (!svg) return;
      const scale = d.view.w / svg.clientWidth;
      const dx = (e.clientX - d.start.x) * scale;
      const dy = (e.clientY - d.start.y) * scale;
      if (Math.hypot(dx, dy) > 4 * scale) d.moved = true;
      setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === "move") {
      if (d.moved) save(d.sel, { x: d.last.x, y: d.last.y, rotation: d.rotation });
      else if (held && d.sel.kind === "table") {
        move(held.guestIds, d.sel.id);
        hold(null);
      } else setSelected(d.sel);
    } else if (d.mode === "rotate") {
      save(d.sel, { x: d.centre.x, y: d.centre.y, rotation: d.last });
    } else if (d.mode === "pan" && !d.moved) {
      const p = toRoom(e.clientX, e.clientY);
      if (calibrating) {
        const next = [...calibrating, p];
        if (next.length === 2) finishCalibration(next);
        else setCalibrating(next);
      } else if (editable && tool.kind === "place") placeAt(tool.item, p);
      else if (editable && tools.onCanvasClick(p, e)) {
        // The tool took the click.
      } else {
        setSelected(null);
        tools.setSelected(null);
      }
    }
  };

  const onBackgroundPointerDown = (e: RPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = null;
      pinch.current = {
        dist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        view,
        mid: toRoom((a!.x + b!.x) / 2, (a!.y + b!.y) / 2),
      };
      return;
    }
    drag.current = { mode: "pan", start: { x: e.clientX, y: e.clientY }, view, moved: false };
  };

  // Wheel zoom about the cursor. A native listener: React's is passive and can't preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toRoom(e.clientX, e.clientY);
      setView((v) => zoomAbout(v, p, e.deltaY > 0 ? 1.12 : 1 / 1.12));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toRoom]);

  // Arrow keys nudge the selection; R turns it.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editable && tools.onKey(e)) return;
    if (!editable || !selected) return;
    const pos = itemPos(selected);
    if (!pos) return;
    const step = e.shiftKey ? 25 : 5;
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    if (moves[e.key]) {
      e.preventDefault();
      const next = { x: clamp(pos.x + moves[e.key]!.x, 0, roomW), y: clamp(pos.y + moves[e.key]!.y, 0, roomD) };
      setItem(selected, next);
      save(selected, { ...next, rotation: itemRotation(selected) });
    } else if (e.key === "r" || e.key === "R") {
      const rotation = normaliseDegrees(itemRotation(selected) + (e.shiftKey ? -15 : 15));
      setItem(selected, { rotation });
      save(selected, { ...pos, rotation });
    } else if (e.key === "Escape") setSelected(null);
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

  const selectedTable = selected?.kind === "table" ? tables.find((t) => t.id === selected.id) : undefined;
  const selectedFixture = selected?.kind === "fixture" ? fixtures.find((f) => f.id === selected.id) : undefined;
  const handleR = view.w / 40;

  return (
    <div className="space-y-2">
      <RoomToolbar
        view={view}
        setView={setView}
        roomW={roomW}
        roomD={roomD}
        snapOn={snapOn}
        setSnapOn={setSnapOn}
        rings={rings}
        setRings={setRings}
        calibrating={calibrating !== null}
        setCalibrating={(on) => setCalibrating(on ? [] : null)}
        editable={editable}
      />

      {tools.status || tool.kind === "place" ? (
        <p className="rounded bg-accent/10 px-3 py-2 text-sm" role="status">
          {tool.kind === "place" ? `Click the spot to put ${tool.item.label} there. Esc to stop.` : tools.status}
        </p>
      ) : null}

      {calibrating ? (
        <p className="rounded bg-accent/10 px-3 py-2 text-sm">
          Tap two points on the floor plan whose real distance you know — two walls, a doorway.{" "}
          {calibrating.length === 1 ? "Now the second." : ""}
        </p>
      ) : held ? (
        <p className="rounded bg-accent/10 px-3 py-2 text-sm">Tap a table to seat {held.label}.</p>
      ) : null}

      <div className="card relative overflow-hidden">
        <CanvasLegend />
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="block h-[65vh] w-full touch-none select-none bg-[#f6f3ee] outline-none"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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
          <rect
            x={-roomW}
            y={-roomD}
            width={roomW * 3}
            height={roomD * 3}
            fill="transparent"
            onPointerDown={onBackgroundPointerDown}
          />
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

          {tools.showHere(show.venue)}

          {/* While a drawing tool is in hand, a click goes to the plan underneath, not to a table or a bar. */}
          <g style={isDrawing(tool) || tool.kind === "place" ? { pointerEvents: "none" } : undefined}>
            {hereFixtures.map((f) => (
              <FixtureShape
                key={f.id}
                fixture={f}
                selected={selectedFixture?.id === f.id}
                onPointerDown={(e) => onItemPointerDown(e, { kind: "fixture", id: f.id })}
                fontSize={Math.max(14, view.w / 70)}
              />
            ))}

            {placed.map((t) => (
              <TableShape
                key={t.id}
                table={t}
                selected={selectedTable?.id === t.id}
                rings={rings}
                fontSize={Math.max(14, view.w / 70)}
                detail={detail}
                onPointerDown={(e) => onItemPointerDown(e, { kind: "table", id: t.id })}
              />
            ))}
          </g>

          {tools.overlay}

          {calibrating?.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={view.w / 150} fill="#b0532b" style={{ pointerEvents: "none" }} />
          ))}

          {editable && selected && (selectedTable?.pos_x_cm != null || selectedFixture) ? (
            <RotateHandle
              item={selectedTable ?? selectedFixture!}
              r={handleR}
              onPointerDown={(e) => onRotatePointerDown(e, selected)}
            />
          ) : null}
        </svg>
      </div>

      {unplaced.length > 0 ? (
        <div className="card flex flex-wrap items-center gap-2 p-2 text-sm">
          <span className="text-xs text-muted">Not in the room yet:</span>
          {unplaced.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn py-1"
              onClick={() => {
                const at = {
                  x: clamp(snap(view.x + view.w / 2, GRID_CM), 0, roomW),
                  y: clamp(snap(view.y + view.h / 2, GRID_CM), 0, roomD),
                };
                setItem({ kind: "table", id: t.id }, at);
                save({ kind: "table", id: t.id }, { ...at, rotation: t.rotation_deg });
              }}
            >
              Place {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tools.selectionPanel}
      {selectedTable ? <SelectedTablePanel table={selectedTable} onUnplace={() => setSelected(null)} editable={editable} /> : null}
      {selectedFixture ? <SelectedFixturePanel fixture={selectedFixture} onDone={() => setSelected(null)} editable={editable} /> : null}

      {editable ? (
        <>
          <AddFixture view={view} roomW={roomW} roomD={roomD} />
          <RoomSettings />
        </>
      ) : null}
    </div>
  );
}

/** What the chair colours mean, counted, with the dashed outline and dietary dots (spec 57 A.2). */
function CanvasLegend() {
  const { colourBy, data, assignments, guestById } = useSeating();
  const seated = assignments.map((a) => guestById.get(a.guestId)).filter((g): g is NonNullable<typeof g> => Boolean(g));
  const rows = colourCounts(seated, colourBy, data.colour);
  const declined = declinedSeats(data.guests, assignments).length;
  const allergy = seated.filter((g) => g.dietaryNeeds.some((n) => n.isAllergy)).length;
  const preference = seated.filter((g) => g.dietaryNeeds.length > 0 && !g.dietaryNeeds.some((n) => n.isAllergy)).length;
  if (rows.length === 0 && declined === 0 && allergy === 0 && preference === 0) return null;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[14rem] space-y-0.5 rounded border border-line bg-white/90 px-2 py-1.5 text-[0.7rem] leading-snug shadow-sm" aria-label="Legend">
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
  );
}

function fit(roomW: number, roomD: number): ViewBox {
  const pad = Math.max(roomW, roomD) * 0.05;
  return { x: -pad, y: -pad, w: roomW + pad * 2, h: roomD + pad * 2 };
}

function zoomAbout(v: ViewBox, p: Point, k: number): ViewBox {
  const w = clamp(v.w * k, 200, 40000);
  const ratio = w / v.w;
  const h = v.h * ratio;
  return { x: p.x - (p.x - v.x) * ratio, y: p.y - (p.y - v.y) * ratio, w, h };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
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

function TableShape({
  table,
  selected,
  rings,
  fontSize,
  detail,
  onPointerDown,
}: {
  table: SeatingTable;
  selected: boolean;
  rings: boolean;
  fontSize: number;
  detail: ChairDetail;
  onPointerDown: (e: RPointerEvent) => void;
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
  const stroke = selected ? "#1a1a1a" : warn ? "#b45309" : isOver ? "#7c5c3e" : "#8a8580";
  // Big enough to read zoomed out, never wider than the table it names.
  const fs = Math.min(fontSize, Math.max(length, width) / (0.62 * Math.max(4, table.label.length)));

  return (
    <g
      ref={setNodeRef as unknown as React.Ref<SVGGElement>}
      transform={`translate(${table.pos_x_cm} ${table.pos_y_cm}) rotate(${table.rotation_deg})`}
      onPointerDown={onPointerDown}
      style={{ cursor: held ? "copy" : "move" }}
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

function FixtureShape({
  fixture,
  selected,
  fontSize,
  onPointerDown,
}: {
  fixture: SeatingFixture;
  selected: boolean;
  fontSize: number;
  onPointerDown: (e: RPointerEvent) => void;
}) {
  const { data } = useSeating();
  const custom = fixture.custom_item_id ? data.customItems.find((c) => c.id === fixture.custom_item_id) : undefined;
  const marquee = fixture.marquee_id ? data.marquees.find((m) => m.id === fixture.marquee_id) : undefined;
  const label = fixture.label ?? custom?.name ?? FIXTURE_DEFAULTS[fixture.kind]?.label ?? fixture.kind;
  const look = FIXTURE_LOOK[fixture.kind] ?? { fill: "#ece9e3" };
  const round = custom ? custom.shape === "round" : look.round;
  const fill = custom?.colour ?? look.fill;
  const stroke = selected ? "#1a1a1a" : "#a39d94";
  const w = fixture.width_cm;
  const d = fixture.depth_cm;
  return (
    <g
      transform={`translate(${fixture.pos_x_cm} ${fixture.pos_y_cm}) rotate(${fixture.rotation_deg})`}
      onPointerDown={onPointerDown}
      style={{ cursor: "move" }}
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

function RoomToolbar({
  view,
  setView,
  roomW,
  roomD,
  snapOn,
  setSnapOn,
  rings,
  setRings,
  calibrating,
  setCalibrating,
  editable,
}: {
  editable: boolean;
  view: ViewBox;
  setView: (v: ViewBox) => void;
  roomW: number;
  roomD: number;
  snapOn: boolean;
  setSnapOn: (v: boolean) => void;
  rings: boolean;
  setRings: (v: boolean) => void;
  calibrating: boolean;
  setCalibrating: (v: boolean) => void;
}) {
  const { data, tool, setTool } = useSeating();
  const centre = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {editable ? (
        <div role="toolbar" aria-label="Tools" className="flex flex-wrap gap-1">
          {(["select", "wall", "arc", "area", "text", "measure"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={tool.kind === k} className={`btn py-1 ${tool.kind === k ? "ring-2 ring-ink" : ""}`} onClick={() => setTool(tool.kind === k ? SELECT : { kind: k })}>
              {TOOL_LABEL[k]}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" className="btn py-1" aria-label="Zoom in" onClick={() => setView(zoomAbout(view, centre, 1 / 1.25))}>
        +
      </button>
      <button type="button" className="btn py-1" aria-label="Zoom out" onClick={() => setView(zoomAbout(view, centre, 1.25))}>
        −
      </button>
      <button type="button" className="btn py-1" onClick={() => setView(fit(roomW, roomD))}>
        Fit room
      </button>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> Snap to 25 cm
      </label>
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

function SelectedTablePanel({ table, onUnplace, editable }: { table: SeatingTable; onUnplace: () => void; editable: boolean }) {
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
    </div>
  );
}

function SelectedFixturePanel({ fixture, onDone, editable }: { fixture: SeatingFixture; onDone: () => void; editable: boolean }) {
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
  );
}

function AddFixture({ view, roomW, roomD }: { view: ViewBox; roomW: number; roomD: number }) {
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
function RoomSettings() {
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
