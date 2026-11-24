/**
 * "Set up the room" (spec 53 Part A): a layout from a few answers, as a pure
 * function. Tables are numbered from the top table outwards, in a grid that
 * fits the room, with the room's elements placed around them.
 */

import { CLEARANCE_CM, tableSize } from "./geometry";
import type { SeatingFixtureKind, SeatingTableShape } from "@/lib/types/database";

export type TableMix = "round8" | "round10" | "long12" | "mixed";
export type CoupleSits = "top" | "sweetheart" | "guests";
export type RoomElement = "dance_floor" | "band" | "bar" | "buffet" | "cake" | "photo_booth";

export type TemplateInput = {
  /** How many to seat. */
  people: number;
  tables: TableMix;
  couple: CoupleSits;
  elements: readonly RoomElement[];
  room: { widthCm: number; depthCm: number };
};

export type TemplateTable = {
  label: string;
  shape: SeatingTableShape;
  capacity: number;
  pos_x_cm: number;
  pos_y_cm: number;
  rotation_deg: number;
};

export type TemplateFixture = {
  kind: SeatingFixtureKind;
  label: string;
  pos_x_cm: number;
  pos_y_cm: number;
  width_cm: number;
  depth_cm: number;
};

export type TemplateResult = {
  tables: TemplateTable[];
  fixtures: TemplateFixture[];
  seats: number;
  spare: number;
  /** "12 tables · 128 seats for 120 people · 8 spare chairs" */
  summary: string;
  /** False when some tables fall outside the room: it is too small for this layout. */
  fits: boolean;
};

const TOP_SEATS = 8;
const SWEETHEART_SEATS = 2;
const MARGIN_CM = 150;

const FIXTURE_SIZES: Record<RoomElement, { width: number; depth: number; label: string }> = {
  dance_floor: { width: 500, depth: 500, label: "Dance floor" },
  band: { width: 400, depth: 250, label: "Band / DJ" },
  bar: { width: 300, depth: 80, label: "Bar" },
  buffet: { width: 400, depth: 90, label: "Buffet" },
  cake: { width: 90, depth: 90, label: "Cake" },
  photo_booth: { width: 250, depth: 250, label: "Photo booth" },
};

function guestTables(count: number, mix: TableMix): { shape: SeatingTableShape; capacity: number }[] {
  const make = (shape: SeatingTableShape, capacity: number) => ({ shape, capacity });
  return Array.from({ length: count }, (_, i) => {
    switch (mix) {
      case "round8":
        return make("round", 8);
      case "round10":
        return make("round", 10);
      case "long12":
        return make("long", 12);
      case "mixed":
        return i % 2 === 0 ? make("round", 10) : make("long", 12);
    }
  });
}

export function perTable(mix: TableMix): number {
  return mix === "round8" ? 8 : mix === "round10" ? 10 : mix === "long12" ? 12 : 11;
}

export function buildTemplate(input: TemplateInput): TemplateResult {
  const { room } = input;
  const specialSeats = input.couple === "top" ? TOP_SEATS : input.couple === "sweetheart" ? SWEETHEART_SEATS : 0;
  const forGuests = Math.max(0, input.people - specialSeats);
  const guestCount = forGuests === 0 ? 0 : Math.ceil(forGuests / perTable(input.tables));
  const specs = guestTables(guestCount, input.tables);

  const tables: TemplateTable[] = [];
  const fixtures: TemplateFixture[] = [];

  // The top table sits against the top wall, centred, on its own row.
  let cursorY = MARGIN_CM;
  if (input.couple !== "guests") {
    const capacity = input.couple === "top" ? TOP_SEATS : SWEETHEART_SEATS;
    const shape: SeatingTableShape = input.couple === "top" ? "head" : "round";
    const size = tableSize({ shape, capacity, ends_seated: false, width_cm: null, length_cm: null });
    tables.push({
      label: input.couple === "top" ? "Top table" : "Sweetheart table",
      shape,
      capacity,
      pos_x_cm: Math.round(room.widthCm / 2),
      pos_y_cm: Math.round(cursorY + size.width / 2),
      rotation_deg: 0,
    });
    cursorY += size.width + CLEARANCE_CM;
  }

  const wants = new Set(input.elements);
  const place = (el: RoomElement, x: number, y: number) => {
    const size = FIXTURE_SIZES[el];
    fixtures.push({
      kind: el,
      label: size.label,
      pos_x_cm: Math.round(x),
      pos_y_cm: Math.round(y),
      width_cm: size.width,
      depth_cm: size.depth,
    });
  };
  const sideX = room.widthCm - MARGIN_CM;
  let sideY = MARGIN_CM + 150;
  if (wants.has("band")) place("band", room.widthCm / 2, FIXTURE_SIZES.band.depth / 2 + 40);
  let sideUsed = false;
  for (const el of ["bar", "buffet", "cake", "photo_booth"] as const) {
    if (!wants.has(el)) continue;
    const size = FIXTURE_SIZES[el];
    place(el, sideX - size.width / 2, sideY + size.depth / 2);
    sideY += size.depth + 80;
    sideUsed = true;
  }

  // Guest tables in a grid, numbered row by row from the top.
  const usableW = room.widthCm - 2 * MARGIN_CM - (sideUsed ? 400 : 0);
  const sizes = specs.map((s) => tableSize({ ...s, ends_seated: false, width_cm: null, length_cm: null }));
  const cellW = Math.max(0, ...sizes.map((s) => s.length)) + CLEARANCE_CM;
  const cellH = Math.max(0, ...sizes.map((s) => s.width)) + CLEARANCE_CM;
  const perRow = Math.max(1, Math.floor(usableW / (cellW || 1)));
  const rows = guestCount === 0 ? 0 : Math.ceil(guestCount / perRow);
  const startX = MARGIN_CM + (usableW - Math.min(perRow, guestCount) * cellW) / 2 + cellW / 2;

  let fits = true;
  specs.forEach((spec, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = startX + col * cellW;
    const y = cursorY + row * cellH + cellH / 2 - CLEARANCE_CM / 2;
    if (x + cellW / 2 > room.widthCm || y + cellH / 2 > room.depthCm) fits = false;
    tables.push({ label: `Table ${i + 1}`, shape: spec.shape, capacity: spec.capacity, pos_x_cm: Math.round(x), pos_y_cm: Math.round(y), rotation_deg: 0 });
  });

  if (wants.has("dance_floor")) {
    const size = FIXTURE_SIZES.dance_floor;
    const y = Math.min(room.depthCm - MARGIN_CM / 2 - size.depth / 2, cursorY + rows * cellH + size.depth / 2);
    place("dance_floor", room.widthCm / 2, y);
  }

  const seats = tables.reduce((sum, t) => sum + t.capacity, 0);
  const spare = Math.max(0, seats - input.people);
  const summary = `${tables.length} ${tables.length === 1 ? "table" : "tables"} · ${seats} seats for ${input.people} people · ${spare} spare ${spare === 1 ? "chair" : "chairs"}`;
  return { tables, fixtures, seats, spare, summary, fits };
}

/** A number-only label ("12", "Table 12") is a table number; anything else isn't one (§5). */
export function tableNumber(label: string): number | null {
  const m = /^\s*(?:table\s+)?(\d{1,4})\s*$/i.exec(label);
  return m ? Number(m[1]) : null;
}

/**
 * Renaming a table to a number another table already has swaps the two labels.
 * Returns the label changes to make, or null when the table isn't found.
 */
export function planRenumber(
  tables: readonly { id: string; label: string }[],
  tableId: string,
  newLabel: string,
): { id: string; label: string }[] | null {
  const target = tables.find((t) => t.id === tableId);
  if (!target) return null;
  const wanted = newLabel.trim();
  const n = tableNumber(wanted);
  const clash = n === null ? undefined : tables.find((t) => t.id !== tableId && tableNumber(t.label) === n);
  if (!clash) return [{ id: tableId, label: wanted }];
  return [
    { id: tableId, label: wanted },
    { id: clash.id, label: target.label },
  ];
}
