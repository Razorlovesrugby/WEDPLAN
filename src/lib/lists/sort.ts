/**
 * Stable partition: everything `isDone` returns false for, in its original
 * relative order, followed by everything it returns true for, also in its
 * original relative order. Used to sink completed items to the bottom of a
 * checklist without otherwise disturbing manual ordering (spec 10).
 */
export function sortCompletedLast<T>(items: readonly T[], isDone: (item: T) => boolean): T[] {
  const active: T[] = [];
  const done: T[] = [];
  for (const item of items) (isDone(item) ? done : active).push(item);
  return [...active, ...done];
}
