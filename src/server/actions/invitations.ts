"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import {
  decryptToken,
  encryptToken,
  generateInviteToken,
  hashInviteToken,
  invitationUrl,
} from "@/lib/tokens";
import { invitationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";
import { fail, ok, type ActionResult } from "./result";

/**
 * Creating an invitation does three things in one go, and all three matter:
 *
 *   1. Mints a token, stored hashed (for lookup) and encrypted (for recovery).
 *   2. Records which events this household is invited to.
 *   3. Creates a pending rsvp row per guest per invited event.
 *
 * Step 3 is the one that is easy to skip and expensive to skip. "Outstanding"
 * is counted from pending rows; without them, a household that has been
 * invited and ignored you is indistinguishable from one you never invited,
 * and the only number you are supposed to watch is wrong.
 */

export async function createInvitations(
  householdIds: string[],
  eventIds: string[],
): Promise<ActionResult<{ created: number }>> {
  const parsed = z
    .object({
      householdIds: z.array(z.string().uuid()).min(1),
      eventIds: z.array(z.string().uuid()).min(1, "Pick at least one event"),
    })
    .safeParse({ householdIds, eventIds });
  if (!parsed.success) return fail("Choose households and at least one event");

  const wedding = await requireWedding();
  const supabase = await createClient();

  // Households that already hold a live invitation keep it: reissuing would
  // break links already in the post.
  const { data: existing, error: existingError } = await supabase
    .from("invitations")
    .select("household_id")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null)
    .in("household_id", parsed.data.householdIds);
  if (existingError) return fail(existingError.message);

  const alreadyInvited = new Set((existing ?? []).map((row) => row.household_id));
  const toCreate = parsed.data.householdIds.filter((id) => !alreadyInvited.has(id));
  if (toCreate.length === 0) return ok({ created: 0 });

  const rows = toCreate.map((household_id) => {
    const token = generateInviteToken();
    return {
      wedding_id: wedding.id,
      household_id,
      token_hash: hashInviteToken(token),
      token_encrypted: encryptToken(token),
    };
  });

  const { data: created, error } = await supabase.from("invitations").insert(rows).select("id, household_id");
  if (error) return fail(error.message);

  const { error: eventError } = await supabase.from("invitation_events").insert(
    (created ?? []).flatMap((invitation) =>
      parsed.data.eventIds.map((event_id) => ({
        wedding_id: wedding.id,
        invitation_id: invitation.id,
        event_id,
      })),
    ),
  );
  if (eventError) return fail(eventError.message);

  const seeded = await seedRsvps(
    wedding.id,
    (created ?? []).map((row) => row.household_id),
    parsed.data.eventIds,
  );
  if (!seeded.ok) return seeded;

  revalidatePath("/invitations");
  revalidatePath("/guests");
  revalidatePath("/");
  return ok({ created: created?.length ?? 0 });
}

/** Pending rows for every guest in these households, for every invited event. */
async function seedRsvps(
  weddingId: string,
  householdIds: string[],
  eventIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: guests, error } = await supabase
    .from("guests")
    .select("id")
    .eq("wedding_id", weddingId)
    .is("deleted_at", null)
    .in("household_id", householdIds);
  if (error) return fail(error.message);
  if (!guests || guests.length === 0) return ok(undefined);

  const { error: rsvpError } = await supabase.from("rsvps").upsert(
    guests.flatMap((guest) =>
      eventIds.map((event_id) => ({
        wedding_id: weddingId,
        guest_id: guest.id,
        event_id,
        status: "pending" as const,
      })),
    ),
    // An existing answer must survive: somebody added to a household after
    // the rest have replied must not reset their answers.
    { onConflict: "guest_id,event_id", ignoreDuplicates: true },
  );
  if (rsvpError) return fail(rsvpError.message);
  return ok(undefined);
}

/** The link itself, decrypted on demand, for copying or printing. */
export async function revealInvitationLink(
  invitationId: string,
): Promise<ActionResult<{ url: string }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invitations")
    .select("token_encrypted")
    .eq("wedding_id", wedding.id)
    .eq("id", invitationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return fail(error.message);
  if (!data) return fail("That invitation no longer exists");

  const token = decryptToken(data.token_encrypted);
  if (!token) {
    return fail(
      "This link can't be recovered — the token pepper has changed since it was issued. Reissue the invitation.",
    );
  }
  return ok({ url: invitationUrl(token) });
}

export async function sendInvitation(
  invitationId: string,
): Promise<ActionResult<{ sentTo: string[]; skipped: boolean }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: invitation, error } = await supabase
    .from("invitations")
    .select("id, household_id, token_encrypted, sent_at, households(display_name)")
    .eq("wedding_id", wedding.id)
    .eq("id", invitationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return fail(error.message);
  if (!invitation) return fail("That invitation no longer exists");

  const token = decryptToken(invitation.token_encrypted);
  if (!token) return fail("This invitation's link can't be recovered. Reissue it.");

  const { data: guests, error: guestError } = await supabase
    .from("guests")
    .select("email")
    .eq("wedding_id", wedding.id)
    .eq("household_id", invitation.household_id)
    .is("deleted_at", null)
    .not("email", "is", null);
  if (guestError) return fail(guestError.message);

  const recipients = [...new Set((guests ?? []).map((g) => g.email).filter((e): e is string => !!e))];
  if (recipients.length === 0) {
    return fail("Nobody in this household has an email address. Copy the link instead.");
  }

  const householdName = invitation.households?.display_name ?? "Friends";
  const message = invitationEmail({
    weddingName: wedding.name,
    householdName,
    dateLabel: wedding.wedding_date
      ? formatDate(wedding.wedding_date, wedding.timezone)
      : "date to be confirmed",
    url: invitationUrl(token),
  });

  const sentTo: string[] = [];
  for (const recipient of recipients) {
    // The log row is written BEFORE the send, so a crash between the two
    // leaves evidence rather than silence. dedupe_key makes a retry a no-op.
    const dedupeKey = `invitation:${invitation.id}:${recipient}`;
    const { error: logError } = await supabase.from("message_log").insert({
      wedding_id: wedding.id,
      household_id: invitation.household_id,
      kind: "invitation",
      channel: "email",
      to_address: recipient,
      dedupe_key: dedupeKey,
      status: "queued",
    });

    if (logError) {
      // 23505 on dedupe_key means this exact message already went out.
      if (logError.code === "23505") continue;
      return fail(logError.message);
    }

    const result = await sendEmail({ to: recipient, ...message });

    await supabase
      .from("message_log")
      .update(
        result.ok
          ? { status: "sent", provider_id: result.providerId, sent_at: new Date().toISOString() }
          : { status: "failed", error: result.error },
      )
      .eq("wedding_id", wedding.id)
      .eq("dedupe_key", dedupeKey);

    if (result.ok) sentTo.push(recipient);
  }

  if (sentTo.length > 0 && !invitation.sent_at) {
    await supabase
      .from("invitations")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("wedding_id", wedding.id);
  }

  revalidatePath("/invitations");
  revalidatePath("/");
  return ok({ sentTo, skipped: sentTo.length === 0 });
}

/**
 * A new token for a household, invalidating the old link. For the case where
 * an invitation went to the wrong address, or a link was posted somewhere
 * public. The old invitation is soft-deleted rather than overwritten so the
 * history of what was sent survives.
 */
export async function reissueInvitation(
  invitationId: string,
): Promise<ActionResult<{ url: string }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: old, error } = await supabase
    .from("invitations")
    .select("household_id, invitation_events(event_id)")
    .eq("wedding_id", wedding.id)
    .eq("id", invitationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!old) return fail("That invitation no longer exists");

  const { error: retireError } = await supabase
    .from("invitations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("wedding_id", wedding.id);
  if (retireError) return fail(retireError.message);

  const token = generateInviteToken();
  const { data: fresh, error: createError } = await supabase
    .from("invitations")
    .insert({
      wedding_id: wedding.id,
      household_id: old.household_id,
      token_hash: hashInviteToken(token),
      token_encrypted: encryptToken(token),
    })
    .select("id")
    .single();
  if (createError) return fail(createError.message);

  const eventIds = (old.invitation_events ?? []).map((e) => e.event_id);
  if (eventIds.length > 0) {
    const { error: eventError } = await supabase.from("invitation_events").insert(
      eventIds.map((event_id) => ({
        wedding_id: wedding.id,
        invitation_id: fresh.id,
        event_id,
      })),
    );
    if (eventError) return fail(eventError.message);
  }

  revalidatePath("/invitations");
  return ok({ url: invitationUrl(token) });
}

export async function setRemindersMuted(
  householdId: string,
  muted: boolean,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("households")
    .update({ reminders_muted: muted })
    .eq("id", householdId)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);
  revalidatePath("/invitations");
  return ok(undefined);
}
