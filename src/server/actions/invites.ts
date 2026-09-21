"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * Inviting per event (spec 22 §5).
 *
 * Three levels of the same act, and the difference between them is the whole
 * design:
 *
 *   `setHouseholdEventInvite`  writes `invitation_events` — the household's
 *                              own invitation, the normal case.
 *   `setGuestEventInvite`      writes `guest_event_overrides` — one person
 *                              singled out, in or out.
 *   `clearGuestEventOverride`  removes the exception, putting that person
 *                              back under whatever their household says.
 *
 * A household-level change deliberately does NOT touch overrides. That is the
 * property the exceptions table exists for: "add the Okonkwos to the brunch"
 * must not silently re-invite the child somebody removed last week.
 *
 * Every one of them ends by reconciling pending rsvp rows, because
 * "outstanding" is counted from those rows and an invitation with nothing to
 * answer is indistinguishable from one nobody has replied to.
 */

const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// Pending rows
// ---------------------------------------------------------------------------
/**
 * Make `rsvps` agree with who is invited, for one event or for one guest.
 *
 * Adds a pending row for every invited pair that has none. Removes rows that
 * are *still pending* for pairs no longer invited — and leaves every answered
 * row exactly where it is, which is spec 22 §7: a guest cut after they replied
 * has to remain reconstructable, and the counts stay right because
 * `v_household_rsvp` counts through the invites view rather than through these
 * rows.
 */
async function reconcilePending(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  scope: { guestIds?: string[]; eventIds?: string[] },
): Promise<ActionResult> {
  let invitesQuery = supabase
    .from("v_guest_event_invites")
    .select("guest_id, event_id, invited")
    .eq("wedding_id", weddingId);
  if (scope.guestIds?.length) invitesQuery = invitesQuery.in("guest_id", scope.guestIds);
  if (scope.eventIds?.length) invitesQuery = invitesQuery.in("event_id", scope.eventIds);

  const { data: invites, error: inviteError } = await invitesQuery;
  if (inviteError) return fail(inviteError.message);

  let rsvpQuery = supabase
    .from("rsvps")
    .select("id, guest_id, event_id, status")
    .eq("wedding_id", weddingId);
  if (scope.guestIds?.length) rsvpQuery = rsvpQuery.in("guest_id", scope.guestIds);
  if (scope.eventIds?.length) rsvpQuery = rsvpQuery.in("event_id", scope.eventIds);

  const { data: rsvps, error: rsvpError } = await rsvpQuery;
  if (rsvpError) return fail(rsvpError.message);

  const existing = new Map((rsvps ?? []).map((row) => [`${row.guest_id}:${row.event_id}`, row]));

  const toInsert = (invites ?? [])
    .filter((row) => row.invited && !existing.has(`${row.guest_id}:${row.event_id}`))
    .map((row) => ({
      wedding_id: weddingId,
      guest_id: row.guest_id,
      event_id: row.event_id,
      status: "pending" as const,
    }));

  const invitedKeys = new Set(
    (invites ?? []).filter((row) => row.invited).map((row) => `${row.guest_id}:${row.event_id}`),
  );
  const toDelete = (rsvps ?? [])
    .filter((row) => row.status === "pending" && !invitedKeys.has(`${row.guest_id}:${row.event_id}`))
    .map((row) => row.id);

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("rsvps")
      .upsert(toInsert, { onConflict: "guest_id,event_id", ignoreDuplicates: true });
    if (error) return fail(error.message);
  }

  if (toDelete.length > 0) {
    const { error } = await supabase.from("rsvps").delete().in("id", toDelete);
    if (error) return fail(error.message);
  }

  return ok(undefined);
}

function revalidateInvites(householdId?: string): void {
  revalidatePath("/guests");
  revalidatePath("/invitations");
  revalidatePath("/");
  if (householdId) revalidatePath(`/households/${householdId}`);
}

// ---------------------------------------------------------------------------
// The household's own invitation
// ---------------------------------------------------------------------------
export async function setHouseholdEventInvite(
  householdId: string,
  eventId: string,
  invited: boolean,
): Promise<ActionResult> {
  const parsed = z.object({ householdId: uuid, eventId: uuid }).safeParse({ householdId, eventId });
  if (!parsed.success) return fail("That household or event doesn't look right");

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: invitation, error: readError } = await supabase
    .from("invitations")
    .select("id")
    .eq("wedding_id", wedding.id)
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) return fail(readError.message);

  // No invitation yet means nothing to attach an event to. Said plainly
  // rather than silently creating one: minting a token is how a link gets
  // into the world, and it should be a deliberate act on /invitations.
  if (!invitation) {
    return fail("This household has no invitation yet — create one on Invitations first.");
  }

  if (invited) {
    const { error } = await supabase
      .from("invitation_events")
      .upsert(
        { wedding_id: wedding.id, invitation_id: invitation.id, event_id: eventId },
        { onConflict: "invitation_id,event_id", ignoreDuplicates: true },
      );
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase
      .from("invitation_events")
      .delete()
      .eq("wedding_id", wedding.id)
      .eq("invitation_id", invitation.id)
      .eq("event_id", eventId);
    if (error) return fail(error.message);
  }

  const { data: guests } = await supabase
    .from("guests")
    .select("id")
    .eq("wedding_id", wedding.id)
    .eq("household_id", householdId)
    .is("deleted_at", null);

  const reconciled = await reconcilePending(supabase, wedding.id, {
    guestIds: (guests ?? []).map((guest) => guest.id),
    eventIds: [eventId],
  });
  if (!reconciled.ok) return reconciled;

  revalidateInvites(householdId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// One person, singled out
// ---------------------------------------------------------------------------
export async function setGuestEventInvite(
  guestId: string,
  eventId: string,
  invited: boolean,
): Promise<ActionResult> {
  const parsed = z.object({ guestId: uuid, eventId: uuid }).safeParse({ guestId, eventId });
  if (!parsed.success) return fail("That guest or event doesn't look right");

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: guest, error: guestError } = await supabase
    .from("guests")
    .select("id, household_id")
    .eq("wedding_id", wedding.id)
    .eq("id", guestId)
    .is("deleted_at", null)
    .maybeSingle();
  if (guestError) return fail(guestError.message);
  if (!guest) return fail("That guest no longer exists");

  const { error } = await supabase.from("guest_event_overrides").upsert(
    { wedding_id: wedding.id, guest_id: guestId, event_id: eventId, invited },
    { onConflict: "guest_id,event_id" },
  );
  if (error) return fail(error.message);

  const reconciled = await reconcilePending(supabase, wedding.id, {
    guestIds: [guestId],
    eventIds: [eventId],
  });
  if (!reconciled.ok) return reconciled;

  revalidateInvites(guest.household_id);
  return ok(undefined);
}

/** Put one person back under whatever their household's invitation says. */
export async function clearGuestEventOverride(
  guestId: string,
  eventId: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: guest } = await supabase
    .from("guests")
    .select("household_id")
    .eq("wedding_id", wedding.id)
    .eq("id", guestId)
    .maybeSingle();

  const { error } = await supabase
    .from("guest_event_overrides")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("guest_id", guestId)
    .eq("event_id", eventId);
  if (error) return fail(error.message);

  const reconciled = await reconcilePending(supabase, wedding.id, {
    guestIds: [guestId],
    eventIds: [eventId],
  });
  if (!reconciled.ok) return reconciled;

  revalidateInvites(guest?.household_id);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Bulk, because eighty households is the real case
// ---------------------------------------------------------------------------
/**
 * Invite or remove every household on the screen for one event — the column
 * header's action.
 *
 * Households with no invitation yet are skipped rather than failing the whole
 * operation, and the count comes back so the caller can say so.
 */
export async function setEventInviteForHouseholds(
  householdIds: string[],
  eventId: string,
  invited: boolean,
): Promise<ActionResult<{ changed: number; skipped: number }>> {
  const parsed = z
    .object({ householdIds: z.array(uuid).min(1), eventId: uuid })
    .safeParse({ householdIds, eventId });
  if (!parsed.success) return fail("Pick at least one household");

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: invitations, error } = await supabase
    .from("invitations")
    .select("id, household_id")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null)
    .in("household_id", parsed.data.householdIds);
  if (error) return fail(error.message);

  const found = invitations ?? [];
  const skipped = parsed.data.householdIds.length - found.length;
  if (found.length === 0) return ok({ changed: 0, skipped });

  if (invited) {
    const { error: writeError } = await supabase.from("invitation_events").upsert(
      found.map((invitation) => ({
        wedding_id: wedding.id,
        invitation_id: invitation.id,
        event_id: eventId,
      })),
      { onConflict: "invitation_id,event_id", ignoreDuplicates: true },
    );
    if (writeError) return fail(writeError.message);
  } else {
    const { error: writeError } = await supabase
      .from("invitation_events")
      .delete()
      .eq("wedding_id", wedding.id)
      .eq("event_id", eventId)
      .in(
        "invitation_id",
        found.map((invitation) => invitation.id),
      );
    if (writeError) return fail(writeError.message);
  }

  const { data: guests } = await supabase
    .from("guests")
    .select("id")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null)
    .in(
      "household_id",
      found.map((invitation) => invitation.household_id),
    );

  const reconciled = await reconcilePending(supabase, wedding.id, {
    guestIds: (guests ?? []).map((guest) => guest.id),
    eventIds: [eventId],
  });
  if (!reconciled.ok) return reconciled;

  revalidateInvites();
  return ok({ changed: found.length, skipped });
}

// ---------------------------------------------------------------------------
// "Invite sent", by hand
// ---------------------------------------------------------------------------
/**
 * Mark a household's invitation as sent without sending one (spec 22 §5).
 *
 * For the card handed over at a barbecue or posted in an envelope. Without
 * it, `sent_at` stays null forever and the chase logic treats a household
 * that has been asked as one that never was.
 *
 * It writes a household-wide fact from a per-event cell, which is why the
 * menu confirms it and says so in as many words.
 */
export async function markInvitationSent(
  householdId: string,
  channel: "post" | "hand" | "whatsapp" = "hand",
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: invitation, error } = await supabase
    .from("invitations")
    .select("id, sent_at")
    .eq("wedding_id", wedding.id)
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!invitation) return fail("This household has no invitation yet");

  // Already sent stays as it was: the first time it went out is the useful
  // date, and overwriting it would reset the chase clock.
  if (invitation.sent_at) return ok(undefined);

  const { error: writeError } = await supabase
    .from("invitations")
    .update({ sent_at: new Date().toISOString(), channel })
    .eq("id", invitation.id)
    .eq("wedding_id", wedding.id);
  if (writeError) return fail(writeError.message);

  // Logged like an email send, so "what has this household been sent" is one
  // story rather than two.
  await supabase.from("message_log").insert({
    wedding_id: wedding.id,
    household_id: householdId,
    kind: "invitation",
    channel,
    to_address: channel,
    dedupe_key: `invitation:manual:${invitation.id}`,
    status: "sent",
  });

  revalidateInvites(householdId);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Answers, from the planner's side
// ---------------------------------------------------------------------------
/**
 * Set or clear one guest's answer for one event.
 *
 * The planner needs this because a good half of any guest list replies by
 * text message, in person, or through somebody else's mother. Clearing an
 * answer sets it back to pending rather than deleting the row, so the pair
 * stays counted as outstanding.
 */
export async function setRsvpStatus(
  guestId: string,
  eventId: string,
  status: "yes" | "no" | "maybe" | "pending",
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: invite, error: inviteError } = await supabase
    .from("v_guest_event_invites")
    .select("invited, household_id")
    .eq("wedding_id", wedding.id)
    .eq("guest_id", guestId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (inviteError) return fail(inviteError.message);
  if (!invite) return fail("That guest or event no longer exists");
  if (!invite.invited) return fail("They aren't invited to that event yet");

  const { error } = await supabase.from("rsvps").upsert(
    {
      wedding_id: wedding.id,
      guest_id: guestId,
      event_id: eventId,
      status,
      responded_at: status === "pending" ? null : new Date().toISOString(),
    },
    { onConflict: "guest_id,event_id" },
  );
  if (error) return fail(error.message);

  revalidateInvites(invite.household_id);
  return ok(undefined);
}
