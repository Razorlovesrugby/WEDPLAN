/**
 * Pure logic for the run sheet (spec 50): lanes for overlapping items, the
 * 06:00 day boundary, "starts after" bookkeeping, and the same-assignee
 * overlap rule.
 *
 * Times are stored (`starts_at`, `ends_at`); an item with a predecessor
 * satisfies `starts_at = predecessor.ends_at + offset_minutes`. The server
 * maintains that in `save_run_sheet_item`, `shift_run_sheet_item` and
 * `delete_run_sheet_item` (migration 0048). Nothing here writes. The
 * cascade itself lives in SQL and is tested against the SQL suite; this file
 * holds what the screen needs to lay things out and to explain a choice
 * before it is saved.
 */

import { zonedInputToUtc } from "./timezone";
import type { RunSheetAssigneeType, RunSheetItemView } from "./types/database";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A day on the run sheet runs from 06:00 to 06:00 in the wedding's timezone. */
export const DAY_STARTS_AT_HOUR = 6;

/** An item's length is capped by the end of its day, not by a fixed number of hours. */
export const MAX_GAP_MINUTES = 1440;

export type TimedItem = { id: string; startsAt: string; endsAt: string };

/** Someone on an item, or someone the picker can add: a collaborator, guest, vendor or person. */
export type RunSheetAssignee = {
  /** `type:id`, unique across the four sources. */
  key: AssigneeKey;
  type: RunSheetAssigneeType;
  id: string;
  label: string;
};

/** What a task holds for the people helping (spec 54 §10.1). Separate from the couple's private notes. */
export type HelperContent = {
  instructions: string | null;
  address: string | null;
  critical: boolean;
  contactId: string | null;
  steps: string[];
  bring: string[];
};

export type RunSheetItem = RunSheetItemView & { assignees: RunSheetAssignee[]; helper: HelperContent };

/** Up to 12 steps and 12 bring items per task (§11). One per line, blanks dropped. */
export const MAX_STEPS = 12;
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Overlap
// ---------------------------------------------------------------------------

/** Two items overlap when each starts before the other ends. Touching is not overlapping. */
export function overlaps(a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }): boolean {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(a.endsAt) > Date.parse(b.startsAt);
}

export type AssigneeKey = string;

export function assigneeKey(type: string, id: string): AssigneeKey {
  return `${type}:${id}`;
}

/**
 * The items that overlap `target` in time and share at least one assignee
 * with it. Mirrors `conflict` in `v_run_sheet_items`; the editor uses it to
 * say which items, before the item is saved.
 */
export function conflictingItems<T extends TimedItem & { assignees: readonly AssigneeKey[] }>(
  target: TimedItem & { assignees: readonly AssigneeKey[] },
  others: readonly T[],
): T[] {
  if (target.assignees.length === 0) return [];
  const mine = new Set(target.assignees);
  return others.filter(
    (other) => other.id !== target.id && overlaps(target, other) && other.assignees.some((key) => mine.has(key)),
  );
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

export type LanePlacement = {
  /** Zero-based column within its cluster of overlapping items. */
  lane: number;
  /** How many columns that cluster needs. */
  lanes: number;
  /** How many columns this item may occupy: its own plus free ones to its right. */
  span: number;
};

/**
 * Places overlapping items side by side, as a calendar day view does.
 *
 * Items are sorted by start, grouped into clusters that overlap one another
 * (directly or through a chain), and each is put in the first lane that is
 * free at its start. Then each item widens to the lanes on its right that
 * nothing in its cluster uses while it runs.
 *
 * `minMinutes` is the shortest an item is drawn. A zero-length item (a
 * milestone) still takes up room, so it does not sit on top of a neighbour.
 */
export function packLanes(items: readonly TimedItem[], minMinutes = 15): Map<string, LanePlacement> {
  const drawn = items
    .map((item) => {
      const start = Date.parse(item.startsAt);
      const end = Math.max(Date.parse(item.endsAt), start + minMinutes * MINUTE);
      return { id: item.id, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));

  const placements = new Map<string, LanePlacement>();

  let cluster: typeof drawn = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const laneOf = new Map<string, number>();
    for (const item of cluster) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }
      laneOf.set(item.id, lane);
    }
    const lanes = laneEnds.length;
    for (const item of cluster) {
      const lane = laneOf.get(item.id)!;
      let span = 1;
      for (let next = lane + 1; next < lanes; next += 1) {
        const blocked = cluster.some(
          (other) =>
            other.id !== item.id && laneOf.get(other.id) === next && other.start < item.end && other.end > item.start,
        );
        if (blocked) break;
        span += 1;
      }
      placements.set(item.id, { lane, lanes, span });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of drawn) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();

  return placements;
}

// ---------------------------------------------------------------------------
// Days (06:00 to 06:00 in the wedding's timezone)
// ---------------------------------------------------------------------------

type LocalParts = { y: number; m: number; d: number; hour: number };

function localParts(ms: number, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), hour: get("hour") };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return keyOf(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** The day an instant belongs to, as "YYYY-MM-DD". A 00:30 item belongs to the evening before. */
export function dayKeyOf(iso: string, timeZone: string): string {
  const p = localParts(Date.parse(iso), timeZone);
  const key = keyOf(p.y, p.m, p.d);
  return p.hour < DAY_STARTS_AT_HOUR ? addDays(key, -1) : key;
}

/** Start (inclusive) and end (exclusive) of a day, as instants. */
export function dayWindow(dayKey: string, timeZone: string): { startMs: number; endMs: number } {
  const start = zonedInputToUtc(`${dayKey}T${pad(DAY_STARTS_AT_HOUR)}:00`, timeZone);
  const end = zonedInputToUtc(`${addDays(dayKey, 1)}T${pad(DAY_STARTS_AT_HOUR)}:00`, timeZone);
  if (!start || !end) throw new Error(`Not a day: ${dayKey}`);
  return { startMs: Date.parse(start), endMs: Date.parse(end) };
}

/** The latest an item starting at `startIso` may end: 06:00 the next morning. */
export function latestEnd(startIso: string, timeZone: string): string {
  return new Date(dayWindow(dayKeyOf(startIso, timeZone), timeZone).endMs).toISOString();
}

/** Why a start and end cannot be saved, or null when they can. */
export function timesProblem(startIso: string, endIso: string, timeZone: string): string | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return "Give the item a start and an end";
  if (end < start) return "The end cannot be before the start";
  if (end > Date.parse(latestEnd(startIso, timeZone))) return "An item can run until 06:00 the next morning at the latest";
  return null;
}

/** Every day that has an item on it, in order. */
export function daysWithItems(items: readonly TimedItem[], timeZone: string): string[] {
  return [...new Set(items.map((item) => dayKeyOf(item.startsAt, timeZone)))].sort();
}

/**
 * The day the timeline opens on: the wedding date when it has items, else the
 * earliest day with items. Null when there are no items.
 */
export function defaultDay(days: readonly string[], weddingDate: string | null): string | null {
  if (days.length === 0) return null;
  if (weddingDate && days.includes(weddingDate)) return weddingDate;
  return days[0] ?? null;
}

/** The timeline's vertical range: first start to last end, padded by 30 minutes, rounded out to whole hours. */
export function axisRange(items: readonly TimedItem[]): { startMs: number; endMs: number } | null {
  if (items.length === 0) return null;
  const first = Math.min(...items.map((i) => Date.parse(i.startsAt)));
  const last = Math.max(...items.map((i) => Date.parse(i.endsAt)));
  return {
    startMs: Math.floor((first - 30 * MINUTE) / HOUR) * HOUR,
    endMs: Math.ceil((last + 30 * MINUTE) / HOUR) * HOUR,
  };
}

// ---------------------------------------------------------------------------
// Starts after
// ---------------------------------------------------------------------------

/** Where an item starts when it starts `offsetMinutes` after an item that ends at `predecessorEndsAt`. */
export function followerStart(predecessorEndsAt: string, offsetMinutes: number): string {
  return new Date(Date.parse(predecessorEndsAt) + offsetMinutes * MINUTE).toISOString();
}

export function spanMinutes(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / MINUTE);
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * MINUTE).toISOString();
}

type Linked = { id: string; predecessorId: string | null };

/** Every item that starts after `id`, directly or through others. */
export function followersOf(items: readonly Linked[], id: string): Set<string> {
  const byPredecessor = new Map<string, string[]>();
  for (const item of items) {
    if (!item.predecessorId) continue;
    const list = byPredecessor.get(item.predecessorId) ?? [];
    list.push(item.id);
    byPredecessor.set(item.predecessorId, list);
  }
  const found = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of byPredecessor.get(current) ?? []) {
      if (found.has(next)) continue;
      found.add(next);
      queue.push(next);
    }
  }
  return found;
}

/** True when `itemId` starting after `predecessorId` would make the two follow each other in a loop. */
export function wouldLoop(items: readonly Linked[], itemId: string, predecessorId: string): boolean {
  return predecessorId === itemId || followersOf(items, itemId).has(predecessorId);
}
