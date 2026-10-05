/**
 * "Overdue" for the Today view (spec 26). The rule is the one `buildDigest`
 * (src/lib/reminders/digest.ts) applies — a dated item, not done, due before
 * today, and not snoozed past today — so Today, the dashboard tile and the
 * weekly digest agree about what's late.
 */

import { parseIsoDate, todayIso } from "./generate";

export function isOverdue(
  item: { due_date: string | null; status: string; snoozed_until: string | null },
  today: string = todayIso(),
): boolean {
  if (!item.due_date || item.status === "done") return false;
  if (item.snoozed_until && item.snoozed_until > today) return false;
  return item.due_date < today;
}

/** Whole days between a due date and today; 0 when not yet late. */
export function daysOverdue(dueDate: string, today: string = todayIso()): number {
  const ms = parseIsoDate(today).getTime() - parseIsoDate(dueDate).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function overdueLabel(days: number): string {
  return days === 1 ? "1 day overdue" : `${days} days overdue`;
}
