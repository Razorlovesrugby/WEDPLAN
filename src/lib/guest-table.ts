import { inviteState, type InviteRow, type InviteState } from "./invites";
import type { RsvpStatus } from "./types/database";
import { isExcludedFromCounts } from "./unable-to-attend";

/**
 * The guest table's shape (spec 47): which columns each view shows, how people
 * group into households, and the per-event reply counts above the table.
 *
 * Pure, so the grid, its summary bars and the tests agree on one set of rules.
 */

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type GuestView = "rsvp" | "contact" | "catering" | "planning" | "all";

export type GuestColumn =
  | "tier"
  | "side"
  | "email"
  | "address"
  | "age"
  | "dietary"
  | "coming"
  | "tags"
  | "std"
  | "events"
  | "links";

export const GUEST_VIEWS: readonly { id: GuestView; label: string; columns: readonly GuestColumn[] }[] = [
  { id: "rsvp", label: "RSVP", columns: ["tier", "side", "std", "events", "links"] },
  { id: "contact", label: "Contact", columns: ["email", "address", "std", "links"] },
  { id: "catering", label: "Catering", columns: ["age", "dietary", "coming", "links"] },
  { id: "planning", label: "Planning", columns: ["tier", "side", "tags", "links"] },
  {
    id: "all",
    label: "Everything",
    columns: ["tier", "side", "email", "address", "dietary", "tags", "std", "events", "links"],
  },
];

export const DEFAULT_VIEW: GuestView = "rsvp";

/** `?view=` from the URL. Anything unknown is the default, so an old link still opens. */
export function parseGuestView(value: string | string[] | null | undefined): GuestView {
  const single = Array.isArray(value) ? value[0] : value;
  return GUEST_VIEWS.find((view) => view.id === single)?.id ?? DEFAULT_VIEW;
}

export function columnsFor(view: GuestView): readonly GuestColumn[] {
  return GUEST_VIEWS.find((entry) => entry.id === view)!.columns;
}

/** `?rows=people` is the flat list; anything else groups by household. */
export function parseGrouped(value: string | string[] | null | undefined): boolean {
  const single = Array.isArray(value) ? value[0] : value;
  return single !== "people";
}

// ---------------------------------------------------------------------------
// Status words
// ---------------------------------------------------------------------------

/** The full words behind each cell's symbol, for its label and the legend. */
export const STATE_DESCRIPTION: Record<InviteState, string> = {
  not_invited: "Not invited",
  invited: "Invited, not sent yet",
  sent: "Sent, no answer yet",
  yes: "Coming",
  no: "Not coming",
  maybe: "Maybe",
};

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export type HouseholdGroup<G> = { householdId: string; guests: G[] };

/**
 * People into households, in the order the list already has them: a
 * household appears where its first member would have. So the existing sort
 * (name, household, rank) still decides the order.
 *
 * A household where everyone shown can't attend goes to the bottom, the way a
 * finished task does: still there, out of the way.
 */
export function groupByHousehold<
  G extends { household_id: string; unable_to_attend_at: string | null },
>(guests: G[]): HouseholdGroup<G>[] {
  const groups = new Map<string, HouseholdGroup<G>>();
  for (const guest of guests) {
    const group = groups.get(guest.household_id);
    if (group) group.guests.push(guest);
    else groups.set(guest.household_id, { householdId: guest.household_id, guests: [guest] });
  }
  const all = [...groups.values()];
  const allUnable = (group: HouseholdGroup<G>) =>
    group.guests.every((guest) => guest.unable_to_attend_at !== null);
  return [...all.filter((group) => !allUnable(group)), ...all.filter(allUnable)];
}

// ---------------------------------------------------------------------------
// The household row's event cell
// ---------------------------------------------------------------------------

export type HouseholdEventSummary =
  /** Everyone invited is in the same state (or nobody is invited). */
  | { kind: "same"; state: InviteState }
  /** A split household: how many of those invited are coming. */
  | { kind: "split"; yes: number; invited: number; detail: string };

const SPLIT_ORDER: InviteState[] = ["yes", "maybe", "no", "sent", "invited"];
const SPLIT_WORDS: Record<InviteState, string> = {
  yes: "coming",
  maybe: "maybe",
  no: "not coming",
  sent: "no answer yet",
  invited: "not sent yet",
  not_invited: "not invited",
};

/**
 * One symbol for a household and one event.
 *
 * Only the people invited to the event count: a child left off the brunch
 * shouldn't make the household look split. If they all agree, it's that
 * state; otherwise "2/3" with the breakdown spelled out.
 */
export function householdEventSummary(states: InviteState[]): HouseholdEventSummary {
  const invited = states.filter((state) => state !== "not_invited");
  if (invited.length === 0) return { kind: "same", state: "not_invited" };
  if (invited.every((state) => state === invited[0])) return { kind: "same", state: invited[0]! };

  const yes = invited.filter((state) => state === "yes").length;
  const detail = SPLIT_ORDER.map((state) => [state, invited.filter((s) => s === state).length] as const)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${count} ${SPLIT_WORDS[state]}`)
    .join(", ");
  return { kind: "split", yes, invited: invited.length, detail };
}

export type HouseholdSummary = {
  /** Everyone in the household, whether or not a filter is showing them. */
  size: number;
  events: Record<string, HouseholdEventSummary>;
};

/**
 * The household row's cells, from the whole household rather than whoever
 * the filters left on screen: with "no answer for the reception" on, a
 * couple where one said yes should still read "1/2", not "no answer".
 */
export function summariseHouseholds(
  guests: { id: string; household_id: string; rsvps: { event_id: string; status: RsvpStatus }[] }[],
  eventIds: string[],
  invites: Pick<InviteRow, "guest_id" | "event_id" | "invited" | "sent_at">[],
): Record<string, HouseholdSummary> {
  const inviteByPair = new Map(invites.map((row) => [`${row.guest_id}:${row.event_id}`, row]));
  const members = new Map<string, typeof guests>();
  for (const guest of guests) {
    const list = members.get(guest.household_id);
    if (list) list.push(guest);
    else members.set(guest.household_id, [guest]);
  }

  const result: Record<string, HouseholdSummary> = {};
  for (const [householdId, people] of members) {
    const events: Record<string, HouseholdEventSummary> = {};
    for (const eventId of eventIds) {
      events[eventId] = householdEventSummary(
        people.map((guest) =>
          inviteState(
            inviteByPair.get(`${guest.id}:${eventId}`),
            guest.rsvps.find((rsvp) => rsvp.event_id === eventId)?.status,
          ),
        ),
      );
    }
    result[householdId] = { size: people.length, events };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reply counts above the table
// ---------------------------------------------------------------------------

export type ReplyCounts = {
  /** Everyone invited to the event. */
  invited: number;
  yes: number;
  maybe: number;
  no: number;
  /** Invited, no answer, and not someone who told us they can't come. */
  pending: number;
  /** Told us they can't come, and haven't answered this event (spec 29 §4.6). */
  cantCome: number;
};

/**
 * Per-event reply counts, by the same rules as the guest filters, so clicking
 * a part of the bar shows exactly that many people.
 *
 * - An answer is the answer, whatever else is true.
 * - With no answer, somebody flagged as unable to attend (and not Yes to
 *   anything) is "can't come", not "no answer yet" (`isExcludedFromCounts`).
 */
export function eventReplyCounts(
  eventId: string,
  invites: { guest_id: string; event_id: string; invited: boolean }[],
  guests: {
    id: string;
    unable_to_attend_at: string | null;
    rsvps: { event_id: string; status: string }[];
  }[],
): ReplyCounts {
  const counts: ReplyCounts = { invited: 0, yes: 0, maybe: 0, no: 0, pending: 0, cantCome: 0 };
  const invitedIds = new Set(
    invites.filter((row) => row.event_id === eventId && row.invited).map((row) => row.guest_id),
  );

  for (const guest of guests) {
    if (!invitedIds.has(guest.id)) continue;
    counts.invited += 1;
    const status = guest.rsvps.find((rsvp) => rsvp.event_id === eventId)?.status;
    if (status === "yes" || status === "no" || status === "maybe") {
      counts[status] += 1;
    } else if (isExcludedFromCounts(guest)) {
      counts.cantCome += 1;
    } else {
      counts.pending += 1;
    }
  }
  return counts;
}
