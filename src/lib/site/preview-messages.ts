/**
 * The channel between the builder and its preview frame (spec 24 §4, spec 27 E2).
 *
 * One-way to begin with: the builder tells the frame to refresh itself or to
 * scroll to a block, which is what lets an edit show without the frame being
 * destroyed and rebuilt (the old `key` remount threw away scroll position, any
 * open accordion, and the reader's place). The frame answers with a click on a
 * block, which is what click-to-edit needs.
 *
 * Same-origin only, both directions: the receiver checks `event.origin` and
 * `event.source`. Nothing here carries content — an id or a verb.
 */

export const PREVIEW_CHANNEL = "wedplan:site-preview";

export type ToPreview =
  | { channel: typeof PREVIEW_CHANNEL; type: "refresh" }
  | { channel: typeof PREVIEW_CHANNEL; type: "scroll-to"; blockId: string }
  /** Mark one block as the one being edited, or clear it with `null`. */
  | { channel: typeof PREVIEW_CHANNEL; type: "highlight"; blockId: string | null }
  /** Ask where every block is, so a drop can be turned into "after which block". */
  | { channel: typeof PREVIEW_CHANNEL; type: "measure" };

/** A block's vertical extent in the frame's own document, in CSS pixels. */
export type BlockRect = { id: string; top: number; bottom: number };

export type FromPreview =
  /**
   * `field: "heading"` when the click was on the block's title, which the
   * builder answers by focusing that block's Title field (spec 28 §7.2).
   */
  | { channel: typeof PREVIEW_CHANNEL; type: "select"; blockId: string; field?: "heading" }
  | { channel: typeof PREVIEW_CHANNEL; type: "rects"; blocks: BlockRect[]; scrollY: number };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function isToPreview(value: unknown): value is ToPreview {
  const message = record(value);
  if (!message || message["channel"] !== PREVIEW_CHANNEL) return false;
  switch (message["type"]) {
    case "refresh":
    case "measure":
      return true;
    case "scroll-to":
      return typeof message["blockId"] === "string";
    case "highlight":
      return message["blockId"] === null || typeof message["blockId"] === "string";
    default:
      return false;
  }
}

function isRect(value: unknown): value is BlockRect {
  const rect = record(value);
  return (
    rect !== null &&
    typeof rect["id"] === "string" &&
    typeof rect["top"] === "number" &&
    typeof rect["bottom"] === "number"
  );
}

export function isFromPreview(value: unknown): value is FromPreview {
  const message = record(value);
  if (!message || message["channel"] !== PREVIEW_CHANNEL) return false;
  if (message["type"] === "select") {
    return (
      typeof message["blockId"] === "string" &&
      (message["field"] === undefined || message["field"] === "heading")
    );
  }
  return (
    message["type"] === "rects" &&
    typeof message["scrollY"] === "number" &&
    Array.isArray(message["blocks"]) &&
    message["blocks"].every(isRect)
  );
}

/**
 * Which block a drop at `pageY` should go after, given where the blocks are.
 *
 * Null means "at the very top". The block whose vertical midpoint is above the
 * pointer is the one the new block follows, so dropping on the upper half of a
 * block puts the new one before it and the lower half puts it after — the same
 * rule every sortable list uses, and the one the insertion line shows.
 *
 * Pure, so the geometry is tested rather than judged by eye.
 */
export function insertionAfter(blocks: BlockRect[], pageY: number): string | null {
  let after: string | null = null;
  for (const block of [...blocks].sort((a, b) => a.top - b.top)) {
    if ((block.top + block.bottom) / 2 <= pageY) after = block.id;
  }
  return after;
}

/**
 * Where to draw the insertion line, in the frame's page coordinates: the foot
 * of the block it follows, or the top of the page.
 */
export function insertionLineY(blocks: BlockRect[], afterId: string | null): number {
  if (afterId === null) return 0;
  return blocks.find((block) => block.id === afterId)?.bottom ?? 0;
}
