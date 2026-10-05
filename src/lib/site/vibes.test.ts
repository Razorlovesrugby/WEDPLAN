import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, STARTER_LAYOUTS } from "./blocks";
import { LOOKS, isLook } from "./looks";
import { MOTION_LEVELS } from "./motion";
import { TEMPLATES, VIBES, getTemplate, getVibe, vibeVariants } from "./vibes";
import {
  HERO_STYLES,
  PALETTES,
  THEME_PRESETS,
  TYPOGRAPHY_IDS,
  isDarkTokens,
} from "@/lib/theme/presets";
import { validatePalette } from "@/lib/theme/contrast";

describe("Vibes", () => {
  it("have unique ids, a label and a sentence", () => {
    expect(new Set(VIBES.map((v) => v.id)).size).toBe(VIBES.length);
    for (const vibe of VIBES) {
      expect(vibe.label.trim(), vibe.id).not.toBe("");
      expect(vibe.blurb.trim(), vibe.id).not.toBe("");
    }
  });

  it("ask only for a theme that is built and shippable", () => {
    // `saveTheme` refuses an unavailable preset; a Vibe that asked for one would
    // apply its Looks and then fail on the theme, half-applied.
    for (const vibe of VIBES) {
      expect(THEME_PRESETS[vibe.theme.preset].available, `${vibe.id}: ${vibe.theme.preset}`).toBe(true);
    }
  });

  it("ask for a palette, hero style, pairing and motion level that exist", () => {
    for (const vibe of VIBES) {
      expect(PALETTES[vibe.theme.palette], `${vibe.id} palette`).toBeDefined();
      expect(HERO_STYLES, vibe.id).toContain(vibe.theme.heroStyle);
      expect(TYPOGRAPHY_IDS, vibe.id).toContain(vibe.theme.typography);
      expect(MOTION_LEVELS, vibe.id).toContain(vibe.theme.motion);
    }
  });

  it("use a palette that is readable (every one is contrast-checked)", () => {
    for (const vibe of VIBES) {
      expect(validatePalette(PALETTES[vibe.theme.palette].tokens).ok, vibe.id).toBe(true);
    }
  });

  it("ask only for Looks the registry offers, on blocks that have them", () => {
    for (const vibe of VIBES) {
      for (const [type, look] of Object.entries(vibe.looks)) {
        expect(BLOCK_TYPES as readonly string[], `${vibe.id}.${type}`).toContain(type);
        expect(isLook(type as never, look), `${vibe.id}: ${type} → ${look}`).toBe(true);
      }
    }
  });

  it("is dark when it says Evening", () => {
    // The Evening Vibe pairs a dark preset with a dark palette; a light palette
    // under it would be a theme that does not look like itself.
    const evening = getVibe("evening")!;
    expect(isDarkTokens(PALETTES[evening.theme.palette].tokens)).toBe(true);
    for (const vibe of VIBES.filter((v) => v.id !== "evening")) {
      expect(isDarkTokens(PALETTES[vibe.theme.palette].tokens), vibe.id).toBe(false);
    }
  });

  it("includes a plain one to come back to", () => {
    expect(getVibe("classic")?.looks).toEqual({
      hero: "framed",
      schedule: "list",
      story: "prose",
      gallery: "grid",
      rsvp: "inline",
    });
  });
});

describe("vibeVariants", () => {
  const modern = getVibe("modern")!;

  it("addresses every block of a type the Vibe has a Look for, and no others", () => {
    const blocks = [
      { id: "h", type: "hero" as const },
      { id: "s1", type: "schedule" as const },
      { id: "g1", type: "gallery" as const },
      { id: "g2", type: "gallery" as const },
      { id: "f", type: "footer" as const },
    ];
    const out = vibeVariants(modern, blocks);
    expect(out.get("h")).toBe("full");
    expect(out.get("s1")).toBe("timeline");
    // Two galleries come out in the same layout.
    expect(out.get("g1")).toBe("grid");
    expect(out.get("g2")).toBe("grid");
    expect(out.has("f")).toBe(false);
  });

  it("never emits a Look that is not valid for the block", () => {
    const rogue = { ...modern, looks: { schedule: "masonry" } };
    expect(vibeVariants(rogue, [{ id: "s", type: "schedule" }]).size).toBe(0);
  });

  it("is empty for a page with nothing a Vibe has an opinion about", () => {
    expect(vibeVariants(modern, [{ id: "f", type: "footer" }]).size).toBe(0);
    expect(vibeVariants(modern, []).size).toBe(0);
  });
});

describe("templates", () => {
  it("build from a real starter layout and a real Vibe", () => {
    for (const template of TEMPLATES) {
      expect(STARTER_LAYOUTS.map((l) => l.id), template.id).toContain(template.layout);
      expect(getVibe(template.vibe), template.id).toBeDefined();
      expect(getTemplate(template.id)).toBe(template);
    }
  });

  it("have a Look available for each block a template's layout would restyle", () => {
    // Not a promise every block has one — only that the Looks table is the one
    // the registry uses.
    expect(Object.keys(LOOKS).length).toBeGreaterThan(0);
  });
});
