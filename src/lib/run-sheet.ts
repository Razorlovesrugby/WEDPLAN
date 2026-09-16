/**
 * Pure chain-resolution and conflict-detection logic for spec 5, part B (the
 * day-of run sheet).
 *
 * Duplicates the recursive CTE in `v_run_sheet_items` deliberately, the same
 * "duplicate the view's logic, test against the SQL suite" pattern
 * src/lib/tier.ts and src/lib/budget.ts already establish — the item
 * editor's live preview of a computed start time needs the same answer as
 * the server without a round trip. If the two ever disagree, one of
 * `run-sheet.test.ts` or `supabase/tests/04_run_sheet.sql` fails.
 */

export type RunSheetItemInput = {
  id: string;
  eventId: string;
  pinned: boolean;
  /** ISO instant. Set iff `pinned`. */
  pinnedAt: string | null;
  durationMinutes: number;
  /** Null for a pinned item, or an unpinned one with no predecessor yet ("time TBD"). */
  predecessorId: string | null;
  offsetMinutes: number;
};

export type ResolvedTime = {
  /** ISO instant, or null when this item is unpinned with no (resolvable) predecessor. */
  startsAt: string | null;
  endsAt: string | null;
};

function addMinutes(iso: string | null, minutes: number): string | null {
  if (iso === null) return null;
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/**
 * Resolves starts_at/ends_at for every item, memoised and cycle-safe.
 *
 * A pinned item is its own anchor. An unpinned item with a predecessor
 * chains off that predecessor's resolved ends_at plus its own offset — if
 * the predecessor is itself unresolved ("time TBD" or part of a cycle),
 * null propagates forward, same as the SQL view. A genuine predecessor
 * cycle (never possible through normal reordering, but not something the
 * data model rules out) resolves every item in the cycle to null rather
 * than recursing forever.
 */
export function resolveRunSheetTimes(items: RunSheetItemInput[]): Map<string, ResolvedTime> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const resolved = new Map<string, ResolvedTime>();
  const inProgress = new Set<string>();

  function resolve(id: string): ResolvedTime {
    const cached = resolved.get(id);
    if (cached) return cached;

    const item = byId.get(id);
    if (!item) return { startsAt: null, endsAt: null };

    if (inProgress.has(id)) {
      const tbd: ResolvedTime = { startsAt: null, endsAt: null };
      resolved.set(id, tbd);
      return tbd;
    }
    inProgress.add(id);

    let result: ResolvedTime;
    if (item.pinned) {
      result = { startsAt: item.pinnedAt, endsAt: addMinutes(item.pinnedAt, item.durationMinutes) };
    } else if (item.predecessorId) {
      const predecessor = resolve(item.predecessorId);
      const startsAt = addMinutes(predecessor.endsAt, item.offsetMinutes);
      result = { startsAt, endsAt: addMinutes(startsAt, item.durationMinutes) };
    } else {
      result = { startsAt: null, endsAt: null };
    }

    inProgress.delete(id);
    resolved.set(id, result);
    return result;
  }

  for (const item of items) resolve(item.id);
  return resolved;
}

/**
 * Items whose computed end runs past the next pinned anchor (by time, same
 * event) that comes after they start — "warn, never hard-block", the same
 * rule V3 specifies for seating constraints (spec 5, B2). A "time TBD" item
 * (no resolvable start) never conflicts — there is nothing to compare yet.
 */
export function computeConflicts(
  items: RunSheetItemInput[],
  times: Map<string, ResolvedTime>,
): Set<string> {
  const pinnedByEvent = new Map<string, string[]>();
  for (const item of items) {
    const time = times.get(item.id);
    if (item.pinned && time?.startsAt) {
      const list = pinnedByEvent.get(item.eventId) ?? [];
      list.push(time.startsAt);
      pinnedByEvent.set(item.eventId, list);
    }
  }
  for (const list of pinnedByEvent.values()) list.sort();

  const conflicts = new Set<string>();
  for (const item of items) {
    const time = times.get(item.id);
    if (!time?.startsAt || !time.endsAt) continue;

    const pins = pinnedByEvent.get(item.eventId) ?? [];
    const nextPin = pins.find((pinnedAt) => pinnedAt > time.startsAt!);
    if (nextPin && time.endsAt > nextPin) conflicts.add(item.id);
  }
  return conflicts;
}
