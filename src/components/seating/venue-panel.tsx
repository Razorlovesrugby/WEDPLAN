"use client";

import { useState, useTransition } from "react";
import { removeSeatingBackground, updateSeatingRoom } from "@/server/actions/seating";
import { setSeatingSpaceOpacity } from "@/server/actions/seating-spaces";
import { MARKER_KINDS, OPENING_KINDS, formatLength, parseDrawing } from "@/lib/seating/drawing";
import { MARKER_LABEL, OPENING_LABEL, SELECT, TOOL_LABEL, type Tool } from "@/lib/seating/tools";
import { useBackgroundUpload } from "./background-upload";
import { PdfPagePicker } from "./pdf-picker";
import { useSeating } from "./seating-state";

const DRAW_TOOLS = ["select", "wall", "arc", "area", "text", "measure"] as const;

/**
 * The Venue tab (spec 57 Part B): the drawing tools, doors and windows,
 * markers, and the venue's own plan with its scale and fade. An empty space
 * first offers three equal ways to start.
 */
export function VenuePanel({ editable }: { editable: boolean }) {
  const { eventId, layoutId, spaceId, data, tables, tool, setTool, setError, refresh, track } = useSeating();
  const { busy, upload, pdf, takePdfPage, cancelPdf } = useBackgroundUpload();
  const [pending, startTransition] = useTransition();
  const [skipped, setSkipped] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [w, setW] = useState("");
  const [d, setD] = useState("");

  const space = data.spaces.find((s) => s.id === spaceId) ?? data.spaces[0] ?? null;
  if (!space) return <p className="text-sm text-muted">Place a table or add a space first.</p>;
  const parsed = parseDrawing(space.drawing);
  const drawing = parsed.ok ? parsed.drawing : null;
  const drawn = drawing ? drawing.walls.length + drawing.areas.length + drawing.openings.length + drawing.markers.length + drawing.labels.length : 0;
  const placedHere = tables.some((t) => t.space_id === space.id && t.pos_x_cm !== null);
  const empty = drawn === 0 && !space.background_path && !placedHere;
  const isTool = (t: Tool) => JSON.stringify(t) === JSON.stringify(tool);

  const pickFile = (then: (ok: boolean) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) then(await upload(file));
    };
    input.click();
  };

  return (
    <div className="space-y-4 text-sm" aria-label="Venue">
      {empty && !skipped && editable ? (
        <section className="space-y-2" aria-label="Start this space">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Start “{space.name}”</h3>
          <button type="button" className="card w-full p-3 text-left hover:bg-line/30" disabled={Boolean(busy)} onClick={() => pickFile((ok) => ok && setMeasuring(true))}>
            <strong className="block">Upload the venue&rsquo;s plan and trace it</strong>
            <span className="text-xs text-muted">Photo, screenshot or PDF → set the scale → trace the walls, doors and windows.</span>
          </button>
          <button type="button" className="card w-full p-3 text-left hover:bg-line/30" disabled={Boolean(busy)} onClick={() => pickFile(() => undefined)}>
            <strong className="block">Use the venue&rsquo;s plan as it is</strong>
            <span className="text-xs text-muted">Upload it and set the scale. No tracing.</span>
          </button>
          <div className="card space-y-2 p-3">
            <strong className="block">Draw from measurements</strong>
            <span className="block text-xs text-muted">Give the room&rsquo;s size, then draw its walls.</span>
            <div className="flex items-end gap-2">
              <label>
                <span className="mb-1 block text-xs text-muted">Width (m)</span>
                <input className="field w-20" inputMode="decimal" value={w} placeholder={String(space.room_width_cm / 100)} onChange={(e) => setW(e.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-xs text-muted">Depth (m)</span>
                <input className="field w-20" inputMode="decimal" value={d} placeholder={String(space.room_depth_cm / 100)} onChange={(e) => setD(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn-primary py-1.5"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const width = Math.round(Number((w || String(space.room_width_cm / 100)).replace(",", ".")) * 100);
                    const depth = Math.round(Number((d || String(space.room_depth_cm / 100)).replace(",", ".")) * 100);
                    const r = await track("Set the room's size", () => updateSeatingRoom(eventId, { room_width_cm: width, room_depth_cm: depth }, layoutId, space.id));
                    if (!r.ok) setError(r.error);
                    else setTool({ kind: "wall" });
                    refresh();
                  })
                }
              >
                Then draw
              </button>
            </div>
          </div>
          <button type="button" className="text-xs text-muted underline" onClick={() => setSkipped(true)}>
            Skip: it&rsquo;s a plain {formatLength(space.room_width_cm)} × {formatLength(space.room_depth_cm)} room
          </button>
          {busy ? <p className="text-xs text-muted">{busy}</p> : null}
        </section>
      ) : null}

      {pdf ? <PdfPagePicker plan={pdf} onUse={(page) => void takePdfPage(page)} onCancel={cancelPdf} /> : null}

      {measuring && space.background_path ? (
        <p className="rounded bg-accent/10 px-2 py-1.5 text-xs">
          Uploaded. Next, <strong>set the scale</strong> from the toolbar over the plan (tap two points whose distance you know), then trace the walls with Walls.{" "}
          <button type="button" className="underline" onClick={() => { setMeasuring(false); setTool({ kind: "wall" }); }}>
            Start tracing
          </button>
        </p>
      ) : null}

      {editable ? (
        <>
          <section aria-label="Tools">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Draw</h3>
            <div className="flex flex-wrap gap-1.5">
              {DRAW_TOOLS.map((k) => (
                <button key={k} type="button" aria-pressed={isTool({ kind: k })} className={`btn py-1 ${isTool({ kind: k }) ? "ring-2 ring-ink" : ""}`} onClick={() => setTool(isTool({ kind: k }) ? SELECT : { kind: k })}>
                  {TOOL_LABEL[k]}
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Doors and windows">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Doors and windows</h3>
            <div className="flex flex-wrap gap-1.5">
              {OPENING_KINDS.map((k) => (
                <button key={k} type="button" aria-pressed={isTool({ kind: "opening", opening: k })} className={`btn py-1 ${isTool({ kind: "opening", opening: k }) ? "ring-2 ring-ink" : ""}`} onClick={() => setTool(isTool({ kind: "opening", opening: k }) ? SELECT : { kind: "opening", opening: k })}>
                  {OPENING_LABEL[k]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">Click one, then a wall: it snaps on and slides along.</p>
          </section>

          <section aria-label="Markers">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Markers</h3>
            <div className="flex flex-wrap gap-1.5">
              {MARKER_KINDS.map((k) => (
                <button key={k} type="button" aria-pressed={isTool({ kind: "marker", marker: k })} className={`btn py-1 ${isTool({ kind: "marker", marker: k }) ? "ring-2 ring-ink" : ""}`} onClick={() => setTool(isTool({ kind: "marker", marker: k }) ? SELECT : { kind: "marker", marker: k })}>
                  {MARKER_LABEL[k]}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="text-xs text-muted">Drawing the venue needs a tablet or a bigger screen. Here you can look at it and seat people.</p>
      )}

      <section aria-label="The venue's plan" className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">The venue&rsquo;s own plan</h3>
        {space.background_path ? (
          <>
            <p className="text-xs text-muted">{space.calibrated ? "To scale." : "Placed by eye: set the scale from the toolbar over the plan."}</p>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Fade ({space.background_opacity}%)</span>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                defaultValue={space.background_opacity}
                className="w-full"
                onMouseUp={(e) => startTransition(async () => { const r = await setSeatingSpaceOpacity(eventId, space.id, Number((e.target as HTMLInputElement).value)); if (!r.ok) setError(r.error); refresh(); })}
                onTouchEnd={(e) => startTransition(async () => { const r = await setSeatingSpaceOpacity(eventId, space.id, Number((e.target as HTMLInputElement).value)); if (!r.ok) setError(r.error); refresh(); })}
                onKeyUp={(e) => startTransition(async () => { const r = await setSeatingSpaceOpacity(eventId, space.id, Number((e.target as HTMLInputElement).value)); if (!r.ok) setError(r.error); refresh(); })}
                aria-label="How faded the venue's plan is"
              />
            </label>
          </>
        ) : (
          <p className="text-xs text-muted">No plan uploaded for this space.</p>
        )}
        {editable ? (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn py-1" disabled={Boolean(busy)} onClick={() => pickFile(() => undefined)}>
              {space.background_path ? "Replace the plan" : "Upload the plan"}
            </button>
            {space.background_path ? (
              <button
                type="button"
                className="btn py-1 text-red-700"
                onClick={() => startTransition(async () => { const r = await removeSeatingBackground(eventId, layoutId, space.id); if (!r.ok) setError(r.error); refresh(); })}
              >
                Remove it
              </button>
            ) : null}
          </div>
        ) : null}
        {busy ? <p className="text-xs text-muted">{busy}</p> : null}
        <p className="text-xs text-muted">A JPEG, PNG, WebP or PDF of the plan. Room {formatLength(space.room_width_cm)} × {formatLength(space.room_depth_cm)}.</p>
      </section>

      {drawing && drawing.areas.length > 0 ? (
        <section aria-label="Areas">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Areas</h3>
          <ul className="list-disc pl-5 text-xs">
            {drawing.areas.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
