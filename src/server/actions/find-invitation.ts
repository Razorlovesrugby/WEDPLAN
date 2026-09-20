"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { decryptToken, hashClientIp, householdSiteUrl } from "@/lib/tokens";
import { invitationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { formatDate } from "@/lib/format";
import { ok, type ActionResult } from "./result";

/**
 * "Find my invitation" (spec 14 §2).
 *
 * A guest types the email address we already hold and we re-send that
 * household's existing link to that same address. Three properties matter, and
 * all three are the reason this is a server action rather than a lookup:
 *
 *   1. **The link is never shown on screen.** It is emailed to the address on
 *      file, so typing somebody else's address tells you nothing.
 *   2. **The answer is identical either way.** Match or no match, the response
 *      is the same sentence. Anything else turns this into an oracle for "is
 *      this person invited", which at a wedding is genuinely sensitive
 *      information.
 *   3. **It is rate-limited** on the same hashed-IP machinery the RSVP token
 *      resolver already uses, so enumerating addresses stops being free.
 *
 * It mints nothing. A household that has never been sent an invitation has no
 * token to recover, and gets the same neutral answer.
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_WINDOW = 5;

/** The only thing this action ever says. */
const NEUTRAL =
  "If that address is on our guest list, the link is on its way. Do check your spam folder.";

async function clientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return hashClientIp(ip);
}

export async function findMyInvitation(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ message: string }>> {
  const parsed = schema.safeParse(fields);
  // Even a malformed address gets the neutral answer: "that isn't an email"
  // is fine to say, but saying anything different from the success case for a
  // *valid* address is what leaks. Simpler to say one thing always.
  if (!parsed.success) return ok({ message: NEUTRAL });

  const supabase = createAdminClient();
  const ipHash = await clientIpHash();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count } = await supabase
    .from("rsvp_token_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("attempted_at", since);

  if ((count ?? 0) >= MAX_ATTEMPTS_PER_WINDOW) {
    // Still the neutral answer. Telling a scraper it has been throttled is
    // telling it the endpoint is worth scraping.
    return ok({ message: NEUTRAL });
  }
  await supabase.from("rsvp_token_attempts").insert({ ip_hash: ipHash, succeeded: false });

  const { data: guest } = await supabase
    .from("guests")
    .select("wedding_id, household_id, email")
    .ilike("email", parsed.data.email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (!guest) return ok({ message: NEUTRAL });

  const [{ data: invitation }, { data: wedding }, { data: household }] = await Promise.all([
    supabase
      .from("invitations")
      .select("token_encrypted")
      .eq("wedding_id", guest.wedding_id)
      .eq("household_id", guest.household_id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("weddings")
      .select("name, slug, wedding_date, timezone")
      .eq("id", guest.wedding_id)
      .maybeSingle(),
    supabase
      .from("households")
      .select("display_name, slug, slug_suffix")
      .eq("id", guest.household_id)
      .eq("wedding_id", guest.wedding_id)
      .maybeSingle(),
  ]);

  if (!invitation || !wedding || !household) return ok({ message: NEUTRAL });

  const token = decryptToken(invitation.token_encrypted);
  if (!token) return ok({ message: NEUTRAL });

  const message = invitationEmail({
    weddingName: wedding.name,
    householdName: household.display_name,
    dateLabel: wedding.wedding_date
      ? formatDate(wedding.wedding_date, wedding.timezone)
      : "date to be confirmed",
    url: householdSiteUrl(wedding.slug, {
      slug: household.slug,
      suffix: household.slug_suffix,
    }),
  });

  // Sent to the address on file, never to whatever was typed — they are the
  // same string here only because it matched.
  const recipient = guest.email ?? parsed.data.email;

  // Logged as a 'test' kind rather than 'invitation': this is a resend of a
  // link somebody already has, and counting it as an invitation would move
  // the "have we sent the invitations" number the planner reads.
  await supabase.from("message_log").insert({
    wedding_id: guest.wedding_id,
    household_id: guest.household_id,
    kind: "test",
    channel: "email",
    to_address: recipient,
    // Timestamped, so a guest who genuinely loses it twice can ask twice.
    dedupe_key: `resend:${guest.household_id}:${Date.now()}`,
    status: "queued",
  });

  await sendEmail({ to: recipient, ...message });

  return ok({ message: NEUTRAL });
}
