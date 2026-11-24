/**
 * How food is served (spec 57 Part F): the event's menu, which course is
 * plated, shared, buffet or roaming, and for shared courses how many platters
 * each table needs. Pure.
 *
 *   platters = ceiling(sharing guests / serves), per dish and table.
 *
 * Sharing guests are the table's seated guests who are not on a kids' meal
 * and have not been given their own plate, FOR THAT COURSE.
 */

import { tableSize, type TableGeometryInput } from "./geometry";
import type { PlanSettings } from "./plan-settings";

export type ServiceStyle = "plated" | "shared" | "buffet" | "roaming";
export const SERVICE_STYLES: readonly ServiceStyle[] = ["plated", "shared", "buffet", "roaming"];
export const SERVICE_LABEL: Record<ServiceStyle, string> = {
  plated: "Plated",
  shared: "Shared (family style)",
  buffet: "Buffet",
  roaming: "Roaming (canapés)",
};

export const DIETARY_TAGS = ["vegetarian", "vegan", "gluten_free", "dairy_free", "nut", "peanut", "shellfish", "fish", "egg", "soy", "sesame", "halal", "kosher"] as const;
export type DishTag = (typeof DIETARY_TAGS)[number] | string;
export const VESSELS = ["platter", "bowl", "board"] as const;
export type Vessel = (typeof VESSELS)[number];

export type Dish = { id: string; name: string; tags: string[]; vessel: Vessel; serves: number | null };
/** `style` null = the plan's default. */
export type Course = { id: string; name: string; style: ServiceStyle | null; dishes: Dish[] };
export type Menu = Course[];

export const MENU_LIMITS = { courses: 12, dishes: 40, name: 60, tags: 6, tagLength: 24, serves: { min: 1, max: 100 } } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const idOf = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);

export function isServiceStyle(v: unknown): v is ServiceStyle {
  return typeof v === "string" && (SERVICE_STYLES as readonly string[]).includes(v);
}

export type MenuResult = { ok: true; menu: Menu } | { ok: false; error: string };

/** Reads a stored or submitted menu; says what is wrong rather than repairing it. */
export function parseMenu(raw: unknown): MenuResult {
  if (raw === null || raw === undefined) return { ok: true, menu: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "The menu isn't a list of courses." };
  if (raw.length > MENU_LIMITS.courses) return { ok: false, error: `At most ${MENU_LIMITS.courses} courses.` };
  const seen = new Set<string>();
  let dishCount = 0;
  const menu: Menu = [];
  for (const c of raw) {
    if (!isObj(c)) return { ok: false, error: "A course isn't an object." };
    const id = idOf(c.id);
    const name = typeof c.name === "string" ? c.name.trim() : "";
    if (!id || !name || name.length > MENU_LIMITS.name) return { ok: false, error: `A course needs an id and a name of up to ${MENU_LIMITS.name} characters.` };
    if (seen.has(id)) return { ok: false, error: `Two items share the id ${id}.` };
    seen.add(id);
    const style = c.style === null || c.style === undefined ? null : isServiceStyle(c.style) ? c.style : undefined;
    if (style === undefined) return { ok: false, error: `The course "${name}" has a service style that isn't one of the four.` };
    const dishesRaw = c.dishes === undefined ? [] : c.dishes;
    if (!Array.isArray(dishesRaw)) return { ok: false, error: `The dishes of "${name}" aren't a list.` };
    const dishes: Dish[] = [];
    for (const d of dishesRaw) {
      if (!isObj(d)) return { ok: false, error: "A dish isn't an object." };
      const did = idOf(d.id);
      const dname = typeof d.name === "string" ? d.name.trim() : "";
      if (!did || !dname || dname.length > MENU_LIMITS.name) return { ok: false, error: `A dish in "${name}" needs an id and a name of up to ${MENU_LIMITS.name} characters.` };
      if (seen.has(did)) return { ok: false, error: `Two items share the id ${did}.` };
      seen.add(did);
      if (++dishCount > MENU_LIMITS.dishes) return { ok: false, error: `At most ${MENU_LIMITS.dishes} dishes.` };
      let serves: number | null = null;
      if (d.serves !== null && d.serves !== undefined) {
        if (typeof d.serves !== "number" || !Number.isInteger(d.serves) || d.serves < MENU_LIMITS.serves.min || d.serves > MENU_LIMITS.serves.max) {
          return { ok: false, error: `"${dname}" feeds a whole number of people, ${MENU_LIMITS.serves.min} to ${MENU_LIMITS.serves.max}.` };
        }
        serves = d.serves;
      }
      const tags = Array.isArray(d.tags)
        ? d.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim().slice(0, MENU_LIMITS.tagLength)).slice(0, MENU_LIMITS.tags)
        : [];
      dishes.push({ id: did, name: dname, tags, vessel: (VESSELS as readonly unknown[]).includes(d.vessel) ? (d.vessel as Vessel) : "platter", serves });
    }
    menu.push({ id, name, style, dishes });
  }
  return { ok: true, menu };
}

export function courseStyle(c: Pick<Course, "style">, planDefault: ServiceStyle): ServiceStyle {
  return c.style ?? planDefault;
}

export type ServiceTable = Pick<
  TableGeometryInput,
  "shape" | "capacity" | "ends_seated" | "width_cm" | "length_cm" | "rows_count" | "aisle_cm" | "segments"
> & {
  id: string;
  /** `{ dishId: { n, at } }`: a count the couple typed, and how many guests were sharing when they typed it. */
  platter_counts?: unknown;
};

export type ServiceSeat = {
  guestId: string;
  tableId: string;
  ageBand: "adult" | "child" | "infant";
  /** Per course id. */
  ownPlate: Record<string, boolean>;
  /** Per course id; false = this child shares, true or absent = the default plated kids' meal. */
  kidsMeal: Record<string, boolean>;
};

export function isKidsMeal(seat: Pick<ServiceSeat, "ageBand" | "kidsMeal">, courseId: string): boolean {
  return seat.ageBand !== "adult" && seat.kidsMeal[courseId] !== false;
}

export function hasOwnPlate(seat: Pick<ServiceSeat, "ageBand" | "kidsMeal" | "ownPlate">, courseId: string): boolean {
  return !isKidsMeal(seat, courseId) && seat.ownPlate[courseId] === true;
}

export type TableDish = {
  tableId: string;
  sharing: number;
  /** The formula's answer; null until the dish says how many it serves, or when nobody shares. */
  computed: number | null;
  typed: number | null;
  /** What to prepare: the typed count while it still fits, else the computed one. */
  platters: number | null;
  /** A typed count is out of date: the table's sharing guests changed since it was typed. */
  stale: boolean;
};

export type DishService = { dishId: string; name: string; vessel: Vessel; serves: number | null; tables: TableDish[]; total: number | null; needsServes: boolean };

export type TableHeads = { tableId: string; guests: number; kidsMeals: number; ownPlates: number };

export type CourseService = {
  courseId: string;
  name: string;
  style: ServiceStyle;
  dishes: DishService[];
  /** Every style: who is at each table, how many on a kids' meal, how many on their own plate. */
  heads: TableHeads[];
};

export type ServiceResult = { courses: CourseService[]; utensils: number; checkTables: string[] };

/** Two serving utensils per platter (spec 57 F.3). */
export const UTENSILS_PER_PLATTER = 2;

function typedCount(table: ServiceTable, dishId: string): { n: number; at: number } | null {
  const raw = table.platter_counts;
  if (!isObj(raw)) return null;
  const v = raw[dishId];
  if (!isObj(v)) return null;
  const n = v.n;
  const at = v.at;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 999) return null;
  if (typeof at !== "number" || !Number.isInteger(at) || at < 0) return null;
  return { n, at };
}

export function computeService(input: {
  menu: Menu;
  defaultStyle: ServiceStyle;
  tables: readonly ServiceTable[];
  seats: readonly ServiceSeat[];
  settings: Pick<PlanSettings, "longTableCm">;
}): ServiceResult {
  const byTable = new Map<string, ServiceSeat[]>();
  for (const s of input.seats) {
    const list = byTable.get(s.tableId);
    if (list) list.push(s);
    else byTable.set(s.tableId, [s]);
  }
  const check = new Set<string>();
  let platterTotal = 0;
  const courses: CourseService[] = input.menu.map((course) => {
    const style = courseStyle(course, input.defaultStyle);
    const heads: TableHeads[] = input.tables.map((t) => {
      const seats = byTable.get(t.id) ?? [];
      const kidsMeals = seats.filter((s) => isKidsMeal(s, course.id)).length;
      const ownPlates = seats.filter((s) => hasOwnPlate(s, course.id)).length;
      return { tableId: t.id, guests: seats.length, kidsMeals, ownPlates };
    });
    const dishes: DishService[] =
      style === "shared"
        ? course.dishes.map((dish) => {
            const tables: TableDish[] = input.tables.map((t) => {
              const h = heads.find((x) => x.tableId === t.id)!;
              const sharing = h.guests - h.kidsMeals - h.ownPlates;
              let computed: number | null = null;
              if (dish.serves !== null && sharing > 0) {
                computed = Math.ceil(sharing / dish.serves);
                const min = input.settings.longTableCm;
                const isLong = t.shape === "long" || t.shape === "banquet";
                if (min !== null && isLong && tableSize(t).length >= min) computed = Math.max(2, computed);
              }
              const typed = typedCount(t, dish.id);
              const stale = typed !== null && typed.at !== sharing;
              if (stale) check.add(t.id);
              const platters = typed !== null && !stale ? typed.n : computed;
              return { tableId: t.id, sharing, computed, typed: typed && !stale ? typed.n : null, platters, stale };
            });
            const counted = tables.filter((x) => x.platters !== null);
            const total = dish.serves === null ? null : counted.reduce((sum, x) => sum + (x.platters ?? 0), 0);
            if (total) platterTotal += total;
            return { dishId: dish.id, name: dish.name, vessel: dish.vessel, serves: dish.serves, tables, total, needsServes: dish.serves === null };
          })
        : [];
    return { courseId: course.id, name: course.name, style, dishes, heads };
  });
  return { courses, utensils: platterTotal * UTENSILS_PER_PLATTER, checkTables: [...check] };
}

/** What to store when the couple types a platter count: the number, and how many guests were sharing then. */
export function typedPlatters(existing: unknown, dishId: string, n: number | null, sharingNow: number): Record<string, { n: number; at: number }> {
  const out: Record<string, { n: number; at: number }> = {};
  if (isObj(existing)) {
    for (const [k, v] of Object.entries(existing)) {
      if (isObj(v) && typeof v.n === "number" && typeof v.at === "number") out[k] = { n: v.n, at: v.at };
    }
  }
  if (n === null) delete out[dishId];
  else out[dishId] = { n: Math.max(0, Math.min(999, Math.round(n))), at: sharingNow };
  return out;
}
