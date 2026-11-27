/**
 * The Library (spec 57 A.3): the to-scale tiles the couple drags or clicks
 * onto a space. Pure — the panel, the Show layers and the tests share it.
 */

import type { SeatingCustomItemRow, SeatingMarqueeRow } from "@/lib/types/database";
import { FIXTURE_DEFAULTS } from "./geometry";
import type { PlaceItem } from "./tools";

export type LibraryGroup = "tables" | "room" | "decor" | "outdoors";

export const GROUP_LABEL: Record<LibraryGroup, string> = {
  tables: "Tables",
  room: "Room",
  decor: "Flowers & décor",
  outdoors: "Outdoors",
};

export type LibraryTile = {
  id: string;
  group: LibraryGroup;
  label: string;
  item: PlaceItem;
  /** Footprint in cm, drawn to scale on the tile. */
  w: number;
  d: number;
  /** Rows and banquet runs need a few choices before they can be placed. */
  needsSetup?: "rows" | "banquet";
};

const table = (
  id: string,
  label: string,
  shape: string,
  capacity: number,
  w: number,
  d: number,
  needsSetup?: LibraryTile["needsSetup"],
  extra?: { reserved_seats?: number },
): LibraryTile => ({
  id,
  group: "tables",
  label,
  item: { type: "table", shape, capacity, label, extra },
  w,
  d,
  needsSetup,
});

const fixture = (group: LibraryGroup, kind: string): LibraryTile => {
  const size = FIXTURE_DEFAULTS[kind]!;
  return { id: kind, group, label: size.label, item: { type: "fixture", kind, label: size.label, width: size.width, depth: size.depth }, w: size.width, d: size.depth };
};

export const LIBRARY: readonly LibraryTile[] = [
  table("round", "Round", "round", 8, 150, 150),
  table("long", "Long", "long", 10, 300, 75),
  table("square", "Square", "square", 4, 120, 120),
  table("oval", "Oval", "oval", 8, 260, 110),
  table("half_moon", "Half-moon", "half_moon", 6, 180, 90),
  table("serpentine", "Serpentine", "serpentine", 8, 240, 75),
  table("banquet", "Banquet run", "banquet", 20, 600, 75, "banquet"),
  table("sweetheart", "Sweetheart", "sweetheart", 2, 120, 60),
  table("rows", "Ceremony rows", "rows", 40, 520, 220, "rows"),
  // A high table with no seats by default: its one place is marked reserved when it is made.
  table("cocktail", "Cocktail", "round", 1, 90, 90, undefined, { reserved_seats: 1 }),
  ...(["dance_floor", "stage", "bar", "buffet", "dj", "band", "cake", "gifts", "photo_booth", "lounge", "kids_area"] as const).map((k) => fixture("room", k)),
  ...(["floral_arch", "garland", "aisle_flowers", "candles", "plant", "sign", "lantern", "drape"] as const).map((k) => fixture("decor", k)),
  ...(["marquee", "tree", "path", "pool", "garden_bed", "slope"] as const).map((k) => fixture("outdoors", k)),
];

const DECOR = new Set(["floral_arch", "garland", "aisle_flowers", "candles", "plant", "sign", "lantern", "drape", "custom"]);
const OUTDOORS = new Set(["marquee", "tree", "path", "pool", "garden_bed", "slope"]);

/** Which library group a placed fixture belongs to: what the Show layers hide. */
export function fixtureGroup(kind: string): "room" | "decor" | "outdoors" {
  return DECOR.has(kind) ? "decor" : OUTDOORS.has(kind) ? "outdoors" : "room";
}

/** The tiles that match a search, across every group; an empty search matches all. */
export function searchLibrary(tiles: readonly LibraryTile[], query: string): LibraryTile[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...tiles];
  return tiles.filter((t) => t.label.toLowerCase().includes(q) || GROUP_LABEL[t.group].toLowerCase().includes(q));
}

/** Décor and other quantity-bearing items: "aisle flowers × 12" is one placed item. */
export function carriesQuantity(kind: string): boolean {
  return fixtureGroup(kind) === "decor" || kind === "tree" || kind === "garden_bed";
}

/** A tile's drawn size on a card `box` wide, to scale with its biggest side. */
export function tileDrawSize(t: Pick<LibraryTile, "w" | "d">, box: number): { w: number; h: number } {
  const k = box / Math.max(t.w, t.d, 1);
  return { w: Math.max(4, Math.round(t.w * k)), h: Math.max(4, Math.round(t.d * k)) };
}

/**
 * Every tile the Library can show: the built-in ones (at the plan's own default
 * sizes, Part I), the couple's own items and their marquee templates. Their ids
 * are the references Favourites and Recent keep (spec 59 Part C): `round`,
 * `candles`, `custom:<id>`, `marquee:<id>`.
 */
export function libraryTiles(
  customItems: readonly Pick<SeatingCustomItemRow, "id" | "name" | "width_cm" | "depth_cm">[],
  marquees: readonly Pick<SeatingMarqueeRow, "id" | "name" | "width_cm" | "length_cm">[],
  defaultSizes: Record<string, { width: number; depth: number }> = {},
): LibraryTile[] {
  const mine: LibraryTile[] = customItems.map((c) => ({
    id: `custom:${c.id}`,
    group: "decor",
    label: c.name,
    item: { type: "fixture", kind: "custom", label: c.name, width: c.width_cm, depth: c.depth_cm, customItemId: c.id },
    w: c.width_cm,
    d: c.depth_cm,
  }));
  const tents: LibraryTile[] = marquees.map((m) => ({
    id: `marquee:${m.id}`,
    group: "outdoors",
    label: m.name,
    item: { type: "fixture", kind: "marquee", label: m.name, width: m.width_cm, depth: m.length_cm, marqueeId: m.id },
    w: m.width_cm,
    d: m.length_cm,
  }));
  // The plan's own default sizes replace the built-in footprint of a built-in fixture.
  const sized = LIBRARY.map((t) => {
    const own = t.item.type === "fixture" ? defaultSizes[t.item.kind] : undefined;
    return own && t.item.type === "fixture" ? { ...t, w: own.width, d: own.depth, item: { ...t.item, width: own.width, depth: own.depth } } : t;
  });
  return [...sized, ...mine, ...tents];
}

/** The tile a stored reference names, or undefined when it has gone (a deleted item of the couple's own). */
export function tileByRef(tiles: readonly LibraryTile[], ref: string): LibraryTile | undefined {
  return tiles.find((t) => t.id === ref);
}

/** Rows and banquet runs need a setup form first, so they can't be stamped straight from a key. */
export function isStampable(tile: LibraryTile): boolean {
  return !tile.needsSetup;
}
