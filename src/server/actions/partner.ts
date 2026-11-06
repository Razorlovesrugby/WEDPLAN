"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailTaken } from "@/lib/onboarding";
import { looksLikeEmail } from "@/lib/planner-invite";
import { getCollaborators, getSessionUser, getViewerKind, requireWedding } from "@/server/queries/wedding";
import {
  createInvitedLogin,
  deleteLogins,
  freshLinkFor,
  sendPartnerInvite,
  type PartnerInvite,
} from "@/server/partner-invite";
import { fail, ok, type ActionResult } from "./result";

/**
 * The partner's invite from Settings (spec 40 §5.4): invite one when there is
 * none, re-send, and correct the address before they've joined.
 *
 * Only the couple may do this. Every path is scoped to the caller's own
 * wedding (requireWedding, through RLS) before the service role is touched,
 * and none of them ever attaches a login that existed before this call.
 */

async function guard() {
  const wedding = await requireWedding();
  if ((await getViewerKind()) !== "couple") return { ok: false as const, error: "Only the two of you can do this" };
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Sign in again first" };
  const collaborators = await getCollaborators(wedding.id);
  const me = collaborators.find((c) => c.user_id === user.id) ?? null;
  const other = collaborators.find((c) => c.user_id !== user.id) ?? null;
  return { ok: true as const, wedding, user, me, other };
}

const emailSchema = z.string().trim().toLowerCase();

/** No partner yet: make their login, attach it as the partner, send the link. */
export async function invitePartner(name: string, email: string): Promise<ActionResult<PartnerInvite>> {
  const g = await guard();
  if (!g.ok) return fail(g.error);
  if (g.other) return fail("You already have a partner on this wedding");

  const address = emailSchema.parse(email ?? "");
  if (!looksLikeEmail(address)) return fail("Some fields need fixing", { email: ["That doesn't look like an email address"] });
  if (address === g.user.email?.toLowerCase()) {
    return fail("Some fields need fixing", { email: ["Your partner needs their own email address"] });
  }
  const displayName = (name ?? "").trim().slice(0, 80) || null;

  const login = await createInvitedLogin(address);
  if (!login.ok) {
    return login.taken
      ? fail("Some fields need fixing", { email: ["That email already has a WedPlan login. Use a different address"] })
      : fail(login.error);
  }

  // Collaborators have no INSERT policy from a session; the service role adds
  // the row, scoped to the wedding requireWedding() resolved through RLS.
  const { error } = await createAdminClient()
    .from("collaborators")
    .insert({ wedding_id: g.wedding.id, user_id: login.userId, role: "partner", display_name: displayName });
  if (error) {
    await deleteLogins([login.userId]);
    return fail(error.message);
  }

  const invite = await sendPartnerInvite({
    email: address,
    tokenHash: login.tokenHash,
    type: login.type,
    weddingName: g.wedding.name,
    inviterName: g.me?.display_name ?? null,
  });
  revalidatePath("/settings");
  return ok(invite);
}

/** A fresh link for the partner who hasn't joined yet (or a set-password link if they have). */
export async function resendPartnerInvite(): Promise<ActionResult<PartnerInvite>> {
  const g = await guard();
  if (!g.ok) return fail(g.error);
  if (!g.other) return fail("There's no partner to invite yet");

  const { data } = await createAdminClient().auth.admin.getUserById(g.other.user_id);
  const email = data.user?.email;
  if (!email) return fail("Your partner's login has no email address");
  if (data.user?.last_sign_in_at) return fail("Your partner has already joined. They can use “Forgot password” to get back in");

  const link = await freshLinkFor(email);
  if (!link.ok || link.userId !== g.other.user_id) return fail(link.ok ? "Couldn't make a new link" : link.error);
  return ok(
    await sendPartnerInvite({
      email,
      tokenHash: link.tokenHash,
      type: link.type,
      weddingName: g.wedding.name,
      inviterName: g.me?.display_name ?? null,
    }),
  );
}

/** Fix a mistyped partner address, only while they haven't joined, then send to the new one. */
export async function changePartnerEmail(email: string): Promise<ActionResult<PartnerInvite>> {
  const g = await guard();
  if (!g.ok) return fail(g.error);
  if (!g.other) return fail("There's no partner to change");

  const address = emailSchema.parse(email ?? "");
  if (!looksLikeEmail(address)) return fail("Some fields need fixing", { email: ["That doesn't look like an email address"] });
  if (address === g.user.email?.toLowerCase()) {
    return fail("Some fields need fixing", { email: ["Your partner needs their own email address"] });
  }

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(g.other.user_id);
  if (data.user?.last_sign_in_at) return fail("Your partner has already joined, so only they can change their email");

  const { error } = await admin.auth.admin.updateUserById(g.other.user_id, { email: address, email_confirm: true });
  if (error) {
    return isEmailTaken(error)
      ? fail("Some fields need fixing", { email: ["That email already has a WedPlan login. Use a different address"] })
      : fail(error.message);
  }

  const link = await freshLinkFor(address);
  if (!link.ok || link.userId !== g.other.user_id) return fail(link.ok ? "Couldn't make a new link" : link.error);
  revalidatePath("/settings");
  return ok(
    await sendPartnerInvite({
      email: address,
      tokenHash: link.tokenHash,
      type: link.type,
      weddingName: g.wedding.name,
      inviterName: g.me?.display_name ?? null,
    }),
  );
}
