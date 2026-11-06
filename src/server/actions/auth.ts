"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashClientIp } from "@/lib/tokens";
import { passwordProblem } from "@/lib/onboarding";
import { getSessionUser } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

const PASSWORD_WINDOW_MINUTES = 15;
const PASSWORD_MAX_FAILURES = 5;

/**
 * Change password while signed in (spec 40 §6). The current password is
 * checked first, so a borrowed unlocked laptop can't take the account, and
 * wrong guesses are throttled per login (the same infrastructure table as the
 * RSVP throttle, under a key of its own).
 */
export async function changePassword(fields: {
  current: string;
  next: string;
  again: string;
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user?.email) return fail("Sign in again first");

  const problem = passwordProblem(fields.next ?? "");
  if (problem) return fail("Some fields need fixing", { next: [problem] });
  if (fields.next !== fields.again) return fail("Some fields need fixing", { again: ["The two passwords don't match"] });
  if (fields.next === fields.current) {
    return fail("Some fields need fixing", { next: ["That's your current password"] });
  }

  const admin = createAdminClient();
  const key = hashClientIp(`password:${user.id}`);
  const since = new Date(Date.now() - PASSWORD_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await admin
    .from("rsvp_token_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", key)
    .eq("succeeded", false)
    .gte("attempted_at", since);
  if ((count ?? 0) >= PASSWORD_MAX_FAILURES) {
    return fail("Too many wrong passwords. Wait a few minutes, or use “Forgot it?”.");
  }

  const supabase = await createClient();
  const { error: checkError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: fields.current ?? "",
  });
  if (checkError) {
    await admin.from("rsvp_token_attempts").insert({ ip_hash: key, succeeded: false });
    return fail("Some fields need fixing", { current: ["That isn't your current password"] });
  }

  const { error } = await supabase.auth.updateUser({ password: fields.next });
  if (error) return fail(error.message);
  return ok(undefined);
}
