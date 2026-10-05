import type { BlockType } from "./blocks";

/**
 * Looks: a curated alternate layout for a block (spec 27 E1).
 *
 * "Plug and play" means pick a Look and it works — never "write CSS". A Look is
 * a layout somebody has designed, looked at in every palette, and would put
 * their name to; the planner chooses between a handful, and none of them can
 * produce an unreadable page. That is spec 23 §7's rule ("a builder that can
 * produce an unreadable page has failed at the thing it was bought for") kept,
 * not bent.
 *
 * Stored as `site_blocks.style.variant`. A block with no `variant` renders as it
 * always did, so every existing site is untouched, and an unknown or stale
 * value falls back to the default rather than rendering nothing: a revision
 * published by a version of this app that offered a Look this one does not must
 * still draw a page.
 *
 * **The hero's default is the theme's.** The theme has always chosen a hero
 * style (full, framed, type); a block with no Look follows it, so changing the
 * theme still changes every hero that has not been told otherwise.
 */

export type Look = { id: string; label: string; description: string };

type LookSet = {
  /** The Look a block has when it has not chosen. `null` means "follow the theme". */
  fallback: string | null;
  looks: readonly Look[];
};

export const LOOKS: Partial<Record<BlockType, LookSet>> = {
  hero: {
    fallback: null,
    looks: [
      { id: "full", label: "Full-bleed", description: "Your photograph edge to edge, the names set over it." },
      { id: "framed", label: "Framed", description: "The photograph in a bordered frame, the names beneath." },
      { id: "split", label: "Split", description: "The photograph beside the names." },
      { id: "type", label: "Type only", description: "Just your names, set large." },
    ],
  },
  schedule: {
    fallback: "list",
    looks: [
      { id: "list", label: "List", description: "Each event as a row, grouped by day." },
      { id: "timeline", label: "Timeline", description: "A line runs down the page through the day." },
      { id: "cards", label: "Cards", description: "Each event on a card of its own." },
    ],
  },
  story: {
    fallback: "prose",
    looks: [
      { id: "prose", label: "Prose", description: "Your story, then the milestones beneath." },
      { id: "milestones", label: "Milestones", description: "The dates lead, in large numerals." },
      { id: "magazine", label: "Magazine", description: "A pull-quote opens it; the rest sets in columns." },
    ],
  },
  gallery: {
    fallback: "grid",
    looks: [
      { id: "grid", label: "Grid", description: "Even tiles, a clean block of photographs." },
      { id: "masonry", label: "Masonry", description: "Each photograph at its own proportions." },
      { id: "filmstrip", label: "Filmstrip", description: "A row to swipe through." },
    ],
  },
  rsvp: {
    fallback: "inline",
    looks: [
      { id: "inline", label: "Inline", description: "The reply form as it is." },
      { id: "card", label: "Card", description: "A single card that shows how far along they are." },
    ],
  },
};

/** The Looks a block offers; none for most blocks. */
export function looksFor(type: BlockType): readonly Look[] {
  return LOOKS[type]?.looks ?? [];
}

export function isLook(type: BlockType, id: unknown): id is string {
  return typeof id === "string" && looksFor(type).some((look) => look.id === id);
}

/**
 * The Look to draw: the block's own if it is one this app knows, else the
 * block's default, else (for a block that follows something external, the hero's
 * theme) whatever `themeDefault` says.
 */
export function resolveLook(type: BlockType, variant: unknown, themeDefault?: string): string {
  if (isLook(type, variant)) return variant;
  const set = LOOKS[type];
  if (!set) return "";
  return set.fallback ?? (isLook(type, themeDefault) ? themeDefault : (set.looks[0]?.id ?? ""));
}

// ---------------------------------------------------------------------------
// How a block arrives (spec 27 E4)
// ---------------------------------------------------------------------------

export const ENTRANCES = ["rise", "fade", "reveal", "none"] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const ENTRANCE_LABEL: Record<Entrance, string> = {
  rise: "Rise",
  fade: "Fade",
  reveal: "Reveal",
  none: "Stay still",
};

/** A block with no entrance chosen matches the page; this is for the renderer. */
export function resolveEntrance(value: unknown): Entrance | null {
  return (ENTRANCES as readonly unknown[]).includes(value) ? (value as Entrance) : null;
}
