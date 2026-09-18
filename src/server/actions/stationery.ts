"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { decryptToken, invitationCardUrl, invitationUrl } from "@/lib/tokens";
import { broadcastEmail, saveTheDateEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";
import { text } from "@/lib/site/sections";
import { SEND_BATCH } from "@/lib/email/batch";
import { fail, ok, type ActionResult } from "./result";

/**
 * Save-the-dates and broadcasts (spec 14 §12.1, §12.3).
 *
 * Its own file rather than more of `invitations.ts`, because the two do
 * different jobs: that one manages the *credential* — minting a token,
 * reissuing it, revealing it. This one sends *messages* that happen to carry
 * it. Kept together they would be a thousand lines with two reasons to change.
 *
 * Both writers follow V1's rule exactly: the `message_log` row is written
 * BEFORE the send, so a crash between the two leaves evidence rather than
 * silence, and `dedupe_key` makes a retry a no-op instead of a second email.
 *
 * Neither touches the chasing cron, which stays automatic and conditional
 * while these stay manual and deliberate. Merging them is how somebody
 * accidentally mails four hundred people at 03:00.
 */

type Target = {
  invitationId: string;
  householdId: string;
  householdName: string;
  token: string;
  recipients: string[];
};

/**
 * Every household with a live invitation, its token, and the addresses to use.
 *
 * A household with no email at all is returned with an empty `recipients` so
 * the caller can *report* it rather than silently sending to fewer people than
 * the planner thinks. Knowing eleven households have no address is the whole
 * value of the count.
 */
async function loadTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  householdIds: string[] | null,
): Promise<Target[]> {
  let query = supabase
    .from("invitations")
    .select("id, household_id, token_encrypted, households(display_name)")
    .eq("wedding_id", weddingId)
    .is("deleted_at", null);
  if (householdIds) query = query.in("household_id", householdIds);

  const { data: invitations } = await query;
  if (!invitations) return [];

  const ids = invitations.map((invitation) => invitation.household_id);
  const { data: guests } = await supabase
    .from("guests")
    .select("household_id, email")
    .eq("wedding_id", weddingId)
    .in("household_id", ids)
    .is("deleted_at", null)
    .not("email", "is", null);

  const emails = new Map<string, string[]>();
  for (const guest of guests ?? []) {
    if (!guest.email) continue;
    const list = emails.get(guest.household_id) ?? [];
    if (!list.includes(guest.email)) list.push(guest.email);
    emails.set(guest.household_id, list);
  }

  return invitations.flatMap((invitation) => {
    const token = decryptToken(invitation.token_encrypted);
    // A token that cannot be decrypted means the pepper changed. Skipping is
    // right — sending a broken link is worse than sending nothing — and
    // `reissueInvitation` is the documented fix.
    if (!token) return [];
    return [
      {
        invitationId: invitation.id,
        householdId: invitation.household_id,
        householdName: invitation.households?.display_name ?? "Friends",
        token,
        recipients: emails.get(invitation.household_id) ?? [],
      },
    ];
  });
}

export type SendSummary = {
  sent: number;
  households: number;
  skippedNoEmail: number;
  alreadySent: number;
  failed: number;
  /**
   * Households this call did not reach because it hit the batch limit. The UI
   * calls again until this is zero.
   */
  remaining: number;
};



/** The shared send loop. Everything above it decides who; this decides how. */
async function sendToTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  targets: Target[],
  kind: "save_the_date" | "update",
  build: (target: Target) => { subject: string; text: string; html: string },
  dedupeSuffix: string,
): Promise<SendSummary> {
  // Which households this send has already reached, so the next batch starts
  // where the last one stopped.
  //
  // Slicing `targets` alone would not advance: every call reloads the same
  // list and would take the same first 25, skip them all on dedupe, and report
  // the same `remaining` forever. The message log is the only durable record
  // of progress, and reading it here is also what makes a send resumable after
  // a crash, a timeout, or the browser tab being closed mid-way.
  const { data: alreadyLogged } = await supabase
    .from("message_log")
    .select("dedupe_key")
    .eq("wedding_id", weddingId)
    .eq("kind", kind)
    .like("dedupe_key", `${kind}:${dedupeSuffix}:%`);

  const doneInvitations = new Set(
    (alreadyLogged ?? [])
      .map((row) => row.dedupe_key?.split(":")[2])
      .filter((id): id is string => typeof id === "string" && id !== ""),
  );

  const outstanding = targets.filter((target) => !doneInvitations.has(target.invitationId));

  const summary: SendSummary = {
    sent: 0,
    households: 0,
    skippedNoEmail: 0,
    // Households fully handled by an earlier batch are counted once here
    // rather than re-attempted.
    alreadySent: targets.length - outstanding.length,
    failed: 0,
    remaining: Math.max(outstanding.length - SEND_BATCH, 0),
  };

  for (const target of outstanding.slice(0, SEND_BATCH)) {
    if (target.recipients.length === 0) {
      summary.skippedNoEmail += 1;
      continue;
    }

    const message = build(target);
    let reachedOne = false;

    for (const recipient of target.recipients) {
      const dedupeKey = `${kind}:${dedupeSuffix}:${target.invitationId}:${recipient}`;
      const { error: logError } = await supabase.from("message_log").insert({
        wedding_id: weddingId,
        household_id: target.householdId,
        kind,
        channel: "email",
        to_address: recipient,
        dedupe_key: dedupeKey,
        status: "queued",
      });

      if (logError) {
        if (logError.code === "23505") {
          summary.alreadySent += 1;
          continue;
        }
        summary.failed += 1;
        continue;
      }

      const result = await sendEmail({ to: recipient, ...message });
      await supabase
        .from("message_log")
        .update(
          result.ok
            ? { status: "sent", provider_id: result.providerId, sent_at: new Date().toISOString() }
            : { status: "failed", error: result.error },
        )
        .eq("wedding_id", weddingId)
        .eq("dedupe_key", dedupeKey);

      if (result.ok) {
        summary.sent += 1;
        reachedOne = true;
      } else {
        summary.failed += 1;
      }
    }

    if (reachedOne) summary.households += 1;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Save the date
// ---------------------------------------------------------------------------

const saveTheDateSchema = z.object({
  household_ids: z.array(z.string().uuid()).optional(),
});

export async function sendSaveTheDates(
  fields: Record<string, unknown>,
): Promise<ActionResult<SendSummary>> {
  const wedding = await requireWedding();
  const parsed = saveTheDateSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  if (!wedding.wedding_date) {
    // The entire point of the message is the date. Sending one without it
    // wastes the send and the goodwill.
    return fail("Set the wedding date first — that's the whole message.");
  }

  const supabase = await createClient();
  const { data: heroRow } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", wedding.id)
    .eq("block_key", "hero")
    .maybeSingle();

  const dateLabel = formatDate(wedding.wedding_date, wedding.timezone);
  const location = text(heroRow?.payload ?? null, "location");

  const targets = await loadTargets(supabase, wedding.id, parsed.data.household_ids ?? null);
  if (targets.length === 0) return fail("No households have an invitation link yet");

  const summary = await sendToTargets(
    supabase,
    wedding.id,
    targets,
    "save_the_date",
    (target) =>
      saveTheDateEmail({
        weddingName: wedding.name,
        householdName: target.householdName,
        dateLabel,
        location,
        // The card, not the RSVP form: replies are not open yet, and sending
        // people to a form that refuses them is worse than not linking at all.
        url: invitationCardUrl(target.token),
      }),
    // Scoped to the date, so moving the wedding lets a corrected save-the-date
    // go out rather than being swallowed as a duplicate of the old one.
    wedding.wedding_date,
  );

  revalidatePath("/invitations");
  return ok(summary);
}

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------

const broadcastSchema = z.object({
  subject: z.string().trim().min(1, "Give it a subject").max(200),
  body: z.string().trim().min(1, "Write something").max(10_000),
  segment: z.enum(["all", "replied", "no_reply", "tag"]),
  tag_id: z.string().uuid().optional(),
  /** Stamped into the dedupe key so re-sending a corrected version is possible. */
  send_key: z.string().trim().min(1).max(64),
});

/**
 * Which households a broadcast goes to.
 *
 * "Hasn't replied" is the one worth being careful with: a household counts as
 * having replied when ANY of its guests has a non-pending RSVP, because the
 * household is the unit that gets the email and one reply per family is how
 * people actually answer.
 */
async function resolveSegment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  segment: "all" | "replied" | "no_reply" | "tag",
  tagId: string | undefined,
): Promise<string[] | null> {
  if (segment === "all") return null;

  if (segment === "tag") {
    if (!tagId) return [];
    const { data } = await supabase
      .from("guest_tags")
      .select("guests(household_id)")
      .eq("wedding_id", weddingId)
      .eq("tag_id", tagId);
    const ids = (data ?? [])
      .map((row) => row.guests?.household_id)
      .filter((id): id is string => typeof id === "string");
    return [...new Set(ids)];
  }

  const { data } = await supabase
    .from("rsvps")
    .select("status, guests(household_id)")
    .eq("wedding_id", weddingId)
    .neq("status", "pending");

  const replied = new Set(
    (data ?? [])
      .map((row) => row.guests?.household_id)
      .filter((id): id is string => typeof id === "string"),
  );

  if (segment === "replied") return [...replied];

  const { data: households } = await supabase
    .from("households")
    .select("id")
    .eq("wedding_id", weddingId)
    .is("deleted_at", null);

  return (households ?? []).map((household) => household.id).filter((id) => !replied.has(id));
}

export async function sendBroadcast(
  fields: Record<string, unknown>,
): Promise<ActionResult<SendSummary>> {
  const wedding = await requireWedding();
  const parsed = broadcastSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const householdIds = await resolveSegment(
    supabase,
    wedding.id,
    parsed.data.segment,
    parsed.data.tag_id,
  );
  if (householdIds !== null && householdIds.length === 0) {
    return fail("Nobody matches that group");
  }

  const targets = await loadTargets(supabase, wedding.id, householdIds);
  if (targets.length === 0) return fail("Nobody in that group has an invitation link yet");

  const summary = await sendToTargets(
    supabase,
    wedding.id,
    targets,
    "update",
    (target) =>
      broadcastEmail({
        weddingName: wedding.name,
        householdName: target.householdName,
        subject: parsed.data.subject,
        body: parsed.data.body,
        url: invitationUrl(target.token),
      }),
    parsed.data.send_key,
  );

  revalidatePath("/invitations");
  return ok(summary);
}
