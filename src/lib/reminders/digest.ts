/**
 * Pure content logic for the weekly reminder digest (spec 02). Kept out of
 * the cron route and out of any database type, same reasoning as
 * src/lib/lists/generate.ts: a route handler can only export HTTP methods,
 * so anything worth unit-testing has to live beside it, not inside it.
 *
 * Deliberately decoupled from src/lib/types/database.ts — DigestItem is a
 * narrow shape any caller can build from a TimelineItemView row (or a test
 * fixture) without this module needing to know the database's types at all.
 */

import { addDays, todayIso } from "@/lib/lists/generate";

export type DigestItem = {
  id: string;
  title: string;
  due_date: string;
  list_title: string;
  list_color: string | null;
  snoozed_until: string | null;
  done: boolean;
  /**
   * "list_item" (the default) or "payment" — spec 6's v_reminders_due unions
   * unpaid payments into the same digest a checklist item already renders
   * in. Only affects wording (digestEmail says "payment due" rather than
   * "overdue task"); bucketing and sorting are identical either way.
   */
  source?: "list_item" | "payment";
};

export type DigestListGroup = {
  listTitle: string;
  listColor: string | null;
  overdue: DigestItem[];
  dueSoon: DigestItem[];
};

export type DigestContent = {
  overdueCount: number;
  dueSoonCount: number;
  /** Only lists with at least one item in either bucket. Sorted by list title for a stable order. */
  groups: DigestListGroup[];
};

/**
 * Buckets every dated, undone, unsnoozed item into "overdue" or "due within
 * `windowDays`", grouped by originating list — the same grouping `/timeline`
 * uses (spec 01, section 6), so the digest and the screen it links to read
 * the same way. Anything further out than the window, done, or currently
 * snoozed (`snoozed_until` in the future) is excluded entirely rather than
 * bucketed — a snoozed item "simply drops out of the digest" (spec 02,
 * section 2), it doesn't show up as a third kind of entry.
 */
export function buildDigest(items: DigestItem[], today: string = todayIso(), windowDays = 7): DigestContent {
  const windowEnd = addDays(today, windowDays - 1);
  const groupsByList = new Map<string, DigestListGroup>();

  for (const item of items) {
    if (item.done) continue;
    if (item.snoozed_until && item.snoozed_until > today) continue;
    if (item.due_date > windowEnd) continue;

    const bucket: "overdue" | "dueSoon" = item.due_date < today ? "overdue" : "dueSoon";
    let group = groupsByList.get(item.list_title);
    if (!group) {
      group = { listTitle: item.list_title, listColor: item.list_color, overdue: [], dueSoon: [] };
      groupsByList.set(item.list_title, group);
    }
    group[bucket].push(item);
  }

  const groups = [...groupsByList.values()].sort((a, b) => a.listTitle.localeCompare(b.listTitle));
  for (const group of groups) {
    group.overdue.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    group.dueSoon.sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
  }

  return {
    overdueCount: groups.reduce((n, g) => n + g.overdue.length, 0),
    dueSoonCount: groups.reduce((n, g) => n + g.dueSoon.length, 0),
    groups,
  };
}

/** Whether a digest is worth sending at all — see spec 02 section 7's "what if nothing is due" decision. */
export function hasAnythingToReport(digest: DigestContent): boolean {
  return digest.overdueCount > 0 || digest.dueSoonCount > 0;
}

function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

/**
 * ISO 8601 week identifier ("2027-W23"), UTC. The dedupe key for a digest
 * send is `digest:{wedding_id}:{isoWeek}:{recipient}` — a retried cron
 * collides on message_log's existing unique index and is skipped, the same
 * mechanism the RSVP reminder cron already relies on, so a week is
 * identified the same way regardless of which day within it the cron
 * actually ran (a delayed run, a manual re-trigger) still dedupes correctly.
 */
export function isoWeek(dateIso: string): string {
  const date = parseIsoDate(dateIso);
  const dayNum = (date.getUTCDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday, per ISO 8601

  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);

  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
