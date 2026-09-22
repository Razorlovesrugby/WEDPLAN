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
