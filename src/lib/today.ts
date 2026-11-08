/**
 * "Next up" on Today (spec 43 §4.2): up to six short lines, each a link,
 * chosen in a fixed priority from figures the overview already loads. Pure,
 * so the rules are tested rather than read off a page.
 */

export type NextUpTone = "bad" | "warn" | "neutral";
export type NextUpLine = { text: string; href: string; tone: NextUpTone };

export const NEXT_UP_LIMIT = 6;

export type TodayInput = {
  /** "Today" in the wedding's own timezone, YYYY-MM-DD (spec 40). */
  today: string;
  overdueTasks: number;
  dueThisWeekTasks: number;
  /** Unpaid payments with a due date. */
  payments: { due_date: string | null; paid_at: string | null; item_label: string }[];
  inbox: { needsYou: number };
  /** Households with a save the date sent but no invitation sent. */
  saveTheDateNoInvitation: number;
  /** Households who opened the invitation and haven't answered. */
  silentHouseholds: number;
  overCapacity: number;
  /** Days until the RSVP lock, or null when none is set. */
  rsvpLockDays: number | null;
};

const s = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** YYYY-MM-DD plus n days, in plain calendar arithmetic (no timezone involved). */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return date.toISOString().slice(0, 10);
}

export function nextUp(input: TodayInput): NextUpLine[] {
  const lines: NextUpLine[] = [];

  if (input.overdueTasks > 0) {
    lines.push({ text: `${s(input.overdueTasks, "task")} overdue`, href: "/lists", tone: "bad" });
  }

  const weekEnd = addDays(input.today, 7);
  const unpaid = input.payments.filter((payment) => !payment.paid_at && payment.due_date);
  const overduePayments = unpaid.filter((payment) => payment.due_date! < input.today);
  const dueSoon = unpaid.filter((payment) => payment.due_date! >= input.today && payment.due_date! <= weekEnd);
  if (overduePayments.length > 0) {
    lines.push({ text: `${s(overduePayments.length, "payment")} past due`, href: "/budget", tone: "bad" });
  }
  if (dueSoon.length === 1) {
    lines.push({ text: `Payment for ${dueSoon[0]!.item_label || "a budget line"} due this week`, href: "/budget", tone: "warn" });
  } else if (dueSoon.length > 1) {
    lines.push({ text: `${dueSoon.length} payments due this week`, href: "/budget", tone: "warn" });
  }

  if (input.inbox.needsYou > 0) {
    lines.push({ text: `${s(input.inbox.needsYou, "thing")} from guests in your Inbox`, href: "/inbox", tone: "warn" });
  }

  if (input.saveTheDateNoInvitation > 0) {
    lines.push({
      text: `${s(input.saveTheDateNoInvitation, "household has", "households have")} a save the date but no invitation`,
      href: "/invitations?stage=invitation",
      tone: "neutral",
    });
  }
  if (input.silentHouseholds > 0) {
    lines.push({
      text: `${s(input.silentHouseholds, "household")} opened the invitation and haven't replied`,
      href: "/invitations?status=silent",
      tone: "neutral",
    });
  }

  if (input.overCapacity > 0) {
    lines.push({ text: `${s(input.overCapacity, "seat")} over capacity above the cut`, href: "/guests/rank", tone: "bad" });
  }

  if (input.rsvpLockDays !== null && input.rsvpLockDays >= 0 && input.rsvpLockDays < 14) {
    lines.push({
      text: input.rsvpLockDays === 0 ? "RSVPs close today" : `RSVPs close in ${s(input.rsvpLockDays, "day")}`,
      href: "/invitations?stage=invitation&step=track",
      tone: "warn",
    });
  }

  if (lines.length < NEXT_UP_LIMIT && input.dueThisWeekTasks > 0) {
    lines.push({ text: `${s(input.dueThisWeekTasks, "task")} due this week`, href: "/lists", tone: "neutral" });
  }

  return lines.slice(0, NEXT_UP_LIMIT);
}
