/**
 * Month-grid date math for /calendar (spec 03). Pure functions, no
 * database or React import, same `lib/` convention as
 * src/lib/lists/generate.ts and src/lib/reminders/digest.ts — unit-tested
 * directly, wired into the screen afterwards.
 *
 * All dates are UTC-anchored "YYYY-MM-DD" strings, matching how
 * list_items.due_date is already stored and compared elsewhere in this
 * app (src/lib/reminders/digest.ts, the timeline view) — a calendar day is
 * a date, not an instant, so there is no timezone conversion to get wrong
 * here.
 */

function parseIso(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first of the month, ISO. `monthIso` is any date within the target month. */
export function monthStart(monthIso: string): string {
  const d = parseIso(monthIso);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/** `monthIso` shifted by `delta` whole months, landing on the 1st. */
export function shiftMonth(monthIso: string, delta: number): string {
  const d = parseIso(monthStart(monthIso));
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));
}

export function monthLabel(monthIso: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(parseIso(monthIso));
}

/**
 * Every day cell for the given month, Monday-first, including the leading
 * and trailing days from adjacent months needed to fill whole weeks (a
 * calendar grid with a ragged first/last row is worse than one that shows
 * a few days that belong to neighbouring months). Always 5 or 6 full weeks.
 */
export function monthGrid(monthIso: string): { date: string; inMonth: boolean }[] {
  const first = parseIso(monthStart(monthIso));
  const month = first.getUTCMonth();

  const firstDow = first.getUTCDay(); // 0 Sun .. 6 Sat
  const leading = firstDow === 0 ? 6 : firstDow - 1; // days to back up to Monday

  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - leading);

  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    cells.push({ date: toIso(d), inMonth: d.getUTCMonth() === month });
  }
  return cells;
}

/** Cells grouped into weeks of 7, for rendering as grid rows. */
export function monthWeeks(monthIso: string): { date: string; inMonth: boolean }[][] {
  const cells = monthGrid(monthIso);
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
