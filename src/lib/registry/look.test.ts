import { describe, expect, it } from "vitest";
import {
  REGISTRY_PAIRING_IDS,
  REGISTRY_PALETTE_IDS,
  REGISTRY_PALETTES,
  paletteProblems,
  registryColourVars,
  resolvePairing,
  resolvePalette,
} from "./look";

describe("registry palettes", () => {
  it.each(REGISTRY_PALETTE_IDS)("%s passes the same contrast gate the site's palettes do", (id) => {
    expect(paletteProblems(id)).toEqual([]);
  });

  it("offers six, each with its own five tokens", () => {
    expect(REGISTRY_PALETTE_IDS).toHaveLength(6);
    for (const id of REGISTRY_PALETTE_IDS) {
      expect(Object.keys(REGISTRY_PALETTES[id].tokens).sort()).toEqual(["accent", "ink", "line", "muted", "paper"]);
    }
  });

  it("falls back to the default for an id that no longer exists, rather than throwing", () => {
    expect(resolvePalette("neon").id).toBe("linen");
    expect(resolvePalette(null).id).toBe("linen");
    expect(resolvePalette("sage").id).toBe("sage");
  });

  it("does not treat Object.prototype names as palettes", () => {
    expect(resolvePalette("constructor").id).toBe("linen");
    expect(resolvePairing("toString")).toBe("classic");
  });

  it("emits the site's own channel variables, from the closed list only", () => {
    const vars = registryColourVars("blush");
    expect(Object.keys(vars).sort()).toEqual(["--site-accent", "--site-ink", "--site-line", "--site-muted", "--site-paper"]);
    for (const value of Object.values(vars)) expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
  it("gives an unknown palette the default's colours rather than nothing", () => {
    expect(registryColourVars("neon")).toEqual(registryColourVars("linen"));
  });
});

describe("registry pairings", () => {
  it("offers three, and an unknown one falls back", () => {
    expect(REGISTRY_PAIRING_IDS).toHaveLength(3);
    expect(resolvePairing("comic")).toBe("classic");
    expect(resolvePairing("bookish")).toBe("bookish");
  });
});
