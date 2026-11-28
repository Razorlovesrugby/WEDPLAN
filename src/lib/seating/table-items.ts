/**
 * Things on a table (spec 59 Part D): décor and shared dishes placed on a table's top by hand or by rule, and where each
 * goes. Positions are fractions of the table's length and width measured from its centre (−0.5 to 0.5), so they survive a
 * resize and follow the table's size and chair count. Pure.
 */

import { CHAIR_OFFSET_CM } from "./geometry";

// ---------------------------------------------------------------------------
// What can be put on a table
// ---------------------------------------------------------------------------

/** `dish` names one of the menu's dishes (`ref`); `custom` one of the couple's own items (`ref`). */
export const TABLE_ITEM_KINDS = ["arrangement", "candles", "bud_vase", "lantern", "sign", "dish", "custom"] as const;
export type TableItemKind = (typeof TABLE_ITEM_KINDS)[number];

export const TABLE_ITEM_LABEL: Record<TableItemKind, string> = {
  arrangement: "Arrangement",
  candles: "Candles",
  bud_vase: "Bud vase",
  lantern: "Lantern",
  sign: "Sign",
  dish: "Dish",
  custom: "Your own item",
};

/** How big each is on the tabletop, in cm (drawn to scale in the room from 100% zoom, and in the close-up). */
export const TABLE_ITEM_SIZE: Record<TableItemKind, { w: number; d: number; round: boolean }> = {
  arrangement: { w: 26, d: 26, round: true },
  candles: { w: 10, d: 10, round: true },
  bud_vase: { w: 8, d: 8, round: true },
  lantern: { w: 14, d: 14, round: true },
  sign: { w: 18, d: 10, round: false },
  dish: { w: 30, d: 20, round: false },
  custom: { w: 16, d: 16, round: true },
};

export const TABLE_ITEM_LIMITS = { items: 200, rules: 40, ref: 80, label: 60 } as const;

export type TableItem = {
  id: string;
  kind: TableItemKind;
  /** The dish's id, or the custom item's. */
  ref?: string;
  /** What to call it, when `kind` doesn't say ("Cake knife"). */
  label?: string;
  /** Fractions of the table's length and width from its centre, −0.5 to 0.5. */
  along: number;
  across: number;
  /** Degrees. */
  rotation: number;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clampFrac = (n: number) => Math.max(-0.5, Math.min(0.5, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const isKind = (v: unknown): v is TableItemKind => typeof v === "string" && (TABLE_ITEM_KINDS as readonly string[]).includes(v);

/** What the database holds, made safe: anything that isn't a sane item is dropped, positions are kept on the table. */
export function parseTableItems(raw: unknown): TableItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TableItem[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, TABLE_ITEM_LIMITS.items)) {
    if (!isObj(r) || !isKind(r.kind) || typeof r.id !== "string" || r.id === "" || r.id.length > 40 || seen.has(r.id)) continue;
    if (typeof r.along !== "number" || typeof r.across !== "number" || !Number.isFinite(r.along) || !Number.isFinite(r.across)) continue;
    seen.add(r.id);
    const item: TableItem = {
      id: r.id,
      kind: r.kind,
      along: round3(clampFrac(r.along)),
      across: round3(clampFrac(r.across)),
      rotation: typeof r.rotation === "number" && Number.isFinite(r.rotation) ? ((Math.round(r.rotation) % 360) + 360) % 360 : 0,
    };
    if (typeof r.ref === "string" && r.ref !== "") item.ref = r.ref.slice(0, TABLE_ITEM_LIMITS.ref);
    if (typeof r.label === "string" && r.label.trim() !== "") item.label = r.label.trim().slice(0, TABLE_ITEM_LIMITS.label);
    out.push(item);
  }
  return out;
}

let counter = 0;
/** A fresh item id that is not in `taken`. */
export function newItemId(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  for (let i = 0; i < 30; i++) {
    const id = `i${Math.floor(random() * 36 ** 6).toString(36)}${(counter++ % 36).toString(36)}`;
    if (!taken.has(id)) return id;
  }
  return `i${Date.now().toString(36)}${counter++}`;
}

// ---------------------------------------------------------------------------
// Rules: "every three seats"
// ---------------------------------------------------------------------------

export const RULE_KINDS = ["every_n_seats", "n_per_table", "each_end", "one_end", "centre", "each_seat"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export const RULE_LABEL: Record<RuleKind, string> = {
  every_n_seats: "Every N seats",
  n_per_table: "N per table, evenly spaced",
  each_end: "At each end",
  one_end: "At one end",
  centre: "In the centre",
  each_seat: "At each seat",
};

/** `head` is the right-hand end of a long table as it is drawn before it is turned; `foot` the left. */
export type TableEnd = "head" | "foot";

export type ItemRule = {
  id: string;
  kind: TableItemKind;
  ref?: string;
  label?: string;
  rule: RuleKind;
  /** every_n_seats and n_per_table. */
  n?: number;
  /** one_end. */
  end?: TableEnd;
};

export function parseItemRules(raw: unknown): ItemRule[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemRule[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, TABLE_ITEM_LIMITS.rules)) {
    if (!isObj(r) || !isKind(r.kind) || typeof r.id !== "string" || r.id === "" || r.id.length > 40 || seen.has(r.id)) continue;
    if (typeof r.rule !== "string" || !(RULE_KINDS as readonly string[]).includes(r.rule)) continue;
    seen.add(r.id);
    const rule: ItemRule = { id: r.id, kind: r.kind, rule: r.rule as RuleKind };
    if (typeof r.ref === "string" && r.ref !== "") rule.ref = r.ref.slice(0, TABLE_ITEM_LIMITS.ref);
    if (typeof r.label === "string" && r.label.trim() !== "") rule.label = r.label.trim().slice(0, TABLE_ITEM_LIMITS.label);
    if ((rule.rule === "every_n_seats" || rule.rule === "n_per_table") && typeof r.n === "number" && Number.isInteger(r.n)) rule.n = Math.max(1, Math.min(60, r.n));
    if (rule.rule === "one_end") rule.end = r.end === "foot" ? "foot" : "head";
    out.push(rule);
  }
  return out;
}

/** What a table can have a rule's items placed on. Ceremony rows are chairs only. */
export const hasTabletop = (shape: string): boolean => shape !== "rows";

/** Tables with chairs down both long sides (the positions run along the centre line and serve both sides). */
const BOTH_SIDES = new Set(["long", "banquet", "serpentine"]);
/** Tables seated along one side only. */
const ONE_SIDE = new Set(["head", "sweetheart", "half_moon"]);
const LONGISH = new Set([...BOTH_SIDES, ...ONE_SIDE]);

export type RuleTable = { shape: string; capacity: number; ends_seated?: boolean };
export type RulePosition = { along: number; across: number; rotation: number; /** How many guests this position serves, where the rule says. */ serves?: number };

/** Chairs along one side of a long table (the same count `geometry.ts` lays out). */
function perSide(t: RuleTable): number {
  if (t.shape === "long") return Math.max(1, Math.ceil((t.ends_seated ? Math.max(0, t.capacity - 2) : t.capacity) / 2));
  if (BOTH_SIDES.has(t.shape)) return Math.max(1, Math.ceil(t.capacity / 2));
  return Math.max(1, t.capacity);
}

/** Round, oval, square: positions go round a ring inside the place settings. */
const RING = 0.3;
const EDGE = 0.04;

/** The ring's point at `angle` (radians, 0 at the top... the same way chairs are numbered: clockwise from the top). */
function ringPoint(angle: number, r: number) {
  const a = angle - Math.PI / 2;
  return { along: round3(r * Math.cos(a)), across: round3(r * Math.sin(a)) };
}

/**
 * Where one rule puts its items on a table, as fractions of the table's length and width. Long and banquet tables
 * (chairs both sides): along the centre line, N counting chairs along ONE side, each position serving the chairs level
 * with it on both. One-sided tables, and rounds and ovals: N counts chairs in order round the table. A table with no top
 * (ceremony rows) has none.
 */
export function rulePositions(t: RuleTable, rule: Pick<ItemRule, "rule" | "n" | "end">): RulePosition[] {
  if (!hasTabletop(t.shape) || t.capacity < 1) return [];
  const longish = LONGISH.has(t.shape);
  const sides = BOTH_SIDES.has(t.shape) ? 2 : 1;
  const out: RulePosition[] = [];
  const n = Math.max(1, Math.round(rule.n ?? 1));

  if (rule.rule === "centre") return [{ along: 0, across: 0, rotation: 0 }];

  if (longish) {
    const seats = perSide(t);
    const across = t.shape === "half_moon" ? 0.12 : 0;
    const at = (fraction: number, serves?: number): RulePosition => ({ along: round3(clampFrac(fraction - 0.5)), across, rotation: 0, serves });
    switch (rule.rule) {
      case "every_n_seats":
        for (let start = 0; start < seats; start += n) {
          const size = Math.min(n, seats - start);
          out.push(at((start + size / 2) / seats, size * sides));
        }
        return out;
      case "n_per_table":
        for (let i = 0; i < n; i++) out.push(at((i + 0.5) / n));
        return out;
      case "each_end":
        return [at(EDGE), at(1 - EDGE)];
      case "one_end":
        return [at(rule.end === "foot" ? EDGE : 1 - EDGE)];
      case "each_seat":
        for (let side = 0; side < sides; side++) {
          for (let i = 0; i < seats; i++) out.push({ along: round3(clampFrac((i + 0.5) / seats - 0.5)), across: sides === 2 ? (side === 0 ? -0.26 : 0.26) : 0.26, rotation: 0, serves: 1 });
        }
        return out;
    }
  }

  // A ring: chairs in order round the table, seat 0 at the top, clockwise.
  const seats = t.capacity;
  switch (rule.rule) {
    case "every_n_seats":
      for (let start = 0; start < seats; start += n) {
        const size = Math.min(n, seats - start);
        const p = ringPoint((2 * Math.PI * (start + size / 2)) / seats, RING);
        out.push({ ...p, rotation: 0, serves: size });
      }
      return out;
    case "n_per_table":
      if (n === 1) return [{ along: 0, across: 0, rotation: 0 }];
      for (let i = 0; i < n; i++) out.push({ ...ringPoint((2 * Math.PI * i) / n, RING), rotation: 0 });
      return out;
    case "each_end":
      return [{ ...ringPoint(Math.PI / 2, RING), rotation: 0 }, { ...ringPoint(-Math.PI / 2, RING), rotation: 0 }];
    case "one_end":
      return [{ ...ringPoint(rule.end === "foot" ? -Math.PI / 2 : Math.PI / 2, RING), rotation: 0 }];
    case "each_seat":
      for (let i = 0; i < seats; i++) out.push({ ...ringPoint((2 * Math.PI * (i + 0.5)) / seats, 0.38), rotation: 0, serves: 1 });
      return out;
  }
  return out;
}

/** A rule's items for one table, as items with stable ids (`rule:<id>:<n>`), so a drawing can key them. */
export function ruleItems(t: RuleTable, rules: readonly ItemRule[]): (TableItem & { fromRule: string; serves?: number })[] {
  const out: (TableItem & { fromRule: string; serves?: number })[] = [];
  for (const r of rules) {
    rulePositions(t, r).forEach((p, i) => {
      const item: TableItem & { fromRule: string; serves?: number } = { id: `rule:${r.id}:${i}`, kind: r.kind, along: p.along, across: p.across, rotation: p.rotation, fromRule: r.id, serves: p.serves };
      if (r.ref) item.ref = r.ref;
      if (r.label) item.label = r.label;
      out.push(item);
    });
  }
  return out;
}

/**
 * The rules a table has: its own (a per-table change replaces the style's whole list), else its style's. `null` for
 * `own` means "no override".
 */
export function effectiveRules(styleRules: readonly ItemRule[], own: readonly ItemRule[] | null): readonly ItemRule[] {
  return own ?? styleRules;
}

/** How many of each kind a table carries, placed and by rule (the count a florist or the kitchen reads as a suggestion). */
export function countItems(items: readonly TableItem[], ruled: readonly TableItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of [...items, ...ruled]) {
    const key = i.kind === "dish" || i.kind === "custom" ? `${i.kind}:${i.ref ?? ""}` : i.kind;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Placing by hand in the close-up
// ---------------------------------------------------------------------------

export type Snap = { along: number; across: number; kind: "centre" | "end" | "chair" };

/**
 * The points an item snaps to when placed or dragged on a tabletop: the table's centre line, its ends, and the points
 * opposite each chair. Returns the nearest within `thresholdFrac` (a fraction of the table's own size), or null.
 */
export function snapOnTable(t: RuleTable & { length: number; width: number }, p: { along: number; across: number }, thresholdFrac = 0.025): Snap | null {
  const targets: Snap[] = [{ along: 0, across: 0, kind: "centre" }];
  if (LONGISH.has(t.shape)) {
    targets.push({ along: -0.5 + EDGE, across: 0, kind: "end" }, { along: 0.5 - EDGE, across: 0, kind: "end" });
    const seats = perSide(t);
    for (let i = 0; i < seats; i++) {
      const along = round3((i + 0.5) / seats - 0.5);
      targets.push({ along, across: 0, kind: "chair" });
      if (BOTH_SIDES.has(t.shape)) targets.push({ along, across: -0.26, kind: "chair" }, { along, across: 0.26, kind: "chair" });
    }
  } else {
    for (let i = 0; i < t.capacity; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / t.capacity;
      targets.push({ ...ringPoint(a, 0.38), kind: "chair" });
    }
  }
  let best: { snap: Snap; d: number } | null = null;
  for (const s of targets) {
    // Distances in cm, so a long thin table's two axes count equally.
    const d = Math.hypot((s.along - p.along) * t.length, (s.across - p.across) * t.width);
    const limit = thresholdFrac * Math.min(t.length, t.width);
    if (d <= limit && (!best || d < best.d)) best = { snap: s, d };
  }
  return best?.snap ?? null;
}

/** A point on the tabletop in cm from the table's centre (its own frame) as fractions, kept on the table. */
export function toFractions(t: { length: number; width: number }, cm: { x: number; y: number }): { along: number; across: number } {
  return { along: round3(clampFrac(cm.x / t.length)), across: round3(clampFrac(cm.y / t.width)) };
}

/** Fractions back to cm from the table's centre. */
export function toCm(t: { length: number; width: number }, f: { along: number; across: number }): { x: number; y: number } {
  return { x: f.along * t.length, y: f.across * t.width };
}

/** The chair ring's reach, for drawing the tabletop's margin in the close-up. */
export const CLOSEUP_PAD_CM = CHAIR_OFFSET_CM + 70;

/**
 * Copy table décor onto other tables (spec 59 D.3): items keep their place relative to the table's length and width, so
 * they land where they were whatever size the other table is. Ids are made new.
 */
export function pasteItems(items: readonly TableItem[], taken: ReadonlySet<string>, random?: () => number): TableItem[] {
  const ids = new Set(taken);
  return items.map((i) => {
    const id = newItemId(ids, random);
    ids.add(id);
    return { ...i, id };
  });
}

/** Moves the items by a fraction on each axis, keeping them on the table. */
export function nudgeItems(items: readonly TableItem[], ids: ReadonlySet<string>, dAlong: number, dAcross: number): TableItem[] {
  return items.map((i) => (ids.has(i.id) ? { ...i, along: round3(clampFrac(i.along + dAlong)), across: round3(clampFrac(i.across + dAcross)) } : i));
}
