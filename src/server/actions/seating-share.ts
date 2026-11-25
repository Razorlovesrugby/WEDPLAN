"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/env";
import { parseShareInput, shareRefusal } from "@/lib/seating/share";
import { checkShare, hashPasscode, hashToken, newToken, rememberPasscode } from "@/server/seating-share";
import { getSessionUser, requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * Share links to an event's live layout (spec 57 E.3). The address is shown
 * once, when it is made: only its hash is kept, so a lost one is revoked and
 * replaced. Every Supabase `error` is checked.
 */

const uuid = z.string().uuid();

async function eventBelongs(weddingId: string, eventId: string): Promise<boolean> {
  if (!uuid.safeParse(eventId).success) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id").eq("id", eventId).eq("wedding_id", weddingId).maybeSingle();
  return Boolean(data);
}

/** Makes a view-only link, with an optional passcode and expiry. Returns its address, once. */
export async function createShareLink(eventId: string, input: { passcode?: string; expires?: string; label?: string }): Promise<ActionResult<{ url: string }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const parsed = parseShareInput(input);
  if (!parsed.ok) return fail(parsed.error);
  const user = await getSessionUser();

  const token = newToken();
  const supabase = await createClient();
  const { error } = await supabase.from("seating_share_links").insert({
    wedding_id: wedding.id,
    event_id: eventId,
    token_hash: hashToken(token),
    passcode_hash: parsed.value.passcode ? hashPasscode(token, parsed.value.passcode) : null,
    label: parsed.value.label,
    expires_at: parsed.value.expiresAt,
    created_by: user?.id ?? null,
  });
  if (error) return fail(error.message);
  revalidatePath(`/events/${eventId}/seating`);
  return ok({ url: absoluteUrl(`/p/${token}`) });
}

/** Switches a link off. It stays in the list as revoked. */
export async function revokeShareLink(eventId: string, linkId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!uuid.safeParse(linkId).success) return fail("That link doesn't exist");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("wedding_id", wedding.id)
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .select("id");
  if (error) return fail(error.message);
  if (!data || data.length === 0) return fail("That link is already off");
  revalidatePath(`/events/${eventId}/seating`);
  return ok(undefined);
}

/**
 * The public passcode form: asks the database, and only a right passcode is
 * remembered (as a hash, in an httpOnly cookie for this link) so the next page
 * doesn't ask again. Anyone can call this, so it says no more than the page does.
 */
export async function unlockSharedPlan(token: string, passcode: string): Promise<ActionResult> {
  if (typeof token !== "string" || typeof passcode !== "string" || passcode.length > 64) return fail(shareRefusal("gone"));
  const result = await checkShare(token, passcode);
  if (result.status !== "ok") return fail(shareRefusal(result.status));
  await rememberPasscode(token, passcode);
  revalidatePath(`/p/${token}`);
  return ok(undefined);
}
