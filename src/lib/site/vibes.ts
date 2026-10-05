import type { BlockType, SiteBlock } from "./blocks";
import { isLook } from "./looks";
import type { MotionLevel } from "./motion";
import type { HeroStyle, PaletteId, ThemePresetId, TypographyId } from "@/lib/theme/presets";

/**
 * Vibes and page templates (spec 27 E3).
 *
 * A **Vibe** is a whole feeling in one click: a theme, a palette, a type
 * pairing, a motion level and a Look for each block that has Looks. Applied to an
 * existing site it **restyles and never rewrites**: palette, type, motion and
 * Looks change; blocks, words and photographs do not. That is the whole promise,
 * and the reason it is safe to offer as one click (with an undo — see
 * `StyleSnapshot` in `actions/site-vibes.ts`).
 *
 * A **template** is a starting page: a Vibe applied to one of the starter
 * layouts, so the first screen of the builder is a choice between three finished
 * pages and not three arrangements of grey blocks.
 *
 * Pure data and functions here — which Vibe says what, and which blocks it would
 * touch — so a test can check every Vibe against the real registries (themes,
 * palettes, Looks) and a typo cannot ship a Vibe that asks for a Look that does
 * not exist.
 */

export type Vibe = {
  id: string;
  label: string;
  blurb: string;
  theme: {
    preset: ThemePresetId;
    palette: PaletteId;
    heroStyle: HeroStyle;
    typography: TypographyId;
    motion: MotionLevel;
    monogram: boolean;
  };
  /** The Look for each kind of block this Vibe has an opinion about. */
  looks: Partial<Record<BlockType, string>>;
};

export const VIBES: readonly Vibe[] = [
  {
    id: "classic",
    label: "Classic",
    blurb: "Script type, ivory and a framed photograph. The plain, traditional page.",
    theme: {
      preset: "script",
      palette: "ivory",
      heroStyle: "framed",
      typography: "fraunces_garamond",
      motion: "gentle",
      monogram: true,
    },
    looks: { hero: "framed", schedule: "list", story: "prose", gallery: "grid", rsvp: "inline" },
  },
  {
    id: "garden",
    label: "Garden party",
    blurb: "Soft and sunlit: sage, script names, each event on a card, photographs left as they fell.",
    theme: {
      preset: "script",
      palette: "sage",
      heroStyle: "framed",
      typography: "fraunces_garamond",
      motion: "gentle",
      monogram: true,
    },
    looks: { hero: "split", schedule: "cards", story: "prose", gallery: "masonry", rsvp: "card" },
  },
  {
    id: "modern",
    label: "Modern",
    blurb: "Editorial and quiet: large type, a timeline through the day, a magazine story.",
    theme: {
      preset: "editorial",
      palette: "slate",
      heroStyle: "full",
      typography: "garamond_inter",
      motion: "gentle",
      monogram: false,
    },
    looks: { hero: "full", schedule: "timeline", story: "magazine", gallery: "grid", rsvp: "card" },
  },
  {
    id: "evening",
    label: "Evening",
    blurb: "Candlelit: a dark ground, italic type and gold. For a wedding that happens after dark.",
    theme: {
      preset: "evening",
      palette: "midnight",
      heroStyle: "full",
      typography: "fraunces_garamond",
      motion: "cinematic",
      monogram: false,
    },
    looks: { hero: "full", schedule: "timeline", story: "milestones", gallery: "filmstrip", rsvp: "card" },
  },
];

export function getVibe(id: string): Vibe | undefined {
  return VIBES.find((vibe) => vibe.id === id);
}

/**
 * The `style.variant` this Vibe wants on each of the page's blocks, by block id.
 *
 * Only blocks whose type the Vibe has a Look for, and only a Look that is valid
 * for that type — a Vibe written against a registry that has since moved gets the
 * blocks it can still address and nothing else, never a bad value in a row.
 * Every block of a type is restyled, not only the first: two galleries on a page
 * should not come out in two different layouts.
 */
export function vibeVariants(vibe: Vibe, blocks: Pick<SiteBlock, "id" | "type">[]): Map<string, string> {
  const wanted = new Map<string, string>();
  for (const block of blocks) {
    const look = vibe.looks[block.type];
    if (look !== undefined && isLook(block.type, look)) wanted.set(block.id, look);
  }
  return wanted;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type Template = {
  id: string;
  label: string;
  blurb: string;
  /** Which starter layout it builds the page from (`STARTER_LAYOUTS`). */
  layout: string;
  vibe: string;
};

export const TEMPLATES: readonly Template[] = [
  {
    id: "garden-party",
    label: "Garden party",
    blurb: "The usual order, in soft sage, with the weekend on cards.",
    layout: "classic",
    vibe: "garden",
  },
  {
    id: "modern",
    label: "Modern",
    blurb: "Photo-led and quiet, with a timeline through the day.",
    layout: "photo_led",
    vibe: "modern",
  },
  {
    id: "evening",
    label: "Evening",
    blurb: "A short page for a small wedding, on a dark ground.",
    layout: "short",
    vibe: "evening",
  },
];

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
