import type { RsvpStatus } from "./types/database";

/**
 * What one cell of the guest grid says, and what you may do to it (spec 22 §5).
 *
 * The ladder is derived, never stored. Two tables feed it and they answer
 * different questions:
 *
 *   `v_guest_event_invites.invited`  is this person invited to this event
 *   `invitations.sent_at`            has their household's invitation gone out
 *   `rsvps.status`                   what they said
 *
 * Keeping this in `lib/` rather than inside the grid is what lets the public
 * page, the RSVP form and the planner's screen agree about what "invited"
 * means without three implementations of the same `coalesce`.
 */

export type InviteState =
  /** Not invited. The quietest thing on the screen — an empty cell. */
  | "not_invited"
  /** Invited, nothing sent yet. */
  | "invited"
  /** Invited, their household's invitation has gone out, no answer yet. */
  | "sent"
  | "yes"
  | "no"
  | "maybe";

/** One row of `v_guest_event_invites`, as the app reads it. */
export type InviteRow = {
  guest_id: string;
  event_id: string;
  invited: boolean;
  /** What the household's own invitation says, before any override. */
  household_invited: boolean;
  /** null when this guest follows their household; true/false when singled out. */
  override: boolean | null;
  sent_at: string | null;
};

export function inviteState(
  invite: Pick<InviteRow, "invited" | "sent_at"> | undefined,
  status: RsvpStatus | undefined,
): InviteState {
  if (!invite?.invited) return "not_invited";
  // An answer outranks the invitation state: "sent" stops being the
  // interesting fact about somebody the moment they reply.
  if (status && status !== "pending") return status;
  return invite.sent_at ? "sent" : "invited";
}

export const INVITE_LABEL: Record<InviteState, string> = {
  not_invited: "—",
  invited: "Invited",
  sent: "Sent",
  yes: "Yes",
  no: "No",
  maybe: "Maybe",
};

/**
 * What the cell menu offers, given where it is.
 *
 * Deliberately a menu rather than a click that cycles: six states behind one
 * click is a guessing game, and two of these transitions should never happen
 * by accident (spec 22 §5).
 */
export type InviteAction =
  | "invite"
  | "remove"
  | "mark_sent"
  | "set_yes"
  | "set_no"
  | "set_maybe"
  | "clear_answer";

export const ACTION_LABEL: Record<InviteAction, string> = {
  invite: "Invite to this event",
  remove: "Remove from this event",
  mark_sent: "Mark invitation as sent",
  set_yes: "Mark as Yes",
  set_no: "Mark as No",
  set_maybe: "Mark as Maybe",
  clear_answer: "Clear their answer",
};

export function actionsFor(state: InviteState): InviteAction[] {
  if (state === "not_invited") return ["invite"];

  const actions: InviteAction[] = [];
  if (state === "invited") actions.push("mark_sent");
  actions.push("set_yes", "set_no", "set_maybe");
  if (state === "yes" || state === "no" || state === "maybe") actions.push("clear_answer");
  actions.push("remove");
  return actions;
}

/**
 * Which actions need confirming before they run.
 *
 * `remove` is confirmed only when there is an answer to lose — spec 22 §7's
 * rule is that the answer survives, but the planner should still be told they
 * are overriding something a guest said. `mark_sent` is confirmed because the
 * control sits on one event's cell and writes a fact about the whole
 * household, and a per-event control that quietly does that erodes trust in
 * the screen.
 */
export function needsConfirm(action: InviteAction, state: InviteState): boolean {
  if (action === "mark_sent") return true;
  if (action === "remove") return state === "yes" || state === "no" || state === "maybe";
  return false;
}

/**
 * "For Chidi and Ada" — who an event is for, when it is not everybody.
 *
 * Returns null when every member of the household is invited, because then
 * the line is noise. The page never names who is *not* invited (spec 22 Q2):
 * the household page is as likely to be read by the child as by the parent.
 */
export function invitedForLine(
  members: { id: string; name: string }[],
  invitedIds: Set<string>,
): string | null {
  const invited = members.filter((member) => invitedIds.has(member.id));
  if (invited.length === 0) return null;
  if (invited.length === members.length) return null;
  return `For ${listNames(invited.map((member) => member.name))}`;
}

/** "Ada", "Chidi and Ada", "Chidi, Ada and Zara". */
export function listNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The events a household's page should show: any event at least one member is
 * invited to, in the order given.
 *
 * An event nobody in the household is invited to does not appear at all —
 * which changes spec 14 §6's "list everything and mark what you're not invited
 * to". That rule was written when invited-ness was a household fact; with
 * per-person invites, the marked-list version prints a named child next to the
 * party they are not at.
 */
export function eventsForHousehold<E extends { id: string }>(
  events: E[],
  invites: Pick<InviteRow, "event_id" | "invited">[],
): E[] {
  const live = new Set(invites.filter((row) => row.invited).map((row) => row.event_id));
  return events.filter((event) => live.has(event.id));
}

/** The guests invited to one event, from the same rows. */
export function invitedGuestIds(
  invites: Pick<InviteRow, "guest_id" | "event_id" | "invited">[],
  eventId: string,
): Set<string> {
  return new Set(
    invites.filter((row) => row.invited && row.event_id === eventId).map((row) => row.guest_id),
  );
}

/**
 * Is this household still owed a reply?
 *
 * Chasing stays at household level (spec 22 Q3) and reads the per-event rule:
 * outstanding while any invited person has any unanswered event. The database
 * says the same thing in `v_household_rsvp.response_state`; this exists for
 * the screens that already hold the rows and should not ask again.
 */
export function isOutstanding(
  invites: Pick<InviteRow, "guest_id" | "event_id" | "invited">[],
  statuses: Map<string, RsvpStatus>,
): boolean {
  return invites.some((row) => {
    if (!row.invited) return false;
    const status = statuses.get(`${row.guest_id}:${row.event_id}`);
    return !status || status === "pending";
  });
}
