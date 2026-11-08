/**
 * Move one item within a list, returning a new list (spec 28 §7.1).
 *
 * The one rule behind every "move this row" in the editor — the repeating rows
 * in a block, and the RSVP questions — so a drag, a ↑ and a ↓ all land an item
 * in the same place. `to` is the index the item should END UP at, clamped into
 * the list, and a `from` that is not in the list changes nothing.
 */
export function moveWithin<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (!Number.isInteger(from) || from < 0 || from >= next.length) return next;

  const target = Math.max(0, Math.min(next.length - 1, Math.trunc(to)));
  if (target === from) return next;

  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

/**
 * Where "Move up / down / to top / to bottom" would put the item at `index`
 * in a list of `count` (spec 45). Null where the move would do nothing, so the
 * menu can leave that item out.
 */
export function moveTargets(
  index: number,
  count: number,
): { up: number | null; down: number | null; top: number | null; bottom: number | null } {
  const valid = index >= 0 && index < count;
  return {
    up: valid && index > 0 ? index - 1 : null,
    down: valid && index < count - 1 ? index + 1 : null,
    top: valid && index > 1 ? 0 : null,
    bottom: valid && index < count - 2 ? count - 1 : null,
  };
}
