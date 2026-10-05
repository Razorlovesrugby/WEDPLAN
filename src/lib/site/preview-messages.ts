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
  | { channel: typeof PREVIEW_CHANNEL; type: "scroll-to"; blockId: string };

export type FromPreview = { channel: typeof PREVIEW_CHANNEL; type: "select"; blockId: string };

export function isToPreview(value: unknown): value is ToPreview {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message["channel"] !== PREVIEW_CHANNEL) return false;
  if (message["type"] === "refresh") return true;
  return message["type"] === "scroll-to" && typeof message["blockId"] === "string";
}

export function isFromPreview(value: unknown): value is FromPreview {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message["channel"] === PREVIEW_CHANNEL &&
    message["type"] === "select" &&
    typeof message["blockId"] === "string"
  );
}
