/**
 * Table styles and the item totals they add up to (spec 57 Part C). A style
 * says what is on each place and in the middle of a table; a table may change
 * it. The totals count the same thing two ways (by chairs, by seated guests)
 * and the couple types the final number; the app only suggests. Pure.
 */

import type { SeatingFixtureKind } from "@/lib/types/database";
import { parseItemRules, type ItemRule } from "./table-items";

export const PLACE_ITEMS = ["charger", "dinner_plate", "side_plate", "napkin", "cutlery", "glasses", "name_card", "menu_card"] as const;
export type PlaceKey = (typeof PLACE_ITEMS)[number];
export const PLACE_LABEL: Record<PlaceKey, string> = {
  charger: "Charger plates",
  dinner_plate: "Dinner plates",
  side_plate: "Side plates",
  napkin: "Napkins",
  cutlery: "Cutlery pieces",
  glasses: "Glasses",
  name_card: "Name cards",
  menu_card: "Menu cards",
};
/** How many of each a place gets when the style says "on" and doesn't say how many. */
const PLACE_DEFAULT_COUNT: Record<PlaceKey, number> = { charger: 1, dinner_plate: 1, side_plate: 1, napkin: 1, cutlery: 4, glasses: 2, name_card: 1, menu_card: 1 };

export type PlaceSetting = { on: boolean; note?: string; count?: number };
export type StylePlace = Partial<Record<PlaceKey, PlaceSetting>>;

export const CENTRE_ITEMS = ["arrangement", "candles", "tablecloth", "runner"] as const;
export type CentreKey = (typeof CENTRE_ITEMS)[number];
export const CENTRE_LABEL: Record<CentreKey, string> = { arrangement: "Centre arrangements", candles: "Candles", tablecloth: "Tablecloths", runner: "Runners" };
export type CentreSetting = { on: boolean; note?: string; count?: number; tall?: boolean };
export type CentreExtra = { name: string; count: number };
export type StyleCentre = Partial<Record<CentreKey, CentreSetting>> & { extras?: CentreExtra[] };

/**
 * Changes on one table, over its style: a key present replaces the style's, `extras` replaces the whole list. `item_rules`
 * (spec 59 D.2) replaces the style's whole list of placed-by-rule items; an empty list means "none on this table".
 */
export type StyleChanges = { place?: StylePlace; centre?: StyleCentre; item_rules?: ItemRule[] };

export type TableStyle = { id: string; name: string; place: StylePlace; centre: StyleCentre; /** Items placed by rule (spec 59 D.2). */ item_rules?: ItemRule[] };

export const STYLE_LIMITS = { extras: 5, note: 80, name: 60, count: 999 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function setting(v: unknown, withTall: boolean): CentreSetting | PlaceSetting | null {
  if (!isObj(v) || typeof v.on !== "boolean") return null;
  const out: CentreSetting = { on: v.on };
  if (typeof v.note === "string" && v.note.trim() !== "") out.note = v.note.trim().slice(0, STYLE_LIMITS.note);
  if (typeof v.count === "number" && Number.isInteger(v.count) && v.count >= 0 && v.count <= STYLE_LIMITS.count) out.count = v.count;
  if (withTall && v.tall === true) out.tall = true;
  return out;
}

export function parseStylePlace(raw: unknown): StylePlace {
  const out: StylePlace = {};
  if (!isObj(raw)) return out;
  for (const k of PLACE_ITEMS) {
    const s = setting(raw[k], false);
    if (s) out[k] = s;
  }
  return out;
}

export function parseStyleCentre(raw: unknown): StyleCentre {
  const out: StyleCentre = {};
  if (!isObj(raw)) return out;
  for (const k of CENTRE_ITEMS) {
    const s = setting(raw[k], k === "arrangement");
    if (s) out[k] = s as CentreSetting;
  }
  if (Array.isArray(raw.extras)) {
    out.extras = raw.extras
      .filter(isObj)
      .map((e) => ({ name: typeof e.name === "string" ? e.name.trim().slice(0, STYLE_LIMITS.name) : "", count: typeof e.count === "number" && Number.isInteger(e.count) ? Math.min(STYLE_LIMITS.count, Math.max(0, e.count)) : 1 }))
      .filter((e) => e.name !== "")
      .slice(0, STYLE_LIMITS.extras);
  }
  return out;
}

export function parseStyleChanges(raw: unknown): StyleChanges | null {
  if (!isObj(raw)) return null;
  const out: StyleChanges = {};
  if (raw.place !== undefined) out.place = parseStylePlace(raw.place);
  if (raw.centre !== undefined) out.centre = parseStyleCentre(raw.centre);
  if (raw.item_rules !== undefined) out.item_rules = parseItemRules(raw.item_rules);
  return out.place || out.centre || out.item_rules ? out : null;
}

/** A table's style with its own changes laid over it. */
export function effectiveStyle(style: Pick<TableStyle, "place" | "centre"> | null, changes: StyleChanges | null): { place: StylePlace; centre: StyleCentre } {
  return {
    place: { ...(style?.place ?? {}), ...(changes?.place ?? {}) },
    centre: { ...(style?.centre ?? {}), ...(changes?.centre ?? {}) },
  };
}

export type ItemGroup = "place" | "centre" | "room" | "utensil";
export type ItemRow = {
  key: string;
  group: ItemGroup;
  label: string;
  /** Distinct style notes behind the row ("Sage linen"). */
  notes: string[];
  suggestedChairs: number;
  suggestedGuests: number;
};

export type ItemTable = {
  id: string;
  shape: string;
  capacity: number;
  reserved_seats: number;
  style_id: string | null;
  style_changes: unknown;
  /** Guests seated here, and chairs blocked. */
  seated: number;
  blocked: number;
};

export type ItemFixture = { kind: SeatingFixtureKind; custom_item_id: string | null; quantity: number; label: string | null };

const GROUP_ORDER: Record<ItemGroup, number> = { place: 0, centre: 1, room: 2, utensil: 3 };
const RUNNER_SHAPES = new Set(["long", "banquet", "head", "serpentine"]);

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item";
}

/**
 * The suggested counts. Places count chairs (blocked ones excluded) or seated
 * guests plus the table's reserved seats; centre items count tables; room
 * items count what is placed, by quantity; utensils come from the platters.
 */
export function computeItems(input: {
  tables: readonly ItemTable[];
  styles: readonly TableStyle[];
  fixtures: readonly ItemFixture[];
  customNames: Readonly<Record<string, string>>;
  utensils: number;
}): ItemRow[] {
  const rows = new Map<string, ItemRow>();
  const add = (key: string, group: ItemGroup, label: string, chairs: number, guests: number, note?: string) => {
    if (chairs <= 0 && guests <= 0) return;
    const row = rows.get(key) ?? { key, group, label, notes: [], suggestedChairs: 0, suggestedGuests: 0 };
    row.suggestedChairs += chairs;
    row.suggestedGuests += guests;
    if (note && !row.notes.includes(note)) row.notes.push(note);
    rows.set(key, row);
  };
  const styleById = new Map(input.styles.map((s) => [s.id, s]));

  for (const t of input.tables) {
    const style = t.style_id ? styleById.get(t.style_id) ?? null : null;
    const eff = effectiveStyle(style, parseStyleChanges(t.style_changes));
    const chairs = Math.max(0, t.capacity - t.blocked);
    const guests = t.seated + t.reserved_seats;
    for (const k of PLACE_ITEMS) {
      const s = eff.place[k];
      if (!s?.on) continue;
      const per = s.count ?? PLACE_DEFAULT_COUNT[k];
      add(`place:${k}`, "place", PLACE_LABEL[k], chairs * per, guests * per, s.note);
    }
    for (const k of CENTRE_ITEMS) {
      const s = eff.centre[k];
      if (!s?.on) continue;
      if (k === "runner" && !RUNNER_SHAPES.has(t.shape)) continue;
      const per = k === "candles" ? s.count ?? 6 : 1;
      add(`centre:${k}`, "centre", CENTRE_LABEL[k], per, per, s.note);
    }
    for (const e of eff.centre.extras ?? []) add(`extra:${slug(e.name)}`, "centre", e.name, e.count, e.count);
  }

  for (const f of input.fixtures) {
    if (f.kind === "custom") {
      const name = f.custom_item_id ? input.customNames[f.custom_item_id] : undefined;
      add(`room:custom:${f.custom_item_id ?? "?"}`, "room", name ?? f.label ?? "Item", f.quantity, f.quantity);
    } else if (DECOR_ROOM_KINDS.has(f.kind)) {
      add(`room:${f.kind}`, "room", DECOR_ROOM_KINDS.get(f.kind)!, f.quantity, f.quantity);
    }
  }
  add("utensil", "utensil", "Serving utensils", input.utensils, input.utensils);

  return [...rows.values()].sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.label.localeCompare(b.label));
}

/** The fixture kinds that are things to order or set out, as opposed to places in the room (a stage, a dance floor). */
export const DECOR_ROOM_KINDS: ReadonlyMap<SeatingFixtureKind, string> = new Map<SeatingFixtureKind, string>([
  ["floral_arch", "Floral arches"],
  ["garland", "Garlands"],
  ["aisle_flowers", "Aisle flowers"],
  ["candles", "Candles (room)"],
  ["plant", "Plants"],
  ["sign", "Signs"],
  ["lantern", "Lanterns"],
  ["drape", "Drapes"],
  ["lounge", "Lounges"],
]);

export type StoredCount = { item_key: string; final_count: number | null; suggested_chairs: number | null; suggested_guests: number | null; vendor_id: string | null; budget_item_id: string | null };
export type CountStatus = "not_set" | "ok" | "changed";
export type ItemLine = ItemRow & { final: number | null; status: CountStatus; vendorId: string | null; budgetItemId: string | null };

/**
 * Lays the couple's final numbers over the suggestions. A row with no final
 * number is "not set"; one whose suggestions have moved since the number was
 * typed is "changed" (the number stays, and says so).
 */
export function mergeFinal(rows: readonly ItemRow[], stored: readonly StoredCount[]): ItemLine[] {
  const byKey = new Map(stored.map((s) => [s.item_key, s]));
  return rows.map((r) => {
    const s = byKey.get(r.key);
    const final = s?.final_count ?? null;
    let status: CountStatus = "not_set";
    if (final !== null) {
      status = s!.suggested_chairs === r.suggestedChairs && s!.suggested_guests === r.suggestedGuests ? "ok" : "changed";
    }
    return { ...r, final, status, vendorId: s?.vendor_id ?? null, budgetItemId: s?.budget_item_id ?? null };
  });
}

/** CSV for a list of lines: item, suggested by chairs, suggested by guests, final, notes. */
export function itemsCsv(lines: readonly ItemLine[]): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Item", "By chairs", "By seated guests", "Final", "Notes"];
  const body = lines.map((l) => [l.label, l.suggestedChairs, l.suggestedGuests, l.final, l.notes.join("; ")].map(esc).join(","));
  return [header.join(","), ...body].join("\n");
}

/**
 * The changes that turn a style into what a table should have: each place and
 * centre key that differs, and the whole `extras` list when it differs. Null
 * when the table is just its style. The inverse of `effectiveStyle`.
 */
export function changesFrom(
  style: Pick<TableStyle, "place" | "centre"> | null,
  wanted: { place: StylePlace; centre: StyleCentre },
): StyleChanges | null {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const base = { place: style?.place ?? {}, centre: style?.centre ?? {} };
  const place: StylePlace = {};
  for (const k of PLACE_ITEMS) {
    if (!same(wanted.place[k], base.place[k])) place[k] = wanted.place[k] ?? { on: false };
  }
  const centre: StyleCentre = {};
  for (const k of CENTRE_ITEMS) {
    if (!same(wanted.centre[k], base.centre[k])) centre[k] = wanted.centre[k] ?? { on: false };
  }
  if (!same(wanted.centre.extras ?? [], base.centre.extras ?? [])) centre.extras = wanted.centre.extras ?? [];
  const out: StyleChanges = {};
  if (Object.keys(place).length > 0) out.place = place;
  if (Object.keys(centre).length > 0) out.centre = centre;
  return out.place || out.centre ? out : null;
}

/**
 * A readable name for an item key (`place:charger`, `centre:candles`,
 * `extra:bud-vases`, `room:aisle_flowers`, `room:custom:<id>`, `utensil`), for
 * a vendor's page where the item sits outside the totals list.
 */
export function describeItemKey(key: string, customNames: Readonly<Record<string, string>> = {}): string {
  const [group, ...rest] = key.split(":");
  const tail = rest.join(":");
  if (group === "place") return PLACE_LABEL[tail as PlaceKey] ?? tail;
  if (group === "centre") return CENTRE_LABEL[tail as CentreKey] ?? tail;
  if (group === "room") {
    if (tail.startsWith("custom:")) return customNames[tail.slice("custom:".length)] ?? "Your own item";
    return DECOR_ROOM_KINDS.get(tail as SeatingFixtureKind) ?? tail.replace(/_/g, " ");
  }
  if (group === "extra") return tail.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  if (key === "utensil") return "Serving utensils";
  return key;
}

/** The Kids starter style (spec 57 C.1): plastic cups, no charger, an activity pack. An ordinary style once made. */
export const KIDS_STYLE_NAME = "Kids";
export function kidsStarterStyle(): { name: string; place: StylePlace; centre: StyleCentre } {
  return {
    name: KIDS_STYLE_NAME,
    place: {
      charger: { on: false },
      dinner_plate: { on: true },
      napkin: { on: true },
      cutlery: { on: true, count: 2 },
      glasses: { on: true, count: 1, note: "plastic cups" },
      name_card: { on: true },
    },
    centre: { extras: [{ name: "Activity pack", count: 1 }] },
  };
}

/** Offered once a child is seated and there is no style called Kids yet (any case). */
export function shouldOfferKidsStyle(seatedChildren: number, styles: readonly Pick<TableStyle, "name">[]): boolean {
  return seatedChildren > 0 && !styles.some((s) => s.name.trim().toLowerCase() === KIDS_STYLE_NAME.toLowerCase());
}
