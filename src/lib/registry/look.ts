import { validatePalette, type PaletteTokens } from "@/lib/theme/contrast";

/**
 * The registry's own look (spec 36 Q7a, option b).
 *
 * Deliberately NOT the site's theme: the registry is a page you send to people
 * who may never have seen the invitation, and the planner chose a handful of
 * palettes and type pairings of its own. They are closed lists, so what is
 * stored is an id and a stylesheet never receives a colour from the database;
 * a new palette is a row here, not a migration.
 *
 * Every palette must pass the same contrast gate the site's do
 * (`validatePalette`), and `look.test.ts` asserts it for all of them, so a
 * registry can't be unreadable on a phone in a shop doorway.
 */

export type RegistryPaletteId = "linen" | "sage" | "blush" | "ink" | "terracotta" | "sea";

export const REGISTRY_PALETTES: Record<RegistryPaletteId, { label: string; tokens: PaletteTokens }> = {
  linen: {
    label: "Linen",
    tokens: { ink: "#2b2724", paper: "#faf6ee", muted: "#675e55", line: "#e4dccd", accent: "#7a5c3c" },
  },
  sage: {
    label: "Sage",
    tokens: { ink: "#222a25", paper: "#f4f7f1", muted: "#58645a", line: "#d9e1d5", accent: "#44664c" },
  },
  blush: {
    label: "Blush",
    tokens: { ink: "#2e2224", paper: "#fcf4f2", muted: "#6c5558", line: "#efd9d6", accent: "#9a4455" },
  },
  ink: {
    label: "Ink",
    tokens: { ink: "#18181b", paper: "#ffffff", muted: "#585860", line: "#e4e4e7", accent: "#27272a" },
  },
  terracotta: {
    label: "Terracotta",
    tokens: { ink: "#2d221c", paper: "#fbf3ec", muted: "#6d5a4d", line: "#ecd8c8", accent: "#a2492a" },
  },
  sea: {
    label: "Sea",
    tokens: { ink: "#1c2a2e", paper: "#f2f8f8", muted: "#55696d", line: "#d3e3e4", accent: "#27626d" },
  },
};

export const REGISTRY_PALETTE_IDS = Object.keys(REGISTRY_PALETTES) as RegistryPaletteId[];
export const DEFAULT_REGISTRY_PALETTE: RegistryPaletteId = "linen";

export function isRegistryPalette(value: unknown): value is RegistryPaletteId {
  return typeof value === "string" && Object.hasOwn(REGISTRY_PALETTES, value);
}

/** An unknown id (a palette removed since it was saved) falls back, never throws. */
export function resolvePalette(id: string | null | undefined): { id: RegistryPaletteId; tokens: PaletteTokens } {
  const resolved = isRegistryPalette(id) ? id : DEFAULT_REGISTRY_PALETTE;
  return { id: resolved, tokens: REGISTRY_PALETTES[resolved].tokens };
}

export function paletteProblems(id: RegistryPaletteId): string[] {
  return validatePalette(REGISTRY_PALETTES[id].tokens).failures;
}

/**
 * Faces come from the three already self-hosted (src/lib/fonts). A pairing
 * names which plays display and which plays body; nothing here adds a face,
 * so switching costs no bytes and never asks for a font that wasn't loaded.
 */
export type RegistryFace = "fraunces" | "garamond" | "inter";
export type RegistryPairingId = "classic" | "modern" | "bookish";

export const REGISTRY_PAIRINGS: Record<
  RegistryPairingId,
  { label: string; blurb: string; display: RegistryFace; body: RegistryFace }
> = {
  classic: { label: "Classic", blurb: "Fraunces headings, Garamond text", display: "fraunces", body: "garamond" },
  modern: { label: "Modern", blurb: "Fraunces headings, Inter text", display: "fraunces", body: "inter" },
  bookish: { label: "Bookish", blurb: "Garamond headings, Inter text", display: "garamond", body: "inter" },
};

export const REGISTRY_PAIRING_IDS = Object.keys(REGISTRY_PAIRINGS) as RegistryPairingId[];
export const DEFAULT_REGISTRY_PAIRING: RegistryPairingId = "classic";

export function isRegistryPairing(value: unknown): value is RegistryPairingId {
  return typeof value === "string" && Object.hasOwn(REGISTRY_PAIRINGS, value);
}

export function resolvePairing(id: string | null | undefined): RegistryPairingId {
  return isRegistryPairing(id) ? id : DEFAULT_REGISTRY_PAIRING;
}

/** The custom properties a registry root needs for colour; fonts are added by the page (they need the loaded faces). */
export function registryColourVars(id: string | null | undefined): Record<string, string> {
  const { tokens } = resolvePalette(id);
  return {
    "--r-ink": tokens.ink,
    "--r-paper": tokens.paper,
    "--r-muted": tokens.muted,
    "--r-line": tokens.line,
    "--r-accent": tokens.accent,
  };
}
