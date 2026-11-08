import { describe, expect, it } from "vitest";
import {
  REGISTRY_PAIRING_IDS,
  REGISTRY_PALETTE_IDS,
  REGISTRY_PALETTES,
  paletteProblems,
  pairingForTypography,
  registryColourVars,
  registryLook,
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

describe("following the invitation's look (spec 44)", () => {
  const invitation = {
    tokens: { ink: "#101010", paper: "#fefefe", muted: "#555555", line: "#dddddd", accent: "#123456" },
    typography: "garamond_inter",
  };

  it("with the switch off, renders exactly as before", () => {
    const look = registryLook({ palette: "sage", type_pairing: "modern", use_site_theme: false }, invitation);
    expect(look.colourVars).toEqual(registryColourVars("sage"));
    expect(look.pairing).toBe("modern");
  });

  it("treats a missing switch (a row from before 0046) as off", () => {
    expect(registryLook({ palette: "sea", type_pairing: "classic" }, invitation).colourVars).toEqual(registryColourVars("sea"));
  });

  it("with the switch on, takes the invitation's colours and nearest pairing", () => {
    const look = registryLook({ palette: "sage", type_pairing: "modern", use_site_theme: true }, invitation);
    expect(look.colourVars["--site-accent"]).toBe(toRgbChannelsForTest("#123456"));
    expect(look.pairing).toBe("bookish");
    expect(pairingForTypography("fraunces_garamond")).toBe("classic");
    expect(pairingForTypography("something-new")).toBe("classic");
  });

  it("falls back to its own look if the invitation's can't be read", () => {
    const look = registryLook({ palette: "blush", type_pairing: "bookish", use_site_theme: true }, null);
    expect(look.colourVars).toEqual(registryColourVars("blush"));
    expect(look.pairing).toBe("bookish");
  });
});

function toRgbChannelsForTest(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
