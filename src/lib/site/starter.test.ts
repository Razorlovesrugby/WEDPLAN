import { describe, expect, it } from "vitest";
import { BLOCKS, BLOCK_TYPES, type SiteBlock } from "./blocks";
import { BLOCK_SCHEMAS } from "./block-schemas";
import {
  blockSnippet,
  blockStatus,
  blocksNeedingWork,
  sampleLeft,
  starterPayload,
} from "./starter";

const block = (over: Partial<SiteBlock> = {}): SiteBlock => ({
  id: crypto.randomUUID(),
  type: "prose",
  payload: {},
  style: {},
  visible: true,
  audience: "everyone",
  ...over,
});

describe("starterPayload", () => {
  it("passes its own validation for every block type", () => {
    // A starter that fails its own schema is a block that cannot be saved the
    // first time the planner touches it.
    for (const type of BLOCK_TYPES) {
      const parsed = BLOCK_SCHEMAS[type].safeParse(starterPayload(type));
      expect(parsed.success, `${type}: ${JSON.stringify(parsed.success ? null : parsed.error.flatten())}`).toBe(
        true,
      );
    }
  });

  it("hands out a copy, never the table", () => {
    const first = starterPayload("story");
    (first["milestones"] as unknown[]).length = 0;
    expect((starterPayload("story")["milestones"] as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("blockStatus", () => {
  it("calls a freshly added block unfinished", () => {
    expect(blockStatus(block({ type: "story", payload: starterPayload("story") }))).toBe("sample");
    expect(blockStatus(block({ type: "map", payload: starterPayload("map") }))).toBe("sample");
  });

  it("counts one edited word as the planner's own", () => {
    const payload = { ...starterPayload("dress_code"), body: "Black tie." };
    expect(blockStatus(block({ type: "dress_code", payload }))).toBeNull();
  });

  it("is still unfinished while one sample field is left", () => {
    const payload = { ...starterPayload("map"), name: "St Mary's", address: "Church Lane, Bath" };
    // `note` is still the starter's.
    expect(sampleLeft("map", payload)).toEqual(["note"]);
    expect(blockStatus(block({ type: "map", payload }))).toBe("sample");
  });

  it("catches [square brackets] anywhere, in a nested row", () => {
    const payload = { items: [{ q: "Where do I park?", a: "[Say whether cars can be left overnight.]" }] };
    expect(blockStatus(block({ type: "faq", payload }))).toBe("sample");
  });

  it("calls a photo block with no photo blank, not sample", () => {
    expect(blockStatus(block({ type: "photo_band", payload: {} }))).toBe("blank");
    expect(blockStatus(block({ type: "photo_band", payload: { image_id: "x" } }))).toBeNull();
  });

  it("leaves blocks that draw from elsewhere alone", () => {
    for (const type of ["schedule", "rsvp", "travel", "gallery", "hero"] as const) {
      expect(blockStatus(block({ type, payload: {} })), type).toBeNull();
    }
  });

  it("survives a payload that is not an object", () => {
    expect(blockStatus(block({ type: "prose", payload: null }))).toBe("blank");
    expect(blockStatus(block({ type: "prose", payload: "nonsense" }))).toBe("blank");
  });
});

describe("blocksNeedingWork", () => {
  it("skips hidden blocks, which is the way out", () => {
    const blocks = [block({ type: "story", payload: starterPayload("story"), visible: false })];
    expect(blocksNeedingWork(blocks)).toEqual([]);
  });

  it("skips deprecated types", () => {
    expect(BLOCKS.countdown.deprecated).toBe(true);
    expect(blocksNeedingWork([block({ type: "countdown", payload: {} })])).toEqual([]);
  });

  it("names the block and why", () => {
    const [entry] = blocksNeedingWork([block({ type: "map", payload: starterPayload("map") })]);
    expect(entry).toMatchObject({ type: "map", label: "Map", status: "sample" });
  });
});

describe("blockSnippet", () => {
  it("prefers the block's own heading", () => {
    expect(blockSnippet({ payload: { heading: "The church", body: "Long words" } })).toBe("The church");
  });

  it("falls back to the first row of a list", () => {
    expect(blockSnippet({ payload: { items: [{ q: "Can I bring a plus one?" }] } })).toBe(
      "Can I bring a plus one?",
    );
    expect(blockSnippet({ payload: { members: [{ name: "Chidi" }] } })).toBe("Chidi");
  });

  it("truncates to one short line", () => {
    const snippet = blockSnippet({ payload: { body: "a very long paragraph that goes on and on and on" } }, 20);
    expect(snippet).toHaveLength(20);
    expect(snippet?.endsWith("…")).toBe(true);
  });

  it("is null for nothing and for rubbish", () => {
    expect(blockSnippet({ payload: {} })).toBeNull();
    expect(blockSnippet({ payload: null })).toBeNull();
    expect(blockSnippet({ payload: { heading: "   " } })).toBeNull();
  });
});
