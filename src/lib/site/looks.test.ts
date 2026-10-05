import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, BLOCKS } from "./blocks";
import {
  ENTRANCES,
  ENTRANCE_LABEL,
  LOOKS,
  isLook,
  looksFor,
  resolveEntrance,
  resolveLook,
} from "./looks";

describe("the Look registry", () => {
  it("only offers Looks for block types that exist", () => {
    for (const type of Object.keys(LOOKS)) expect(BLOCK_TYPES as readonly string[]).toContain(type);
  });

  it("covers the five blocks the spec chose, three Looks each, four for the hero", () => {
    expect(Object.keys(LOOKS).sort()).toEqual(["gallery", "hero", "rsvp", "schedule", "story"]);
    expect(looksFor("hero")).toHaveLength(4);
    expect(looksFor("schedule")).toHaveLength(3);
    expect(looksFor("story")).toHaveLength(3);
    expect(looksFor("gallery")).toHaveLength(3);
    expect(looksFor("rsvp")).toHaveLength(2);
  });

  it("gives every Look a unique id, a label and a sentence", () => {
    for (const [type, set] of Object.entries(LOOKS)) {
      const ids = set!.looks.map((look) => look.id);
      expect(new Set(ids).size, type).toBe(ids.length);
      for (const look of set!.looks) {
        expect(look.label.trim(), `${type}.${look.id}`).not.toBe("");
        expect(look.description.trim(), `${type}.${look.id}`).not.toBe("");
      }
    }
  });

  it("has a default that is one of its own Looks (or follows the theme)", () => {
    for (const [type, set] of Object.entries(LOOKS)) {
      if (set!.fallback !== null) {
        expect(set!.looks.map((look) => look.id), type).toContain(set!.fallback);
      }
    }
    expect(LOOKS.hero?.fallback).toBeNull();
  });

  it("offers nothing for a block with no Looks", () => {
    expect(looksFor("footer")).toEqual([]);
    expect(isLook("footer", "grid")).toBe(false);
  });
});

describe("resolveLook", () => {
  it("uses the block's own Look when it is one we know", () => {
    expect(resolveLook("schedule", "timeline")).toBe("timeline");
    expect(resolveLook("gallery", "filmstrip")).toBe("filmstrip");
  });

  it("falls back to the default for nothing, for rubbish, and for another block's Look", () => {
    expect(resolveLook("schedule", undefined)).toBe("list");
    expect(resolveLook("schedule", "carousel")).toBe("list");
    // `masonry` is a gallery Look, not a schedule one.
    expect(resolveLook("schedule", "masonry")).toBe("list");
    expect(resolveLook("rsvp", 4)).toBe("inline");
  });

  it("makes the hero follow the theme until it is told otherwise", () => {
    expect(resolveLook("hero", undefined, "framed")).toBe("framed");
    expect(resolveLook("hero", undefined, "type")).toBe("type");
    expect(resolveLook("hero", "split", "framed")).toBe("split");
  });

  it("never returns nothing for a hero, whatever the theme says", () => {
    expect(resolveLook("hero", undefined, "nonsense")).toBe("full");
    expect(resolveLook("hero", undefined, undefined)).toBe("full");
  });

  it("returns an empty string for a block with no Looks, which no renderer branch matches", () => {
    expect(resolveLook("footer", "grid")).toBe("");
  });
});

describe("entrances", () => {
  it("labels every entrance", () => {
    for (const entrance of ENTRANCES) expect(ENTRANCE_LABEL[entrance].trim()).not.toBe("");
  });

  it("resolves a known one and treats anything else as 'match the page'", () => {
    expect(resolveEntrance("fade")).toBe("fade");
    expect(resolveEntrance("none")).toBe("none");
    expect(resolveEntrance(undefined)).toBeNull();
    expect(resolveEntrance("spin")).toBeNull();
  });
});

describe("blocks that offer a Look", () => {
  it("are all real, renderable block types", () => {
    for (const type of Object.keys(LOOKS)) expect(BLOCKS[type as keyof typeof BLOCKS]).toBeDefined();
  });
});
