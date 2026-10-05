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
