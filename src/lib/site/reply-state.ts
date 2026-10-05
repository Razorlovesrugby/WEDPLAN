import { listNames } from "@/lib/invites";
import type { RsvpStatus } from "@/lib/types/database";

/**
 * What a household has said, in words (spec 27 §7).
 *
 * One pure function behind two places: the sticky bar on a phone ("You're
 * coming — Chidi and Ada · Change") and the card that replaces the form once
 * they have sent it. Both must agree, and both must be right about the awkward
 * households — one adult yes and one no, a child not invited to the evening — so
 * the classification lives here rather than in either component.
 *
 * It reads per-person answers for the events **that person is invited to**
 * (spec 22): a child with no evening invitation is judged on the day events
 * alone, and a person invited to nothing is not in the input at all.
 */

export type ReplyMember = {
  name: string;
  /** One status per event this person is invited to. */
  responses: RsvpStatus[];
};

export type ReplyState =
  /** Nobody has answered anything. */
  | "none"
  /** Some have, some have not. */
  | "partial"
  /** Everyone, everything: yes. */
  | "yes"
  /** Everyone, everything: no. */
  | "no"
  /** Everyone has answered, and not all the same. */
  | "mixed";

export type ReplySummary = {
  state: ReplyState;
  /** Said yes to everything they were invited to. */
  coming: string[];
  /** Said no to everything. */
  declining: string[];
  /** A maybe, or yes to some and no to others. */
  unsure: string[];
  /** Still has something to answer. */
  unanswered: string[];
};

type PersonKind = "coming" | "declining" | "unsure" | "unanswered";

function classify(responses: RsvpStatus[]): PersonKind {
  if (responses.length === 0 || responses.some((status) => status === "pending")) return "unanswered";
  if (responses.every((status) => status === "yes")) return "coming";
  if (responses.every((status) => status === "no")) return "declining";
  return "unsure";
}

export function summariseReply(members: ReplyMember[]): ReplySummary {
  const summary: ReplySummary = { state: "none", coming: [], declining: [], unsure: [], unanswered: [] };

  for (const member of members) {
    // Somebody invited to nothing has nothing to answer and no place here.
    if (member.responses.length === 0) continue;
    summary[classify(member.responses)].push(member.name);
  }

  const { coming, declining, unsure, unanswered } = summary;

  // Judged on individual answers, not people: someone who answered the
  // ceremony and left the dinner blank has started, and "nothing answered yet"
  // would tell them to begin again.
  const answeredAnything = members.some((member) =>
    member.responses.some((status) => status !== "pending"),
  );

  if (!answeredAnything) summary.state = "none";
  else if (unanswered.length > 0) summary.state = "partial";
  else if (declining.length === 0 && unsure.length === 0) summary.state = "yes";
  else if (coming.length === 0 && unsure.length === 0) summary.state = "no";
  else summary.state = "mixed";

  return summary;
}

/** Words for the bar: what it says, and what its button says. */
export function replyBarCopy(
  summary: ReplySummary,
  replyBy: string | null,
): { text: string; action: string } {
  const by = replyBy ? ` · by ${replyBy}` : "";
  switch (summary.state) {
    case "none":
      return { text: `Your reply${by}`, action: "Reply" };
    case "partial":
      return { text: `Finish your reply${by}`, action: "Continue" };
    case "yes":
      return { text: `You're coming — ${listNames(summary.coming)}`, action: "Change" };
    case "no":
      return { text: "You can't make it", action: "Change" };
    case "mixed": {
      // Lead with who is coming; it is the part they most want to see.
      const who = summary.coming.length > 0 ? `${listNames(summary.coming)} coming` : "Reply sent";
      return { text: who, action: "Change" };
    }
  }
}

/**
 * What the top bar's button says (spec 28 §5.2): **RSVP** until they have
 * answered something, then **Your reply** — it still goes to the form, where
 * they can change it until the lock date.
 */
export function navRsvpLabel(summary: ReplySummary): string {
  return summary.state === "none" || summary.state === "partial" ? "RSVP" : "Your reply";
}

/** Words for the card that follows sending: a heading and the lines beneath. */
export function replyConfirmation(summary: ReplySummary): { heading: string; lines: string[] } {
  const lines: string[] = [];
  if (summary.coming.length > 0) lines.push(`${listNames(summary.coming)} — coming`);
  if (summary.unsure.length > 0) lines.push(`${listNames(summary.unsure)} — not sure yet`);
  if (summary.declining.length > 0) lines.push(`${listNames(summary.declining)} — can't make it`);
  if (summary.unanswered.length > 0) lines.push(`${listNames(summary.unanswered)} — still to answer`);

  switch (summary.state) {
    case "yes":
      return { heading: "We can't wait to see you", lines };
    case "no":
      return { heading: "We'll miss you", lines };
    case "none":
      return { heading: "Thank you", lines: [] };
    default:
      return { heading: "Thank you — that's all noted", lines };
  }
}

/**
 * Members for `summariseReply`, built from what the RSVP context already holds.
 *
 * One status per event the person is **invited to** — the pairs in `invites`,
 * spec 22's per-person rule — defaulting to pending where no row exists yet.
 */
export function replyMembersFromContext(context: {
  guests: { id: string; first_name: string; preferred_name: string | null }[];
  invites: { guest_id: string; event_id: string }[];
  rsvps: { guest_id: string; event_id: string; status: RsvpStatus }[];
}): ReplyMember[] {
  return context.guests.map((guest) => ({
    name: guest.preferred_name?.trim() || guest.first_name,
    responses: context.invites
      .filter((invite) => invite.guest_id === guest.id)
      .map(
        (invite) =>
          context.rsvps.find((row) => row.guest_id === guest.id && row.event_id === invite.event_id)
            ?.status ?? "pending",
      ),
  }));
}

/** "1 May", in the wedding's own timezone, or null when there is no lock date. */
export function replyByLabel(lockAt: string | null | undefined, timeZone: string): string | null {
  if (!lockAt) return null;
  const date = new Date(lockAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-NZ", { timeZone, day: "numeric", month: "long" }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return day && month ? `${day} ${month}` : null;
}
