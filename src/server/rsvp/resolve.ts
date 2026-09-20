import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashClientIp, hashInviteToken, looksLikeToken } from "@/lib/tokens";
import type {
  EventRow,
  GuestRow,
  RsvpAnswerRow,
  RsvpQuestionRow,
  RsvpRow,
  WeddingRow,
} from "@/lib/types/database";

/**
 * Turning a token in a URL into exactly one household.
 *
 * This is the only place in the app where an unauthenticated request reaches
 * data, so it is the only place where RLS is not the thing protecting it. The
 * service role bypasses RLS entirely; scoping here is the whole defence, and
 * it rests on one rule:
 *
 *   The token resolves to one household_id and one wedding_id, and every
 *   subsequent query is constrained to BOTH. Nothing downstream accepts a
 *   household id from the client, ever.
 *
 * The composite foreign keys are the backstop: even a mistake in this file
 * cannot attach a write to another wedding's rows.
 */

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_WINDOW = 10;

export type RsvpContext = {
  wedding: Pick<WeddingRow, "id" | "name" | "wedding_date" | "timezone" | "rsvp_lock_at">;
  household: { id: string; display_name: string };
  invitationId: string;
  guests: GuestRow[];
  /**
   * Events at least one member of this household is invited to (spec 22 §6).
   * An event nobody here is invited to does not appear at all — not listed
   * and marked, as spec 14 §6 had it, because with per-person invites that
   * rendering prints a named child beside the party they are not at.
   */
  events: EventRow[];
  /**
   * Who, in this household, is invited to which of those events. One row per
   * invited pair, from `v_guest_event_invites` — the only place the
   * household-versus-override rule is computed.
   */
  invites: { guest_id: string; event_id: string }[];
  questions: RsvpQuestionRow[];
  rsvps: RsvpRow[];
  answers: RsvpAnswerRow[];
  locked: boolean;
};

export type ResolveFailure =
  | { reason: "malformed" }
  | { reason: "not_found" }
  | { reason: "throttled" };

export type ResolveResult = { ok: true; context: RsvpContext } | { ok: false } & ResolveFailure;

/**
 * Best-effort client address, hashed before it is ever stored.
 *
 * Exported for `address.ts`, which resolves the other form of the same
 * credential (spec 21) and must share one throttle rather than opening a
 * second, unthrottled way in.
 */
export async function clientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return hashClientIp(ip);
}

/**
 * Throttling exists to make enumeration impractical, not impossible — a
 * 32-byte token is not going to be guessed. What it really buys is that a
 * script hammering the endpoint stops being free.
 */
export async function isThrottled(ipHash: string): Promise<boolean> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count, error } = await supabase
    .from("rsvp_token_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("succeeded", false)
    .gte("attempted_at", since);

  // Fail open on an infrastructure error. A database hiccup must not lock a
  // guest out of replying; the token itself is still doing the real work.
  if (error) return false;
  return (count ?? 0) >= MAX_FAILURES_PER_WINDOW;
}

export async function recordAttempt(ipHash: string, succeeded: boolean): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("rsvp_token_attempts").insert({ ip_hash: ipHash, succeeded });
}

export async function resolveInvitation(rawToken: string): Promise<ResolveResult> {
  if (!looksLikeToken(rawToken)) return { ok: false, reason: "malformed" };

  const ipHash = await clientIpHash();
  if (await isThrottled(ipHash)) return { ok: false, reason: "throttled" };

  const supabase = createAdminClient();
  const { data: invitation } = await supabase
    .from("invitations")
    .select("id, wedding_id, household_id, opened_at")
    .eq("token_hash", hashInviteToken(rawToken))
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitation) {
    await recordAttempt(ipHash, false);
    return { ok: false, reason: "not_found" };
  }
  await recordAttempt(ipHash, true);

  const { wedding_id: weddingId, household_id: householdId } = invitation;

  // Per person, not per household (spec 22 §4). `invitation_events` still
  // says what the household is invited to; the view applies the per-guest
  // exceptions on top, and it is the only thing that does.
  const { data: inviteRows } = await supabase
    .from("v_guest_event_invites")
    .select("guest_id, event_id, invited")
    .eq("wedding_id", weddingId)
    .eq("household_id", householdId);

  const invites = (inviteRows ?? [])
    .filter((row) => row.invited)
    .map((row) => ({ guest_id: row.guest_id, event_id: row.event_id }));
  const invitedEventIds = [...new Set(invites.map((row) => row.event_id))];

  const [wedding, household, guests, events, questions, rsvps, answers] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, name, wedding_date, timezone, rsvp_lock_at")
      .eq("id", weddingId)
      .single(),
    supabase
      .from("households")
      .select("id, display_name")
      .eq("wedding_id", weddingId)
      .eq("id", householdId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("guests")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("is_plus_one")
      .order("sort_order")
      .order("created_at"),
    // Only the events this household was invited to. A household must not
    // learn that an event it is not invited to exists.
    invitedEventIds.length > 0
      ? supabase
          .from("events")
          .select("*")
          .eq("wedding_id", weddingId)
          .in("id", invitedEventIds)
          .order("sort_order")
          .order("starts_at")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("rsvp_questions")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("active", true)
      .order("sort_order"),
    supabase.from("rsvps").select("*").eq("wedding_id", weddingId).in("event_id", invitedEventIds),
    supabase.from("rsvp_answers").select("*").eq("wedding_id", weddingId),
  ]);

  if (wedding.error || !wedding.data || household.error || !household.data) {
    return { ok: false, reason: "not_found" };
  }

  const householdGuestIds = new Set((guests.data ?? []).map((guest) => guest.id));

  if (!invitation.opened_at) {
    await supabase
      .from("invitations")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .eq("wedding_id", weddingId);
  }

  return {
    ok: true,
    context: {
      wedding: wedding.data,
      household: household.data,
      invitationId: invitation.id,
      guests: guests.data ?? [],
      events: (events.data ?? []) as EventRow[],
      // Narrowed to the guests still on the list: a soft-deleted guest keeps
      // their rows, and the form must not offer them.
      invites: invites.filter((row) => householdGuestIds.has(row.guest_id)),
      questions: questions.data ?? [],
      // Narrowed to this household's own guests. The query above is scoped by
      // wedding and invited events, which is not the same thing.
      rsvps: (rsvps.data ?? []).filter((row) => householdGuestIds.has(row.guest_id)),
      answers: (answers.data ?? []).filter(
        (row) =>
          (row.guest_id !== null && householdGuestIds.has(row.guest_id)) ||
          row.household_id === householdId,
      ),
      locked: wedding.data.rsvp_lock_at !== null && new Date(wedding.data.rsvp_lock_at) < new Date(),
    },
  };
}
