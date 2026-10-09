"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { findWeddingBySlug } from "@/server/queries/site";
import { resolveHouseholdAddress } from "@/server/rsvp/address";
import { householdGuestIds } from "@/lib/unable-to-attend";
import { fail, ok, type ActionResult } from "./result";

/**
 * "I'm unable to attend", from a guest's own save-the-date (spec 29 §4).
 *
 * The first public write on this page that changes guest data, so the rules
 * are written down where the next person will look:
 *
 *   NEVER A GET. This runs from a button press. Mail scanners and link
 *   previewers fetch every URL in a message; a write on page load would
 *   decline households nobody heard from (HANDOFF session 27 — the same reason
 *   the one-tap reply and the view logger apply from the browser).
 *
 *   THE BROWSER'S GUEST IDS ARE NOT TRUSTED. The household comes from the
 *   address, through the same throttled path as the page. Its guests are then
 *   loaded here and only the intersection with what the browser sent is
 *   written, so an id from another household or wedding changes nothing.
 *
 *   IDEMPOTENT. Declining twice writes once and keeps the first time: the
 *   update is guarded by `unable_to_attend_at is null`.
 *
 *   NOT AN RSVP. It writes two columns on `guests` and nothing else — no
 *   `rsvps` row, no invitation, no message. What the planner sees, and what
 *   stops being counted, follows from those columns (migration 0034).
 *
 * Service role, because guests are planner-only under RLS and `anon` is
 * revoked. It is scoped by wedding AND household on every statement.
 */

const schema = z.object({
  weddingSlug: z.string().min(1).max(120),
  address: z.string().min(1).max(120),
  guestIds: z.array(z.string().uuid()).max(40),
});

type Resolved =
  | { ok: true; weddingId: string; householdId: string }
  | { ok: false; error: string };

async function resolveHousehold(weddingSlug: string, address: string): Promise<Resolved> {
  const wedding = await findWeddingBySlug(weddingSlug);
  if (!wedding) return { ok: false, error: "We can't find that link." };
  const resolved = await resolveHouseholdAddress(wedding.id, address);
  if (resolved.kind === "throttled") {
    return { ok: false, error: "Too many attempts — give it a few minutes and try again." };
  }
  if (resolved.kind !== "ok") return { ok: false, error: "We can't find that link." };
  return { ok: true, weddingId: wedding.id, householdId: resolved.household.id };
}

export async function declineSaveTheDate(payload: unknown): Promise<ActionResult<{ names: string[] }>> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success || parsed.data.guestIds.length === 0) {
    return fail("Choose who can't come first.");
  }

  const household = await resolveHousehold(parsed.data.weddingSlug, parsed.data.address);
  if (!household.ok) return fail(household.error);

  const supabase = createAdminClient();
  const { data: guests, error } = await supabase
    .from("guests")
    .select("id, first_name, preferred_name")
    .eq("wedding_id", household.weddingId)
    .eq("household_id", household.householdId)
    .is("deleted_at", null)
    .is("unable_to_attend_at", null);
  if (error) return fail("Something went wrong — please try again.");

  const { ids } = householdGuestIds(
    parsed.data.guestIds,
    (guests ?? []).map((guest) => guest.id),
  );
  if (ids.length === 0) {
    // Everyone chosen was already recorded, or is no longer on the list (the
    // planner may have cut someone since this page loaded). Either way there
    // is nothing for the guest to fix, and a reload shows the true state.
    return fail("That's already been noted — reload the page to see where things stand.");
  }

  const { error: writeError } = await supabase
    .from("guests")
    .update({ unable_to_attend_at: new Date().toISOString(), unable_to_attend_via: "save_the_date" })
    .eq("wedding_id", household.weddingId)
    .eq("household_id", household.householdId)
    .in("id", ids)
    .is("unable_to_attend_at", null);
  if (writeError) return fail("Something went wrong — please try again.");

  const chosen = new Set(ids);
  const names = (guests ?? [])
    .filter((guest) => chosen.has(guest.id))
    .map((guest) => guest.preferred_name?.trim() || guest.first_name);
  return ok({ names });
}

/**
 * Changed their mind. Gives back only what the guest's own page set
 * (`via = 'save_the_date'`): a flag the planner recorded by hand stays, because
 * it is not the guest's to undo from here.
 */
export async function undoSaveTheDateDecline(payload: unknown): Promise<ActionResult> {
  const parsed = schema.partial({ guestIds: true }).safeParse(payload);
  if (!parsed.success) return fail("Something went wrong — please try again.");

  const household = await resolveHousehold(parsed.data.weddingSlug, parsed.data.address);
  if (!household.ok) return fail(household.error);

  const supabase = createAdminClient();
  let query = supabase
    .from("guests")
    .update({ unable_to_attend_at: null, unable_to_attend_via: null })
    .eq("wedding_id", household.weddingId)
    .eq("household_id", household.householdId)
    .eq("unable_to_attend_via", "save_the_date")
    .is("deleted_at", null);
  if (parsed.data.guestIds && parsed.data.guestIds.length > 0) {
    query = query.in("id", parsed.data.guestIds);
  }

  const { error } = await query;
  if (error) return fail("Something went wrong — please try again.");
  return ok(undefined);
}
