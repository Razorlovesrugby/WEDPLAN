import type { HouseholdRsvpView } from "@/lib/types/database";
import { hasUnable, saveTheDateUnsent } from "@/lib/unable-to-attend";

/**
 * The guest journey (spec 42 §5.4): each household is sent two things, the
 * save the date and the invitation, and the invitation IS their page (spec 28
 * §7a.4). Pure, so the counts and rules here are unit-tested rather than
 * trusted to a component.
 */

export const STAGES = ["save-the-date", "invitation"] as const;
export type Stage = (typeof STAGES)[number];
export const STEPS = ["who", "send", "track"] as const;
export type Step = (typeof STEPS)[number];

export const STAGE_LABEL: Record<Stage, string> = { "save-the-date": "Save the date", invitation: "Invitation" };
export const STEP_LABEL: Record<Step, string> = { who: "Who", send: "Send", track: "Track" };

export type JourneySummary = Pick<
  HouseholdRsvpView,
  "sent_at" | "opened_at" | "view_count" | "response_state" | "std_sent_at" | "std_view_count" | "unable_count"
>;

/** The least a row needs; `InvitationListItem` satisfies it. */
export type JourneyRow = {
  household: { id: string; tier_position?: number | null };
  summary: JourneySummary | null;
  invitationId: string | null;
};

export function isStage(value: string | undefined): value is Stage {
  return (STAGES as readonly string[]).includes(value ?? "");
}
export function isStep(value: string | undefined): value is Step {
  return (STEPS as readonly string[]).includes(value ?? "");
}

// ---------------------------------------------------------------------------
// ?status= filters. Moved here from the page unchanged (spec 42 §6): the
// dashboard's tiles link to these and must keep returning the same households.

export const STATUSES = ["sent", "unsent", "opened", "silent", "std_unsent", "unable"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  sent: "Invitations already sent",
  unsent: "Households with nothing sent yet",
  opened: "Households who have opened the link",
  // The list actually worth chasing (spec 22 §9): they have it, they have
  // read it, and they still have not answered.
  silent: "Opened, but nothing back yet",
  // Spec 29. The save-the-date's own "nothing sent yet" — kept apart from
  // `unsent`, which has always meant the INVITATION.
  std_unsent: "Households with no save the date sent yet",
  unable: "Households where someone has said they can't come",
};

export function isStatus(value: string | undefined): value is Status {
  return (STATUSES as readonly string[]).includes(value ?? "");
}

export function matchesStatus(row: Pick<JourneyRow, "summary">, status: Status): boolean {
  const summary = row.summary;
  const opened = summary?.opened_at != null || (summary?.view_count ?? 0) > 0;
  switch (status) {
    case "sent":
      return summary?.sent_at != null;
    case "unsent":
      return summary?.sent_at == null;
    case "opened":
      return opened;
    case "silent":
      return summary?.sent_at != null && opened && summary.response_state === "none";
    case "std_unsent":
      return saveTheDateUnsent(summary);
    case "unable":
      return hasUnable(summary);
  }
}

/** Which stage a status filter belongs to, so `/invitations?status=…` opens on the right one. */
export function stageForStatus(status: Status): Stage {
  return status === "std_unsent" ? "save-the-date" : "invitation";
}

// ---------------------------------------------------------------------------
// Where each household is.

export type SaveTheDateState = "none" | "sent" | "opened";
export type InvitationState = "none" | "ready" | "sent" | "opened" | "replied" | "unable";

export function saveTheDateState(row: Pick<JourneyRow, "summary">): SaveTheDateState {
  if ((row.summary?.std_view_count ?? 0) > 0) return "opened";
  return row.summary?.std_sent_at ? "sent" : "none";
}

/**
 * The invitation's furthest point. "Can't come" outranks the rest, since it's
 * the one the couple most need to see. "Ready" is an invitation that exists
 * (events chosen) but hasn't been sent.
 */
export function invitationState(row: JourneyRow): InvitationState {
  const summary = row.summary;
  if (hasUnable(summary)) return "unable";
  if (summary && summary.response_state !== "none") return "replied";
  if (summary?.opened_at != null || (summary?.view_count ?? 0) > 0) return "opened";
  if (summary?.sent_at) return "sent";
  return row.invitationId ? "ready" : "none";
}

export type StageProgress = { done: number; total: number; caption: string };

export function stageProgress(rows: readonly JourneyRow[], stage: Stage): StageProgress {
  const total = rows.length;
  if (stage === "save-the-date") {
    const done = rows.filter((row) => row.summary?.std_sent_at).length;
    return { done, total, caption: `${done} of ${total} sent` };
  }
  const done = rows.filter((row) => row.summary?.sent_at).length;
  const replied = rows.filter((row) => row.summary && row.summary.response_state !== "none").length;
  return { done, total, caption: `${done} of ${total} sent · ${replied} replied` };
}

/**
 * Where `/invitations` opens with no stage (spec 42 §5.4): the first stage
 * with work left, falling back to Invitation once everything's sent.
 */
export function defaultStage(rows: readonly JourneyRow[]): Stage {
  if (rows.length === 0) return "invitation";
  return rows.some((row) => !row.summary?.std_sent_at) ? "save-the-date" : "invitation";
}

/**
 * Which step a stage opens on: Who while invitations still need making (only
 * the Invitation stage has a Who to do), Send while anything is unsent, then
 * Track.
 */
export function defaultStep(rows: readonly JourneyRow[], stage: Stage): Step {
  if (stage === "invitation" && rows.some((row) => !row.invitationId)) return "who";
  const unsent =
    stage === "save-the-date"
      ? rows.some((row) => !row.summary?.std_sent_at)
      : rows.some((row) => row.invitationId && !row.summary?.sent_at);
  return unsent ? "send" : "track";
}

export function journeyHref(stage: Stage, step: Step, status?: Status | null): string {
  return `/invitations?stage=${stage}&step=${step}${status ? `&status=${status}` : ""}`;
}
