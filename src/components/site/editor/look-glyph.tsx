import type { ReactNode } from "react";
import type { BlockType } from "@/lib/site/blocks";

/**
 * A miniature of each Look (spec 27 E1), drawn as shapes.
 *
 * These are **diagrams, not renderings**. The spec asked for thumbnails drawn
 * from the planner's own content; that would mean server-rendering every block
 * in every Look for every selection, and what stands in for it is cheaper and
 * honest about being a schematic: pick one, and the preview beside the rail
 * re-renders in place with their real words and photographs a moment later.
 *
 * Plain shapes in `currentColor` at three opacities (ink, mid, faint), so they
 * sit right in any rail and in a dark one.
 */

const INK = 0.85;
const MID = 0.45;
const FAINT = 0.18;

const rect = (x: number, y: number, w: number, h: number, o = MID, key?: string) => (
  <rect key={key ?? `${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} rx="1" fill="currentColor" opacity={o} />
);
const lines = (x: number, y: number, w: number, count: number, gap = 4, o = MID) =>
  Array.from({ length: count }, (_, i) => rect(x, y + i * gap, i === count - 1 ? w * 0.65 : w, 1.6, o, `l${x}-${y}-${i}`));

const GLYPHS: Record<string, ReactNode> = {
  // hero
  "hero.full": (
    <>
      {rect(2, 2, 44, 28, FAINT)}
      {rect(8, 18, 22, 4, INK)}
      {rect(8, 24, 14, 1.6, MID)}
    </>
  ),
  "hero.framed": (
    <>
      <rect x="6" y="2" width="36" height="17" rx="1" fill="none" stroke="currentColor" opacity={MID} />
      {rect(8.5, 4.5, 31, 12, FAINT)}
      {rect(15, 23, 18, 3.4, INK)}
      {rect(19, 28, 10, 1.4, MID)}
    </>
  ),
  "hero.split": (
    <>
      {rect(2, 3, 20, 26, FAINT)}
      {rect(27, 11, 16, 4, INK)}
      {rect(27, 18, 11, 1.6, MID)}
      {rect(27, 22, 14, 1.6, MID)}
    </>
  ),
  "hero.type": (
    <>
      {rect(10, 9, 28, 5, INK)}
      {rect(15, 17, 18, 1.6, MID)}
      {rect(18, 21, 12, 1.6, MID)}
    </>
  ),
  // the weekend
  "schedule.list": (
    <>
      {[3, 12, 21].map((y) => (
        <g key={y}>
          {rect(3, y, 8, 1.6, MID)}
          {rect(15, y, 24, 3, INK)}
          {rect(15, y + 4.5, 18, 1.4, MID)}
        </g>
      ))}
    </>
  ),
  "schedule.timeline": (
    <>
      {rect(8.2, 3, 1, 26, FAINT)}
      {[4, 13, 22].map((y) => (
        <g key={y}>
          <circle cx="8.7" cy={y + 1.5} r="2.2" fill="none" stroke="currentColor" opacity={INK} />
          {rect(15, y, 22, 3, INK)}
          {rect(15, y + 4.5, 15, 1.4, MID)}
        </g>
      ))}
    </>
  ),
  "schedule.cards": (
    <>
      {[
        [3, 3],
        [25, 3],
        [3, 17],
        [25, 17],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="20" height="12" rx="1" fill="none" stroke="currentColor" opacity={MID} />
          {rect(x! + 3, y! + 3, 11, 2.4, INK)}
          {rect(x! + 3, y! + 7, 8, 1.4, MID)}
        </g>
      ))}
    </>
  ),
  // our story
  "story.prose": <>{lines(4, 4, 40, 6, 4.2)}</>,
  "story.milestones": (
    <>
      {[4, 13, 22].map((y) => (
        <g key={y}>
          {rect(4, y, 10, 5, INK)}
          {rect(20, y, 22, 2.2, INK)}
          {rect(20, y + 4, 16, 1.4, MID)}
        </g>
      ))}
    </>
  ),
  "story.magazine": (
    <>
      {rect(4, 4, 38, 3.6, INK)}
      {rect(4, 10, 26, 3.6, INK)}
      {lines(4, 18, 18, 3, 4)}
      {lines(26, 18, 18, 3, 4)}
    </>
  ),
  // the gallery
  "gallery.grid": (
    <>
      {[3, 17, 31].flatMap((x) => [3, 17].map((y) => rect(x, y, 13, 12, FAINT + 0.1, `${x}${y}`)))}
    </>
  ),
  "gallery.masonry": (
    <>
      {rect(3, 3, 13, 11, FAINT + 0.1)}
      {rect(3, 17, 13, 12, FAINT + 0.1)}
      {rect(18, 3, 13, 17, FAINT + 0.1)}
      {rect(18, 23, 13, 6, FAINT + 0.1)}
      {rect(33, 3, 12, 8, FAINT + 0.1)}
      {rect(33, 14, 12, 15, FAINT + 0.1)}
    </>
  ),
  "gallery.filmstrip": (
    <>
      {rect(3, 6, 17, 20, FAINT + 0.1)}
      {rect(23, 6, 17, 20, FAINT + 0.1)}
      {rect(43, 6, 8, 20, FAINT + 0.1)}
    </>
  ),
  // the reply
  "rsvp.inline": (
    <>
      {rect(4, 4, 24, 3, INK)}
      {rect(4, 10, 40, 1.6, MID)}
      {rect(4, 14, 40, 1.6, MID)}
      {rect(4, 20, 13, 6, INK)}
      {rect(20, 20, 13, 6, FAINT + 0.1)}
    </>
  ),
  "rsvp.card": (
    <>
      <rect x="3" y="3" width="42" height="26" rx="1" fill="none" stroke="currentColor" opacity={MID} />
      {rect(7, 8, 14, 1.6, MID)}
      {rect(30, 8, 11, 1.6, MID)}
      {rect(7, 12, 34, 1, FAINT + 0.1)}
      {rect(7, 12, 18, 1, INK)}
      {rect(7, 18, 34, 2.4, FAINT + 0.1)}
      {rect(7, 23, 14, 3.6, INK)}
    </>
  ),
};

export function LookGlyph({ type, look }: { type: BlockType; look: string }) {
  const glyph = GLYPHS[`${type}.${look}`];
  if (!glyph) return null;
  return (
    <svg viewBox="0 0 48 32" className="h-8 w-12 text-ink" aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  );
}
