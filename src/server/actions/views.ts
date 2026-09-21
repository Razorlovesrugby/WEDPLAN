"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { ok, type ActionResult } from "./result";

/**
 * Logging one open of a household's invitation (spec 22 §9).
 *
 * Called from the browser, on mount, for the same reason the one-tap reply is
 * (§8): a link in an email is fetched by corporate mail scanners and link
 * previewers, and counting those as opens would turn "they've looked four
 * times" — the number the planner chases on — into noise. Scanners do not run
 * JavaScript.
 *
 * Three rules make the number honest:
 *
 *   A refresh is not a second open. Views inside 30 minutes collapse.
 *   The planner's own preview never counts (the page passes `preview`).
 *   Nothing about the reader is stored — no IP, no user agent, no
 *   fingerprint. The table cannot answer any question except "did this
 *   household look, and when".
 *
 * It always reports success. A failed log is not something to tell a guest
 * about, and it must never block a page they came to read.
 */

const COLLAPSE_MINUTES = 30;

const schema = z.object({
  token: z.string(),
  source: z.enum(["address", "token", "email"]).default("address"),
});

export async function logInvitationView(payload: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success || !looksLikeToken(parsed.data.token)) return ok(undefined);

  const supabase = createAdminClient();

  // Deliberately not resolveInvitation(): that loads guests, events,
  // questions and every answer, and this needs one household id. It also
  // spends a throttle slot, and an open is not an authentication attempt.
  const { data: invitation } = await supabase
    .from("invitations")
    .select("wedding_id, household_id")
    .eq("token_hash", hashInviteToken(parsed.data.token))
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitation) return ok(undefined);

  const since = new Date(Date.now() - COLLAPSE_MINUTES * 60_000).toISOString();
  const { data: recent } = await supabase
    .from("invitation_views")
    .select("id")
    .eq("wedding_id", invitation.wedding_id)
    .eq("household_id", invitation.household_id)
    .gte("viewed_at", since)
    .limit(1);

  if (recent && recent.length > 0) return ok(undefined);

  await supabase.from("invitation_views").insert({
    wedding_id: invitation.wedding_id,
    household_id: invitation.household_id,
    source: parsed.data.source,
  });

  return ok(undefined);
}
