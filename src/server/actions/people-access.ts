"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { plannerInviteEmail } from "@/lib/email/templates";
import { looksLikeEmail, plannerInvitePath, type InviteLinkType } from "@/lib/planner-invite";
import { getViewerKind, requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * Giving a person a planner login, and taking it away (spec 39 part C).
 *
 * Only the couple may do either. The database would stop a planner editing
 * `people`, but the admin call below would still create an account, so the
 * check is here too.
 */

async function requireCoupleForAction(): Promise<{ ok: true; weddingId: string; weddingName: string } | { ok: false; error: string }> {
  const wedding = await requireWedding();
  if ((await getViewerKind()) !== "couple") return { ok: false, error: "Only the two of you can change who has access" };
  return { ok: true, weddingId: wedding.id, weddingName: wedding.name };
}

function revalidateAccess() {
  revalidatePath("/settings");
}

export type PlannerInvite = {
  /** One-time. The couple can send this themselves if the email doesn't arrive. */
  link: string;
  emailed: boolean;
  /** Why it wasn't emailed, when it wasn't — e.g. no email provider configured. */
  emailNote: string | null;
};

/**
 * Creates (or finds) the account for `email`, marks the person as a planner,
 * and returns a one-time link to choose a password — also emailed, if email is
 * configured. Safe to call again for the same person: it issues a fresh link.
 */
export async function grantPlannerAccess(personId: string, email: string): Promise<ActionResult<PlannerInvite>> {
  const guard = await requireCoupleForAction();
  if (!guard.ok) return fail(guard.error);

  if (!z.string().uuid().safeParse(personId).success) return fail("Unknown person");
  const address = email.trim().toLowerCase();
  if (!looksLikeEmail(address)) return fail("That doesn't look like an email address");

  const supabase = await createClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, user_id, deleted_at")
    .eq("id", personId)
    .eq("wedding_id", guard.weddingId)
    .maybeSingle();
  if (personError) return fail(personError.message);
  if (!person || person.deleted_at) return fail("That person no longer exists");

  // Make the account (or, if it exists, a fresh set-password link for it).
  const admin = createAdminClient();
  let type: InviteLinkType = "invite";
  let generated = await admin.auth.admin.generateLink({ type: "invite", email: address });
  if (generated.error) {
    // An address that already has an account can't be "invited"; it gets a
    // set-password link instead.
    type = "recovery";
    generated = await admin.auth.admin.generateLink({ type: "recovery", email: address });
  }
  if (generated.error || !generated.data?.user || !generated.data.properties?.hashed_token) {
    return fail(generated.error?.message ?? "Couldn't create that login");
  }
  const userId = generated.data.user.id;
  const tokenHash = generated.data.properties.hashed_token;

  // The planner must be somebody else. Giving the couple's own login the
  // planner level would be harmless but pointless, and almost certainly a typo.
  const { data: collaborator, error: collaboratorError } = await supabase
    .from("collaborators")
    .select("id")
    .eq("wedding_id", guard.weddingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (collaboratorError) return fail(collaboratorError.message);
  if (collaborator) return fail("That's one of the two of you. The planner needs their own email address");

  // An address that already has an account gets a set-password link, and
  // handing THAT to the couple would let them take over somebody else's login.
  // So it is allowed only for a person already on this wedding (re-sending, or
  // restoring access) -- never for an account that merely happens to exist.
  if (type === "recovery") {
    const { data: known, error: knownError } = await supabase
      .from("people")
      .select("id")
      .eq("wedding_id", guard.weddingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (knownError) return fail(knownError.message);
    if (!known) {
      return fail("That email already has a WedPlan login. Use a different address for the planner");
    }
  }

  const { error: updateError } = await supabase
    .from("people")
    .update({ user_id: userId, access: "planner" })
    .eq("id", personId)
    .eq("wedding_id", guard.weddingId);
  if (updateError) {
    // unique (wedding_id, user_id): the same login on two people.
    if (updateError.code === "23505") return fail("That email already belongs to someone else on this wedding");
    return fail(updateError.message);
  }

  const link = absoluteUrl(plannerInvitePath(tokenHash, type));
  const message = plannerInviteEmail({ weddingName: guard.weddingName, url: link });
  const sent = await sendEmail({ to: address, ...message });

  revalidateAccess();
  return ok({
    link,
    emailed: sent.ok && sent.delivered,
    emailNote: sent.ok
      ? sent.delivered
        ? null
        : "Email isn't set up on this site, so nothing was sent. Send them the link yourself."
      : sent.error,
  });
}

/**
 * Takes the planner level away. Data access ends on their next request: RLS
 * reads the grant every time. Their login and `user_id` are kept, so giving
 * access back is one click and the activity log still names them.
 */
export async function revokePlannerAccess(personId: string): Promise<ActionResult> {
  const guard = await requireCoupleForAction();
  if (!guard.ok) return fail(guard.error);
  if (!z.string().uuid().safeParse(personId).success) return fail("Unknown person");

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ access: "none" })
    .eq("id", personId)
    .eq("wedding_id", guard.weddingId);
  if (error) return fail(error.message);

  revalidateAccess();
  return ok(undefined);
}
