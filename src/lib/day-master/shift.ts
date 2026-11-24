import { followersOf } from "@/lib/run-sheet";

/**
 * The preview of "Shift the schedule" (spec 55 §5.4), on top of spec 50's
 * scheduling: moving an item moves everything that starts after it (its
 * followers). Items with no predecessor are the fixed ones and stay where they
 * are. Pure.
 */

export type ShiftItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  predecessorId: string | null;
};

export type ShiftScope = "chain" | "only";

export type ShiftPreview = {
  moves: { id: string; title: string; from: string; to: string }[];
  /** Later the same day, but with their own fixed time: left where they are. */
  fixed: { id: string; title: string; startsAt: string }[];
  /** Why it can't be done, or null. */
  problem: string | null;
};

const MIN = 60_000;
const shifted = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * MIN).toISOString();

export function previewShift(
  items: readonly ShiftItem[],
  itemId: string,
  deltaMinutes: number,
  scope: ShiftScope,
  sameDay: (a: string, b: string) => boolean,
): ShiftPreview {
  const item = items.find((i) => i.id === itemId);
  if (!item) return { moves: [], fixed: [], problem: "That item no longer exists" };
  if (!Number.isInteger(deltaMinutes) || deltaMinutes === 0 || Math.abs(deltaMinutes) > 1440) {
    return { moves: [], fixed: [], problem: "Pick a number of minutes" };
  }

  const followers = followersOf(items, itemId);
  if (scope === "only" && followers.size > 0) {
    return {
      moves: [],
      fixed: [],
      problem: `${followers.size} ${followers.size === 1 ? "item starts" : "items start"} after this one, so they move with it. Shift this item and what follows instead.`,
    };
  }

  // An item that starts after another can't move to before that item ends.
  if (item.predecessorId && deltaMinutes < 0) {
    const pred = items.find((i) => i.id === item.predecessorId);
    if (pred && Date.parse(shifted(item.startsAt, deltaMinutes)) < Date.parse(pred.endsAt)) {
      return { moves: [], fixed: [], problem: `It can't start before “${pred.title}” ends` };
    }
  }

  const movingIds = scope === "chain" ? new Set([itemId, ...followers]) : new Set([itemId]);
  const moves = items
    .filter((i) => movingIds.has(i.id))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((i) => ({ id: i.id, title: i.title, from: i.startsAt, to: shifted(i.startsAt, deltaMinutes) }));
  const fixed =
    scope === "chain"
      ? items
          .filter((i) => !movingIds.has(i.id) && Date.parse(i.startsAt) >= Date.parse(item.startsAt) && sameDay(i.startsAt, item.startsAt))
          .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
          .map((i) => ({ id: i.id, title: i.title, startsAt: i.startsAt }))
      : [];
  return { moves, fixed, problem: null };
}

/** "7 items, 3:30 → 3:40 … 9:00 → 9:10": the one-line summary. */
export function describeShift(preview: ShiftPreview, format: (iso: string) => string): string {
  if (preview.moves.length === 0) return "Nothing moves";
  const first = preview.moves[0]!;
  const last = preview.moves[preview.moves.length - 1]!;
  const count = `${preview.moves.length} ${preview.moves.length === 1 ? "item" : "items"}`;
  if (preview.moves.length === 1) return `${count}, ${format(first.from)} → ${format(first.to)}`;
  return `${count}, ${format(first.from)} → ${format(first.to)} … ${format(last.from)} → ${format(last.to)}`;
}
