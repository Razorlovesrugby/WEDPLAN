/**
 * "I already know I can't come" (spec 29) — the parts that are just logic.
 *
 * It is a flag on a guest (`guests.unable_to_attend_at`), deliberately NOT an
 * RSVP: nothing here ever reads or writes `rsvps`, and the chase cron, the
 * "Answers" column and the invitation page never hear about it (§4.1). Keeping
 * the rules in `lib/` is what lets the guest's page, the planner's table, the
 * stationery print, the cron and the send guard agree on what "everybody in
 * this household has said they can't come" means.
 */

/** Who told us — `planner` when it was recorded by hand ("they texted me"). */
export type UnableVia = "save_the_date" | "planner";

/** "Ana", "Ana and Ben", "Ana, Ben and Cy" — never "Ana, Ben, and Cy". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  const last = names[names.length - 1] as string;
  if (names.length === 1) return last;
  return `${names.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * Has everybody on the list said they can't come?
 *
 * Counts from the view's `guest_total` / `unable_count` (the raw flag, not the
 * headcount rule: a guest who has since answered Yes is still "flagged" here,
 * because the bulk guards ask what the planner was told, and the household
 * page shows both).
 *
 * An empty household is never "all unable": nothing to decline, nothing to
 * skip, and vacuous truth would silently drop a household that simply has no
 * guests yet from every bulk action.
 */
export function isAllUnable(guestTotal: number | null, unableCount: number | null): boolean {
  return (guestTotal ?? 0) > 0 && (unableCount ?? 0) >= (guestTotal ?? 0);
}

/**
 * Is this guest left out of the counts? Flagged as unable to attend, and has
 * not since answered Yes to anything.
 *
 * **This mirrors `public.guest_excluded_from_counts()` (migration 0034) — change
 * both together.** The SQL is the one the views and the budget read; this copy
 * exists for the places that already hold a guest and its RSVPs in memory (the
 * `/guests` list's "haven't answered" filter), the same arrangement as
 * `lib/lists/overdue.ts` and `buildDigest`. A Yes outranks the flag: the flag
 * says "told us in advance", the answer is the answer.
 */
export function isExcludedFromCounts(guest: {
  unable_to_attend_at: string | null;
  rsvps: readonly { status: string }[];
}): boolean {
  return guest.unable_to_attend_at !== null && !guest.rsvps.some((rsvp) => rsvp.status === "yes");
}

/** "Leaves out 3 guests who can't come" — the note beside a figure that moved. */
export function leftOutNote(count: number): string | null {
  if (count <= 0) return null;
  return `Leaves out ${count} ${count === 1 ? "guest" : "guests"} who can't come.`;
}

/** Some, but not everyone. This household is still invited (spec 29 §4.5). */
export function isPartlyUnable(guestTotal: number | null, unableCount: number | null): boolean {
  return (unableCount ?? 0) > 0 && !isAllUnable(guestTotal, unableCount);
}

/**
 * The chip on `/invitations`: "Can't attend: Ana, Ben", or "All can't attend"
 * when every guest is flagged. Null when nobody is, so the caller renders
 * nothing rather than an empty badge.
 */
export function unableChip(
  guestTotal: number | null,
  names: readonly string[],
): { label: string; all: boolean } | null {
  if (names.length === 0) return null;
  if (isAllUnable(guestTotal, names.length)) return { label: "All can't attend", all: true };
  return { label: `Can't attend: ${joinNames(names)}`, all: false };
}

/**
 * The confirm shown before an individual send, create or print would include
 * someone who has said they can't come. Plural-neutral and pronoun-free on
 * purpose: "they" is the only form that is right for every guest.
 */
export function sendAnywayMessage(names: readonly string[], what = "send the invitation"): string {
  return `${joinNames(names)} told us they can't come. ${
    what.charAt(0).toUpperCase() + what.slice(1)
  } anyway?`;
}

/**
 * Which of the ids a browser sent really belong to this household.
 *
 * The decline action is a public write behind a link. It never trusts a guest
 * id from the client (spec 29 §4.3.2): the household is resolved from the
 * address, its guests are loaded, and this keeps only the intersection. An id
 * from another household — or another wedding — simply isn't in `allowed`, so
 * it falls away and changes nothing.
 *
 * Duplicates collapse. `ignored` is how many ids were dropped, so the action
 * can tell a stale page (a guest was cut since it loaded) from nothing chosen.
 */
export function householdGuestIds(
  requested: readonly string[],
  allowed: readonly string[],
): { ids: string[]; ignored: number } {
  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  const ids: string[] = [];
  let ignored = 0;
  for (const id of requested) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (allowedSet.has(id)) ids.push(id);
    else ignored += 1;
  }
  return { ids, ignored };
}

/**
 * What the guest is told after saving. Names only; nothing about attendance to
 * confirm.
 *
 * "Won't be sent a formal invitation" is only true when EVERYONE on the page
 * has said so — the invitation is the household's, and it still goes to
 * whoever is coming. When only some have, the page says it has noted them and
 * promises nothing else.
 */
export function declinedConfirmation(names: readonly string[], everyoneHasDeclined = true): string {
  const who = joinNames(names);
  if (!who) return "Thank you for letting us know — we'll miss you.";
  return everyoneHasDeclined
    ? `Thank you for letting us know — we'll miss you. ${who} won't be sent a formal invitation.`
    : `Thank you for letting us know — we'll miss ${who}. We've noted that.`;
}

// ---------------------------------------------------------------------------
// /invitations filters and counts
// ---------------------------------------------------------------------------

type HouseholdCounts = {
  guest_total?: number | null;
  unable_count?: number | null;
  std_sent_at?: string | null;
};

/** `?status=std_unsent` — nothing ticked as a save-the-date yet. */
export function saveTheDateUnsent(summary: HouseholdCounts | null | undefined): boolean {
  return !summary?.std_sent_at;
}

/** `?status=unable` — anyone in the household has said they can't come. */
export function hasUnable(summary: HouseholdCounts | null | undefined): boolean {
  return (summary?.unable_count ?? 0) > 0;
}
