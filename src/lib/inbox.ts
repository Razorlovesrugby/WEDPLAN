/**
 * The Inbox (spec 43 §4.1): everything guests send in, in one list. Pure, so
 * "what needs you" is decided in one tested place and the sidebar badge and
 * the list can't disagree.
 */

export const INBOX_KINDS = ["question", "song", "guestbook", "claim", "unable"] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  question: "Question",
  song: "Song",
  guestbook: "Guestbook",
  claim: "Registry",
  unable: "Can't come",
};

/** Filters, in the order the segmented control shows them. "needs" is the default view. */
export const INBOX_FILTERS = ["needs", "all", "question", "song", "guestbook", "claim", "unable"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];
export const INBOX_FILTER_LABEL: Record<InboxFilter, string> = {
  needs: "Needs you",
  all: "All",
  question: "Questions",
  song: "Songs",
  guestbook: "Guestbook",
  claim: "Registry",
  unable: "Can't come",
};
export function isInboxFilter(value: string | undefined): value is InboxFilter {
  return (INBOX_FILTERS as readonly string[]).includes(value ?? "");
}

/** "Can't come" has no read flag, so it shows for this long (spec 43 Q2). */
export const UNABLE_WINDOW_DAYS = 14;

export type InboxItem = {
  kind: InboxKind;
  id: string;
  who: string;
  preview: string;
  /** ISO timestamp it arrived. */
  at: string;
  needsYou: boolean;
  /** The source's own status, for the inline actions. */
  status: string;
  /** Where the full record lives. */
  href: string;
};

type Named = { householdName?: string | null; author_name?: string | null };
const named = (row: Named, fallback: string) => row.householdName?.trim() || row.author_name?.trim() || fallback;

export function fromQuestion(row: Named & { id: string; body: string; status: string; created_at: string }): InboxItem {
  return {
    kind: "question",
    id: row.id,
    who: named(row, "A guest"),
    preview: row.body,
    at: row.created_at,
    needsYou: row.status === "new",
    status: row.status,
    href: "/site/questions",
  };
}

export function fromSong(row: {
  id: string;
  title: string;
  artist: string | null;
  status: string;
  createdAt: string;
  askedBy: string | null;
}): InboxItem {
  return {
    kind: "song",
    id: row.id,
    who: row.askedBy?.trim() || "A guest",
    preview: row.artist ? `${row.title} — ${row.artist}` : row.title,
    at: row.createdAt,
    needsYou: row.status === "new",
    status: row.status,
    href: "/site/songs",
  };
}

export function fromNote(row: Named & { id: string; body: string; status: string; created_at: string }): InboxItem {
  return {
    kind: "guestbook",
    id: row.id,
    who: named(row, "A guest"),
    preview: row.body,
    at: row.created_at,
    needsYou: row.status === "new",
    status: row.status,
    href: "/site/guestbook",
  };
}

/** A claim needs you until the couple has looked at Claims since it arrived; a released one never does. */
export function fromClaim(
  row: { id: string; name: string; item_title: string; quantity: number; status: string; created_at: string; released_at: string | null },
  lastViewedClaimsAt: string | null,
): InboxItem {
  return {
    kind: "claim",
    id: row.id,
    who: row.name,
    preview: `${row.quantity > 1 ? `${row.quantity} × ` : ""}${row.item_title}${row.released_at ? " (released)" : ""}`,
    at: row.created_at,
    needsYou: row.released_at === null && (!lastViewedClaimsAt || row.created_at > lastViewedClaimsAt),
    status: row.status,
    href: "/gifts/claims",
  };
}

/** Only called for the last 14 days' can't-comes, and every one of those needs you. */
export function fromUnable(row: {
  guestId: string;
  guestName: string;
  householdId: string;
  householdName: string;
  at: string;
}): InboxItem {
  return {
    kind: "unable",
    id: row.guestId,
    who: row.householdName,
    preview: `${row.guestName} can't come`,
    at: row.at,
    needsYou: true,
    status: "unable",
    href: `/households/${row.householdId}`,
  };
}

/** Newest first, ties broken by kind then id so the order is stable. */
export function sortInbox(items: readonly InboxItem[]): InboxItem[] {
  return [...items].sort(
    (a, b) => b.at.localeCompare(a.at) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id),
  );
}

export function filterInbox(items: readonly InboxItem[], filter: InboxFilter): InboxItem[] {
  if (filter === "all") return [...items];
  if (filter === "needs") return items.filter((item) => item.needsYou);
  return items.filter((item) => item.kind === filter);
}

export function needsYouCount(items: readonly InboxItem[]): number {
  return items.filter((item) => item.needsYou).length;
}

/** The start of the can't-come window, as an ISO timestamp. */
export function unableSince(now: Date, days = UNABLE_WINDOW_DAYS): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
