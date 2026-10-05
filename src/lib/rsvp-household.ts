import type { RsvpStatus } from "@/lib/types/database";

/**
 * The household's collective answer, for the pair of cards above the
 * per-person rows.
 *
 * Most replies are "all of us, yes" or "none of us, no", and making somebody
 * answer that one event at a time for four people is twelve taps for one fact.
 * The cards are a shortcut into the same per-person state, never a second
 * place the answer is stored — which is why this derives the card's selected
 * state from the rows rather than keeping a flag beside them. A flag would be
 * a second copy of the truth, and the second copy is the one that goes stale
 * the moment somebody changes one row underneath it.
 *
 * Null whenever the rows do not all agree, including when nothing has been
 * answered yet: neither card is lit, and the rows below are the answer.
 */
export type HouseholdReply = "yes" | "no" | null;

export function householdReply(responses: Record<string, RsvpStatus>[]): HouseholdReply {
  const all = responses.flatMap((byEvent) => Object.values(byEvent));
  // A household invited to nothing has no collective answer to give.
  if (all.length === 0) return null;

  if (all.every((status) => status === "yes")) return "yes";
  if (all.every((status) => status === "no")) return "no";
  return null;
}

/** Every invited pair set to one answer — what a card click does. */
export function replyToAll(
  responses: Record<string, RsvpStatus>,
  status: RsvpStatus,
): Record<string, RsvpStatus> {
  return Object.fromEntries(Object.keys(responses).map((eventId) => [eventId, status]));
}

/**
 * What a guest can answer, and what the reply action accepts from one
 * (spec 28 §7a.1).
 *
 * There is no Maybe: two clear buttons are kinder on a phone than three, and a
 * couple catering for a number wants a yes or a no. `maybe` stays in the
 * database enum — removing a Postgres enum value means rebuilding every view
 * over it — and the planner's own screens can still record one by hand; it is
 * only the guest's side that stops offering and stops accepting it.
 */
export const GUEST_REPLY_STATUSES = ["yes", "no", "pending"] as const;

/**
 * A stored status as the form should open with it. A `maybe` somebody recorded
 * by hand is shown as unanswered rather than as a button that no longer exists,
 * so the guest is asked rather than answered for.
 */
export function guestFacingStatus(status: RsvpStatus): "yes" | "no" | "pending" {
  return status === "yes" || status === "no" ? status : "pending";
}
