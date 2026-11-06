import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { partnerInviteEmail } from "@/lib/email/templates";
import { plannerInvitePath, type InviteLinkType } from "@/lib/planner-invite";
import { isEmailTaken } from "@/lib/onboarding";

/**
 * The partner's login (spec 40 §5.3 step 3, §5.4). Shared by /start and
 * Settings so both make the account the same way spec 39 makes a planner's:
 * `generateLink` creates it without Supabase sending its own email, and hands
 * back a one-time set-password link.
 *
 * Callers do their own scoping before reaching here. This file never decides
 * WHICH wedding a login joins.
 */

export type PartnerInvite = {
  /** One-time. Shown to the couple so they can pass it on if the email doesn't arrive. */
  link: string;
  emailed: boolean;
  /** Why it wasn't emailed, when it wasn't. */
  emailNote: string | null;
};

export type NewLogin =
  | { ok: true; userId: string; tokenHash: string; type: InviteLinkType }
  | { ok: false; taken: boolean; error: string };

/**
 * A brand-new login for `email`. Refuses an address that already has an
 * account (`taken`): attaching somebody's existing login to a wedding from a
 * form would let anyone add themselves to anyone's account.
 */
export async function createInvitedLogin(email: string): Promise<NewLogin> {
  const admin = createAdminClient();
  const generated = await admin.auth.admin.generateLink({ type: "invite", email });
  if (generated.error) {
    return { ok: false, taken: isEmailTaken(generated.error), error: generated.error.message };
  }
  const userId = generated.data.user?.id;
  const tokenHash = generated.data.properties?.hashed_token;
  if (!userId || !tokenHash) return { ok: false, taken: false, error: "Couldn't create that login" };
  return { ok: true, userId, tokenHash, type: "invite" };
}

/**
 * A fresh link for a login that already belongs to this wedding's partner
 * (re-sending). "invite" while they have never signed in, "recovery" after.
 */
export async function freshLinkFor(email: string): Promise<NewLogin> {
  const admin = createAdminClient();
  let type: InviteLinkType = "invite";
  let generated = await admin.auth.admin.generateLink({ type: "invite", email });
  if (generated.error) {
    type = "recovery";
    generated = await admin.auth.admin.generateLink({ type: "recovery", email });
  }
  const userId = generated.data?.user?.id;
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !userId || !tokenHash) {
    return { ok: false, taken: false, error: generated.error?.message ?? "Couldn't make a new link" };
  }
  return { ok: true, userId, tokenHash, type };
}

export async function sendPartnerInvite(options: {
  email: string;
  tokenHash: string;
  type: InviteLinkType;
  weddingName: string;
  inviterName: string | null;
}): Promise<PartnerInvite> {
  const link = absoluteUrl(plannerInvitePath(options.tokenHash, options.type));
  const message = partnerInviteEmail({ weddingName: options.weddingName, inviterName: options.inviterName, url: link });
  const sent = await sendEmail({ to: options.email, ...message });
  return {
    link,
    emailed: sent.ok && sent.delivered,
    emailNote: sent.ok
      ? sent.delivered
        ? null
        : "Email isn't set up on this site, so nothing was sent. Send them the link yourself."
      : sent.error,
  };
}

/** Removes logins made moments ago when a later step failed (spec 40 §5.3 step 4). Best effort. */
export async function deleteLogins(userIds: readonly string[]): Promise<void> {
  const admin = createAdminClient();
  await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id).catch(() => undefined)));
}
