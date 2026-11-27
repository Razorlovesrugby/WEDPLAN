/**
 * Layouts: the live one and the drafts beside it (spec 57 Part G). Pure — the
 * query builds the summaries, the tabs and the swap confirmation read them.
 */

import type { SeatingAssignment, SeatingGuest } from "./model";
import { isAttending } from "./tray";

export type LayoutSummary = {
  id: string;
  name: string;
  isLive: boolean;
  /** Part D: set while the room is locked. */
  lockedAt: string | null;
  lockedBy: string | null;
  deletedAt: string | null;
  tables: number;
  seated: number;
};

/** A deleted draft stays in "Recently deleted" for this many days. */
export const DELETED_DRAFT_DAYS = 30;

/** The most drafts one event can have (the database enforces it too). */
export const MAX_DRAFTS = 20;

/** The layout to show: the one asked for if it exists and isn't deleted, else the live one, else the first. */
export function chooseLayout(layouts: readonly LayoutSummary[], requested?: string | null): LayoutSummary | null {
  const open = layouts.filter((l) => !l.deletedAt);
  return open.find((l) => l.id === requested) ?? open.find((l) => l.isLive) ?? open[0] ?? null;
}

/** Live first, then drafts by name. */
export function orderLayouts(layouts: readonly LayoutSummary[]): LayoutSummary[] {
  return layouts
    .filter((l) => !l.deletedAt)
    .slice()
    .sort((a, b) => Number(b.isLive) - Number(a.isLive) || a.name.localeCompare(b.name, "en-GB", { numeric: true, sensitivity: "base" }));
}

/** Deleted drafts still inside the 30 days, newest deletion first. */
export function recentlyDeleted(layouts: readonly LayoutSummary[], now: Date = new Date()): LayoutSummary[] {
  const cutoff = now.getTime() - DELETED_DRAFT_DAYS * 86_400_000;
  return layouts
    .filter((l) => l.deletedAt && !l.isLive && Date.parse(l.deletedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!));
}

/** "Draft 1", "Draft 2" … one past the highest already used, for the "Try a layout" prompt. */
export function suggestDraftName(existing: readonly string[]): string {
  let max = 0;
  for (const name of existing) {
    const m = /^draft\s+(\d+)$/i.exec(name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Draft ${max + 1}`;
}

export type SwapReport = {
  /** Coming, but with no seat in the draft (joined or changed their answer since it was copied). */
  unseatedComing: SeatingGuest[];
  /** Seated in the draft, but no longer coming. */
  seatedNotComing: SeatingGuest[];
};

/**
 * What to tell the couple before a draft goes live: anyone coming who has no
 * seat in it, and anyone it seats who has since stopped coming. `draftSeats`
 * are the draft's own seats; "coming" is the same test the tray uses.
 */
export function swapReport(guests: readonly SeatingGuest[], draftSeats: readonly SeatingAssignment[]): SwapReport {
  const seated = new Set(draftSeats.map((a) => a.guestId));
  const unseatedComing = guests.filter((g) => isAttending(g, "yes_pending") && !seated.has(g.id));
  const seatedNotComing = guests.filter((g) => seated.has(g.id) && !isAttending(g, "yes_pending"));
  return { unseatedComing, seatedNotComing };
}
