/**
 * The kitchen summary (spec 57 E.1.2 and F): per course, as the course is
 * served, then every dietary need with its table and seat. The panel on the
 * seating screen and the caterer's print page read the same result. Pure.
 */

import { dietaryText, hasAllergy, type DietaryNeed } from "@/lib/dietary";
import { tableSize } from "./geometry";
import type { StyleCentre } from "./items";
import { guestName, type SeatingGuest } from "./model";
import { computeService, hasOwnPlate, isKidsMeal, type CourseService, type Menu, type ServiceSeat, type ServiceStyle, type ServiceTable } from "./service";

export type KitchenSeat = {
  guestId: string;
  tableId: string;
  seatIndex: number | null;
  ownPlate?: Record<string, boolean>;
  kidsMeal?: Record<string, boolean>;
};

/** The RSVP question that is "the meal choice", with each guest's answer. */
export type MealQuestion = { id: string; label: string; options: string[]; answers: Record<string, string> };

export type KitchenLine = { table: string; seat: number | null; name: string; dietary: string };

export type KitchenCourse = {
  courseId: string;
  name: string;
  style: ServiceStyle;
  /** Plated: how many of each answer (people on their own plate or a kids' meal are counted where they are). */
  plated: { answer: string; count: number }[];
  /** Shared: from `computeService`. */
  shared: CourseService["dishes"];
  /** Every style: per table, in table order. */
  heads: { table: string; tableId: string; guests: number; kidsMeals: number; ownPlates: number; sharing: number }[];
  /** Buffet and roaming head counts. */
  totalGuests: number;
  ownPlates: KitchenLine[];
  kidsMeals: KitchenLine[];
};

export type Kitchen = {
  courses: KitchenCourse[];
  /** Every guest with a dietary need, with where they sit. */
  dietary: (KitchenLine & { allergy: boolean })[];
  utensils: number;
  /** Tables whose typed platter counts no longer match who is sharing. */
  checkTables: string[];
};

export function buildKitchen(input: {
  menu: Menu;
  defaultStyle: ServiceStyle;
  tables: readonly (ServiceTable & { label: string })[];
  seats: readonly KitchenSeat[];
  guests: readonly SeatingGuest[];
  settings: { longTableCm: number | null };
  meal: MealQuestion | null;
}): Kitchen {
  const guestById = new Map(input.guests.map((g) => [g.id, g]));
  const tableLabel = new Map(input.tables.map((t) => [t.id, t.label]));
  const serviceSeats: (ServiceSeat & { seatIndex: number | null })[] = input.seats
    .filter((s) => guestById.has(s.guestId))
    .map((s) => ({
      guestId: s.guestId,
      tableId: s.tableId,
      seatIndex: s.seatIndex,
      ageBand: guestById.get(s.guestId)!.ageBand,
      ownPlate: s.ownPlate ?? {},
      kidsMeal: s.kidsMeal ?? {},
    }));
  const service = computeService({ menu: input.menu, defaultStyle: input.defaultStyle, tables: input.tables, seats: serviceSeats, settings: input.settings });

  const line = (s: (typeof serviceSeats)[number]): KitchenLine => {
    const g = guestById.get(s.guestId)!;
    return { table: tableLabel.get(s.tableId) ?? "", seat: s.seatIndex === null ? null : s.seatIndex + 1, name: guestName(g), dietary: dietaryText(g.dietaryNeeds, g.dietary) };
  };
  const byTable = (a: KitchenLine, b: KitchenLine) => a.table.localeCompare(b.table, "en-GB", { numeric: true }) || (a.seat ?? 0) - (b.seat ?? 0) || a.name.localeCompare(b.name, "en-GB");

  const courses: KitchenCourse[] = service.courses.map((c) => {
    const seatsHere = serviceSeats;
    const plated: { answer: string; count: number }[] = [];
    if (c.style === "plated" && input.meal) {
      const counts = new Map<string, number>();
      for (const s of seatsHere) {
        const answer = input.meal.answers[s.guestId] ?? "No answer";
        counts.set(answer, (counts.get(answer) ?? 0) + 1);
      }
      for (const option of input.meal.options) if (counts.has(option)) plated.push({ answer: option, count: counts.get(option)! });
      for (const [answer, count] of counts) if (!input.meal.options.includes(answer)) plated.push({ answer, count });
    }
    return {
      courseId: c.courseId,
      name: c.name,
      style: c.style,
      plated,
      shared: c.dishes,
      heads: c.heads.map((h) => ({
        table: tableLabel.get(h.tableId) ?? "",
        tableId: h.tableId,
        guests: h.guests,
        kidsMeals: h.kidsMeals,
        ownPlates: h.ownPlates,
        sharing: h.guests - h.kidsMeals - h.ownPlates,
      })),
      totalGuests: seatsHere.length,
      ownPlates: seatsHere.filter((s) => hasOwnPlate(s, c.courseId)).map(line).sort(byTable),
      kidsMeals: seatsHere.filter((s) => isKidsMeal(s, c.courseId)).map(line).sort(byTable),
    };
  });

  const dietary = serviceSeats
    .filter((s) => {
      const g = guestById.get(s.guestId)!;
      return g.dietaryNeeds.length > 0 || (g.dietary ?? "").trim() !== "";
    })
    .map((s) => ({ ...line(s), allergy: hasAllergy(guestById.get(s.guestId)!.dietaryNeeds as DietaryNeed[]) }))
    .sort(byTable);

  return { courses, dietary, utensils: service.utensils, checkTables: service.checkTables.map((id) => tableLabel.get(id) ?? "") };
}

/**
 * The RSVP question that is the meal choice: the plan's Colour-by question if
 * it names one, else the first single-select guest question with a meal-like
 * name. Null when the couple asks none (spec 33 Q18: asking is theirs).
 */
export function mealQuestion(
  questions: readonly { id: string; label: string; options: string[] }[],
  answers: Record<string, Record<string, string>>,
  colourQuestionId: string | null,
): MealQuestion | null {
  const q = questions.find((x) => x.id === colourQuestionId) ?? questions.find((x) => /meal|main|dinner|food|menu|entr[ée]e|course/i.test(x.label));
  return q ? { id: q.id, label: q.label, options: q.options, answers: answers[q.id] ?? {} } : null;
}

/**
 * Flags for a table at a shared course (spec 57 F.4). They never block. A
 * long or banquet table narrower than the plan's limit, or a round one under
 * it across, is "Tight for shared dishes"; a style centre ticked tall "gets in
 * the way of passing dishes". (A tall centre is the couple's tick on the
 * item; there is no height to compare with the plan's centimetres.)
 */
export function sharedFlags(
  table: Pick<ServiceTable, "shape" | "capacity" | "ends_seated" | "width_cm" | "length_cm" | "rows_count" | "aisle_cm" | "segments">,
  centre: StyleCentre,
  settings: { tightForShared: { longWidthCm: number; roundCm: number } },
): string[] {
  const out: string[] = [];
  const { length, width } = tableSize(table);
  if ((table.shape === "long" || table.shape === "banquet") && width < settings.tightForShared.longWidthCm) out.push("Tight for shared dishes");
  if (table.shape === "round" && length < settings.tightForShared.roundCm) out.push("Tight for shared dishes");
  const tall = (["arrangement", "candles", "tablecloth", "runner"] as const).some((k) => centre[k]?.on && centre[k]?.tall);
  if (tall) out.push("Tall centrepieces get in the way of passing dishes");
  return out;
}

export type CloseupFood = {
  /** The first shared course's dishes at this table, with their platter counts. */
  dishes: { name: string; vessel: "platter" | "bowl" | "board"; count: number }[];
  /** Chair index → an own plate (orange ring) or a kids' meal (purple ring), for the first course that isn't plated. */
  rings: Record<number, "own" | "kids">;
  /** Chair index → the guest's first name, drawn outside the chair. */
  names: Record<number, string>;
};

/** What the table close-up adds for food and guests (spec 57 C.2, F.4, F.5). */
export function closeupFood(input: {
  kitchen: Kitchen;
  menu: Menu;
  defaultStyle: ServiceStyle;
  tableId: string;
  seats: readonly KitchenSeat[];
  guests: readonly SeatingGuest[];
}): CloseupFood {
  const guestById = new Map(input.guests.map((g) => [g.id, g]));
  const sharedCourse = input.kitchen.courses.find((c) => c.style === "shared");
  const dishes = (sharedCourse?.shared ?? [])
    .map((d) => ({ name: d.name || "Dish", vessel: d.vessel, count: d.tables.find((t) => t.tableId === input.tableId)?.platters ?? 0 }))
    .filter((d) => d.count > 0);
  const course = input.menu.find((c) => (c.style ?? input.defaultStyle) !== "plated");
  const rings: CloseupFood["rings"] = {};
  const names: CloseupFood["names"] = {};
  for (const s of input.seats) {
    const g = guestById.get(s.guestId);
    if (!g || s.tableId !== input.tableId || s.seatIndex === null) continue;
    names[s.seatIndex] = (g.preferredName || g.firstName).slice(0, 12);
    if (course) {
      const seat = { ageBand: g.ageBand, kidsMeal: s.kidsMeal ?? {}, ownPlate: s.ownPlate ?? {} };
      if (isKidsMeal(seat, course.id)) rings[s.seatIndex] = "kids";
      else if (hasOwnPlate(seat, course.id)) rings[s.seatIndex] = "own";
    }
  }
  return { dishes, rings, names };
}
