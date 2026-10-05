import { describe, expect, it } from "vitest";
import {
  PREVIEW_CHANNEL,
  insertionAfter,
  insertionLineY,
  isFromPreview,
  isToPreview,
  type BlockRect,
} from "./preview-messages";

const msg = (over: Record<string, unknown>) => ({ channel: PREVIEW_CHANNEL, ...over });

describe("isToPreview", () => {
  it("accepts every instruction the builder sends", () => {
    expect(isToPreview(msg({ type: "refresh" }))).toBe(true);
    expect(isToPreview(msg({ type: "measure" }))).toBe(true);
    expect(isToPreview(msg({ type: "scroll-to", blockId: "b1" }))).toBe(true);
    expect(isToPreview(msg({ type: "highlight", blockId: "b1" }))).toBe(true);
    expect(isToPreview(msg({ type: "highlight", blockId: null }))).toBe(true);
  });

  it("refuses anything from another channel, or malformed", () => {
    expect(isToPreview({ type: "refresh" })).toBe(false);
    expect(isToPreview({ channel: "other", type: "refresh" })).toBe(false);
    expect(isToPreview(msg({ type: "scroll-to" }))).toBe(false);
    expect(isToPreview(msg({ type: "highlight", blockId: 4 }))).toBe(false);
    expect(isToPreview(msg({ type: "eval", code: "1" }))).toBe(false);
    for (const junk of [null, undefined, "refresh", 4, []]) expect(isToPreview(junk)).toBe(false);
  });
});

describe("isFromPreview", () => {
  it("accepts a selection and a measurement", () => {
    expect(isFromPreview(msg({ type: "select", blockId: "b1" }))).toBe(true);
    // A click on the title says so, so the builder can focus the Title field.
    expect(isFromPreview(msg({ type: "select", blockId: "b1", field: "heading" }))).toBe(true);
    expect(isFromPreview(msg({ type: "select", blockId: "b1", field: "anything-else" }))).toBe(false);
    expect(
      isFromPreview(msg({ type: "rects", scrollY: 40, blocks: [{ id: "a", top: 0, bottom: 100 }] })),
    ).toBe(true);
  });

  it("refuses a measurement with a malformed block", () => {
    expect(isFromPreview(msg({ type: "rects", scrollY: 0, blocks: [{ id: "a", top: "0", bottom: 1 }] }))).toBe(false);
    expect(isFromPreview(msg({ type: "rects", scrollY: 0, blocks: "x" }))).toBe(false);
    expect(isFromPreview(msg({ type: "rects", blocks: [] }))).toBe(false);
  });
});

describe("insertionAfter", () => {
  const blocks: BlockRect[] = [
    { id: "hero", top: 0, bottom: 600 },
    { id: "story", top: 600, bottom: 1000 },
    { id: "faq", top: 1000, bottom: 1400 },
  ];

  it("is the very top above the first block's midpoint", () => {
    expect(insertionAfter(blocks, 10)).toBeNull();
    expect(insertionAfter(blocks, 299)).toBeNull();
  });

  it("puts the new block after a block once the pointer passes its midpoint", () => {
    expect(insertionAfter(blocks, 301)).toBe("hero");
    expect(insertionAfter(blocks, 799)).toBe("hero");
    expect(insertionAfter(blocks, 801)).toBe("story");
  });

  it("is the last block below everything", () => {
    expect(insertionAfter(blocks, 5000)).toBe("faq");
  });

  it("does not depend on the order the rectangles arrive in", () => {
    expect(insertionAfter([...blocks].reverse(), 801)).toBe("story");
  });

  it("is null for an empty page", () => {
    expect(insertionAfter([], 100)).toBeNull();
  });
});

describe("insertionLineY", () => {
  const blocks: BlockRect[] = [
    { id: "a", top: 0, bottom: 400 },
    { id: "b", top: 400, bottom: 900 },
  ];

  it("is the foot of the block it follows, or the top of the page", () => {
    expect(insertionLineY(blocks, "a")).toBe(400);
    expect(insertionLineY(blocks, "b")).toBe(900);
    expect(insertionLineY(blocks, null)).toBe(0);
    expect(insertionLineY(blocks, "gone")).toBe(0);
  });
});
