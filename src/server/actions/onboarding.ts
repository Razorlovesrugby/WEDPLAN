"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { onboardingOpen } from "@/lib/env";
import { hashClientIp } from "@/lib/tokens";
import {
  START_MAX_PER_WINDOW,
  START_WINDOW_MINUTES,
  isEmailTaken,
  isHoneypotTripped,
  startSchema,
  startSignedInSchema,
  startThrottleKey,
  type StartInput,
  type StartSignedInInput,
} from "@/lib/onboarding";
import { getCurrentWedding, getSessionUser } from "@/server/queries/wedding";
import { createInvitedLogin, deleteLogins, sendPartnerInvite, type PartnerInvite } from "@/server/partner-invite";
import { fail, ok, type ActionResult } from "./result";

/**
 * Self-serve onboarding (spec 40 §5.3). A stranger at /start gets a login, a
 * wedding with its defaults, and a session, with nobody running SQL.
 *
 * Public sign-up stays OFF in Supabase: the login is made here with the admin
 * API, so this action is the only door, and it is gated (ONBOARDING_OPEN),
 * throttled per IP, and trapped against bots. Q2: no email confirmation, so
 * the login is created already confirmed and the person goes straight in.
 *
 * Auth and SQL can't share a transaction, so a failure after a login was made
 * deletes the login(s) this call created before returning.
 */

export type StartResult = {
  /** Present only when a partner email was given. */
  partnerInvite: PartnerInvite | null;
};

async function throttleKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return hashClientIp(startThrottleKey(ip));
}

/** Every attempt counts, successful or not: a burst of real sign-ups from one IP is itself the signal. */
async function overLimit(key: string): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - START_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await admin
    .from("rsvp_token_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", key)
    .gte("attempted_at", since);
  if (error) return false; // fail open on an infrastructure hiccup, like the RSVP throttle
  return (count ?? 0) >= START_MAX_PER_WINDOW;
}

export async function startWedding(fields: Record<string, unknown>): Promise<ActionResult<StartResult>> {
  if (!onboardingOpen()) return fail("WedPlan isn't taking new weddings right now.");

  // A bot that filled the field nobody can see gets a success and nothing else.
  if (isHoneypotTripped(fields)) return ok({ partnerInvite: null });

  const sessionUser = await getSessionUser();
  if (sessionUser && (await getCurrentWedding())) return fail("You already have a wedding. Open it from the dashboard.");

  const key = await throttleKey();
  if (await overLimit(key)) return fail("That's a lot of sign-ups at once. Give it an hour and try again.");
  await createAdminClient().from("rsvp_token_attempts").insert({ ip_hash: key, succeeded: false });

  // Signed in with no wedding (an orphaned login): no account fields.
  let input: StartSignedInInput;
  let account: StartInput | null = null;
  if (sessionUser) {
    const parsed = startSignedInSchema.safeParse(fields);
    if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
    input = parsed.data;
  } else {
    const parsed = startSchema.safeParse(fields);
    if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
    input = parsed.data;
    account = parsed.data;
  }

  if (sessionUser && input.partner_email && input.partner_email === sessionUser.email?.toLowerCase()) {
    return fail("Some fields need fixing", { partner_email: ["Your partner needs their own email address"] });
  }

  const admin = createAdminClient();
  const created: string[] = [];

  // 1. The owner's login.
  let ownerId = sessionUser?.id ?? null;
  if (!ownerId && account) {
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { name: input.your_name },
    });
    if (error || !data.user) {
      if (error && isEmailTaken(error)) {
        return fail("That email already has a WedPlan login.", {
          email: ["That email already has a WedPlan login. Sign in instead."],
        });
      }
      return fail(error?.message ?? "Couldn't create your login");
    }
    ownerId = data.user.id;
    created.push(ownerId);
  }
  if (!ownerId) return fail("Couldn't create your login");

  // 2. The partner's login, if an email was given.
  let partner: { id: string; email: string; tokenHash: string } | null = null;
  if (input.partner_email) {
    const login = await createInvitedLogin(input.partner_email);
    if (!login.ok) {
      await deleteLogins(created);
      if (login.taken) {
        return fail("Some fields need fixing", {
          partner_email: [
            "That email already has a WedPlan login. Leave it blank and invite your partner later from Settings.",
          ],
        });
      }
      return fail(login.error);
    }
    created.push(login.userId);
    partner = { id: login.userId, email: input.partner_email, tokenHash: login.tokenHash };
  }

  // 3. The wedding, its collaborators and defaults, in one transaction.
  const { data: weddingId, error: weddingError } = await admin.rpc("create_wedding", {
    p_owner: ownerId,
    p_partner: partner?.id ?? null,
    p_name: input.wedding_name,
    p_date: input.wedding_date,
    p_timezone: input.timezone,
    p_currency: input.currency,
    p_capacity: input.capacity,
    p_owner_name: input.your_name,
    p_partner_name: partner ? input.partner_name : null,
  });
  if (weddingError || !weddingId) {
    await deleteLogins(created);
    return fail(
      /already has a wedding/.test(weddingError?.message ?? "")
        ? "That login already has a wedding."
        : "Couldn't create your wedding. Nothing was saved; please try again.",
    );
  }

  // 4. Sign in. Already signed in? Nothing to do.
  if (!sessionUser && account) {
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    // The wedding exists and the login works, so don't undo anything: send
    // them to /login instead.
    if (signInError) return fail("Your wedding is ready, but signing in didn't work. Sign in with your new password.");
  }

  // 5. The partner's invite. Never fatal: the link is shown if email is off.
  const partnerInvite = partner
    ? await sendPartnerInvite({
        email: partner.email,
        tokenHash: partner.tokenHash,
        type: "invite",
        weddingName: input.wedding_name,
        inviterName: input.your_name,
      })
    : null;

  return ok({ partnerInvite });
}
