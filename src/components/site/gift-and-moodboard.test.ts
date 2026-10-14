import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Source guards for the small changes in spec 31 that are about *which classes a
 * component uses* rather than logic: the repo pins that kind of thing with a
 * read of the source (see `unable-to-attend.test.ts`).
 */
describe("gift section text (spec 31 §3.8, Q11)", () => {
  const source = read("src/components/site/gift-funds.tsx");

  it("sets a gift's description as ordinary Body text, not the schedule's italic detail line", () => {
    const blurb = source.split("\n").find((line) => line.includes("fund.blurb ?")) ?? "";
    expect(blurb).toContain("site-body");
    expect(blurb).not.toContain("italic");
    expect(blurb).not.toContain("site-event-detail");
    expect(blurb).not.toContain("text-muted");
  });
});

describe("gift bank details (spec 31 §3.9, Q16)", () => {
  it("no longer asks guests for a per-household reference anywhere", () => {
    for (const path of [
      "src/components/site/contribute-dialog.tsx",
      "src/components/site/gift-funds.tsx",
      "src/components/site/editor/gift-fund-editor.tsx",
      "src/lib/site/bank-account.ts",
    ]) {
      expect(read(path), path).not.toMatch(/giftReference|label: "Reference"|Reference:/);
    }
  });
});

describe("mood board rename (spec 31 §3.10)", () => {
  const header = read("src/components/moodboards/board-header.tsx");

  it("uses the shared inline editor and has an explicit Rename control", () => {
    expect(header).toContain("InlineText");
    expect(header).toContain("Rename");
  });

  it("only saves the description when it changed", () => {
    expect(header).toMatch(/description\.trim\(\) === \(board\.description \?\? ""\)/);
  });
});
