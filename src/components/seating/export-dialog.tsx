"use client";

import { useState } from "react";
import { serialiseColourBy } from "@/lib/seating/colour";
import { PNG_SCALES, downloadSvgAsPng, pngFileName, type PngScale } from "@/lib/seating/png-export";
import { useSeating } from "./seating-state";

const EXPORTS = [
  ["caterer", "Caterer: floor plans, kitchen summary, guests A to Z, a page per table"],
  ["venue", "Venue: walls, doors, furniture and décor, no names"],
  ["florist", "Florist: décor and table centres, with the list"],
  ["hire", "Hire company: furniture marked, counts and tableware"],
  ["names", "Entrance board: guests A to Z with their table"],
] as const;
const BOARD_SIZES = ["a4", "a3", "a2", "a1", "a0"] as const;

/**
 * Export (spec 57 Part E): which export, what paper, which spaces, or the
 * shown space as a picture. Every export is a print view the browser makes
 * into a PDF; the picture is drawn from the canvas.
 */
export function ExportDialog({ eventName }: { eventName: string }) {
  const { eventId, layoutId, isDraft, colourBy, data, spaceId } = useSeating();
  const [kind, setKind] = useState<(typeof EXPORTS)[number][0]>("caterer");
  const [size, setSize] = useState<(typeof BOARD_SIZES)[number]>("a4");
  const [orient, setOrient] = useState<"portrait" | "landscape">("portrait");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState<PngScale>(2);
  const [message, setMessage] = useState<string | null>(null);

  const colour = serialiseColourBy(colourBy);
  const base = `/events/${eventId}/seating/print?view=${kind === "names" ? "names" : kind}${colour ? `&colour=${encodeURIComponent(colour)}` : ""}${isDraft && layoutId ? `&layout=${layoutId}` : ""}`;
  const paper = kind === "names" ? `&size=${size}&orient=${orient}` : `&paper=${size === "a3" ? "a3" : "a4"}&orient=${orient}${picked.size ? `&spaces=${[...picked].join(",")}` : ""}`;
  const sizes = kind === "names" ? BOARD_SIZES : (["a4", "a3"] as const);
  const space = data.spaces.find((s) => s.id === spaceId) ?? data.spaces[0];

  return (
    <details className="relative">
      <summary className="btn cursor-pointer list-none py-1">Export</summary>
      <div className="absolute right-0 z-30 mt-1 w-[22rem] space-y-3 rounded border border-line bg-white p-3 text-sm shadow-lg" role="dialog" aria-label="Export">
        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Export</legend>
          {EXPORTS.map(([k, label]) => (
            <label key={k} className="flex items-start gap-2">
              <input type="radio" name="export-kind" className="mt-1" checked={kind === k} onChange={() => { setKind(k); if (k !== "names" && !["a4", "a3"].includes(size)) setSize("a4"); }} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <label>
            <span className="mb-1 block text-xs text-muted">Paper</span>
            <select className="field py-1" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-muted">Orientation</span>
            <select className="field py-1" value={orient} onChange={(e) => setOrient(e.target.value as typeof orient)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
        {kind !== "names" && data.spaces.length > 1 ? (
          <fieldset>
            <legend className="mb-1 text-xs text-muted">Spaces (none ticked means all)</legend>
            {data.spaces.map((s) => (
              <label key={s.id} className="mr-3 inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={picked.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setPicked(next);
                  }}
                />
                {s.name}
              </label>
            ))}
          </fieldset>
        ) : null}
        <a className="btn-primary inline-block" href={`${base}${paper}`} target="_blank" rel="noreferrer">
          Open to print or save as PDF
        </a>

        <div className="border-t border-line pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Image of {space?.name ?? "the space"}</p>
          <div className="flex items-center gap-2">
            <select className="field py-1" value={scale} onChange={(e) => setScale(Number(e.target.value) as PngScale)} aria-label="Image size">
              {PNG_SCALES.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn py-1"
              onClick={async () => {
                const svg = document.querySelector<SVGSVGElement>("svg[aria-label='Floor plan']");
                if (!svg) {
                  setMessage("Open the Room view first, then save the image.");
                  return;
                }
                const r = await downloadSvgAsPng(svg, scale, pngFileName(eventName, space?.name ?? ""));
                setMessage(r.ok ? "Saved (the venue's own plan image isn't included)." : r.error);
              }}
            >
              Download PNG
            </button>
          </div>
          {message ? <p className="mt-1 text-xs text-muted" role="status">{message}</p> : null}
        </div>
      </div>
    </details>
  );
}
