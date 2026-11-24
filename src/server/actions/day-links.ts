"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { dayLinkEmail } from "@/lib/email/templates";
import { decryptToken, encryptToken, generateInviteToken, hashInviteToken } from "@/lib/tokens";
import { linkExpiry } from "@/lib/day-links/my-day";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * The couple's side of day links (spec 54 §10.5): make, copy, email and turn
 * off a helper's link. The link's own taps are in `day-link-taps.ts`.
 *
 * Reads and writes here go through the couple's own session (RLS), so a
 * planner login with write access may do the same. Only the token's secrecy
 * is special: it is stored hashed plus encrypted (the spec 9 pattern) and
 * decrypted here only to hand back to a signed-in collaborator.
 */

const assigneeSchema = z.object({
  type: z.enum(["vendor", "guest", "person"]),
  id: z.string().uuid(),
});
export type DayLinkAssignee = z.infer<typeof assigneeSchema>;

function revalidate() {
  revalidatePath("/run-sheet");
  revalidatePath("/run-sheet/links");
}

async function labelFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  assignee: DayLinkAssignee,
): Promise<{ name: string; email: string | null } | null> {
  if (assignee.type === "vendor") {
    const { data } = await supabase.from("vendors").select("name, email").eq("id", assignee.id).eq("wedding_id", weddingId).maybeSingle();
    return data ? { name: data.name, email: data.email } : null;
  }
  if (assignee.type === "guest") {
    const { data } = await supabase
      .from("guests")
      .select("first_name, preferred_name, email")
      .eq("id", assignee.id)
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .maybeSingle();
    return data ? { name: data.preferred_name?.trim() || data.first_name, email: data.email } : null;
  }
  const { data } = await supabase
    .from("people")
    .select("name, email")
    .eq("id", assignee.id)
    .eq("wedding_id", weddingId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? { name: data.name, email: data.email } : null;
}

/** Seven days after the wedding's last event (§12). */
async function expiryFor(supabase: Awaited<ReturnType<typeof createClient>>, wedding: { id: string; timezone: string; wedding_date: string | null }): Promise<Date> {
  const { data } = await supabase.from("events").select("starts_at, ends_at").eq("wedding_id", wedding.id);
  const ends = (data ?? []).map((e) => e.ends_at ?? e.starts_at).filter((x): x is string => !!x).sort();
  const { data: tasks } = await supabase.from("run_sheet_items").select("ends_at").eq("wedding_id", wedding.id).order("ends_at", { ascending: false }).limit(1);
  const lastTask = tasks?.[0]?.ends_at ?? null;
  const last = [ends.at(-1) ?? null, lastTask].filter((x): x is string => !!x).sort().at(-1) ?? null;
  return linkExpiry(last, wedding.wedding_date, wedding.timezone) ?? new Date(Date.now() + 30 * 24 * 3600_000);
}

/** Makes someone's link, turning off the one they had. Returns the URL to share. */
export async function makeDayLink(input: DayLinkAssignee): Promise<ActionResult<{ id: string; url: string }>> {
  const wedding = await requireWedding();
  const parsed = assigneeSchema.safeParse(input);
  if (!parsed.success) return fail("Unknown person");

  const supabase = await createClient();
  const who = await labelFor(supabase, wedding.id, parsed.data);
  if (!who) return fail("That person no longer exists");

  const column = `${parsed.data.type}_id` as const;
  const { error: revokeError } = await supabase
    .from("day_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("wedding_id", wedding.id)
    .eq(column, parsed.data.id)
    .is("revoked_at", null);
  if (revokeError) return fail(revokeError.message);

  const token = generateInviteToken();
  const { data, error } = await supabase
    .from("day_links")
    .insert({
      wedding_id: wedding.id,
      vendor_id: parsed.data.type === "vendor" ? parsed.data.id : null,
      guest_id: parsed.data.type === "guest" ? parsed.data.id : null,
      person_id: parsed.data.type === "person" ? parsed.data.id : null,
      label: who.name,
      token_hash: hashInviteToken(token),
      token_encrypted: encryptToken(token),
      expires_at: (await expiryFor(supabase, wedding)).toISOString(),
    })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidate();
  return ok({ id: data.id, url: absoluteUrl(`/d/${token}`) });
}

/** The link again, for Copy and the QR code, to a signed-in collaborator only. */
export async function getDayLinkUrl(linkId: string): Promise<ActionResult<{ url: string }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("day_links")
    .select("token_encrypted, revoked_at")
    .eq("id", linkId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data || data.revoked_at) return fail("That link is turned off");
  const token = decryptToken(data.token_encrypted);
  if (!token) return fail("That link can't be recovered. Make a new one.");
  return ok({ url: absoluteUrl(`/d/${token}`) });
}

export async function revokeDayLink(linkId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("day_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("wedding_id", wedding.id)
    .is("revoked_at", null);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

/** Move the expiry (extend a link, or end it early). */
export async function setDayLinkExpiry(linkId: string, expiresAt: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (Number.isNaN(Date.parse(expiresAt))) return fail("That doesn't look like a date");
  const supabase = await createClient();
  const { error } = await supabase
    .from("day_links")
    .update({ expires_at: new Date(expiresAt).toISOString() })
    .eq("id", linkId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

/** Emails the link to the address the couple knows for them. */
export async function emailDayLink(linkId: string): Promise<ActionResult<{ delivered: boolean }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: link, error } = await supabase
    .from("day_links")
    .select("vendor_id, guest_id, person_id, label, token_encrypted, revoked_at")
    .eq("id", linkId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!link || link.revoked_at) return fail("That link is turned off");

  const assignee: DayLinkAssignee = link.vendor_id
    ? { type: "vendor", id: link.vendor_id }
    : link.guest_id
      ? { type: "guest", id: link.guest_id }
      : { type: "person", id: link.person_id! };
  const who = await labelFor(supabase, wedding.id, assignee);
  if (!who?.email) return fail("There's no email address for them. Add one first.");

  const token = decryptToken(link.token_encrypted);
  if (!token) return fail("That link can't be recovered. Make a new one.");

  const message = dayLinkEmail({ weddingName: wedding.name, helperName: who.name, url: absoluteUrl(`/d/${token}`) });
  const sent = await sendEmail({ to: who.email, ...message });
  if (!sent.ok) return fail(sent.error);
  return ok({ delivered: sent.delivered });
}

// ---------------------------------------------------------------------------
// Phone and email for whoever a task is assigned to (§10.7)
// ---------------------------------------------------------------------------
const contactSchema = z.object({
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(200).email("That doesn't look like an email").or(z.literal("")).optional(),
});

export async function setAssigneeContact(
  assignee: DayLinkAssignee,
  fields: { phone?: string; email?: string },
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsedAssignee = assigneeSchema.safeParse(assignee);
  const parsed = contactSchema.safeParse(fields);
  if (!parsedAssignee.success) return fail("Unknown person");
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const patch: { phone?: string | null; email?: string | null } = {};
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone || null;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email || null;
  if (Object.keys(patch).length === 0) return ok(undefined);

  const supabase = await createClient();
  const table = parsedAssignee.data.type === "vendor" ? "vendors" : parsedAssignee.data.type === "guest" ? "guests" : "people";
  const { error } = await supabase.from(table).update(patch).eq("id", parsedAssignee.data.id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  revalidatePath("/guests");
  revalidatePath("/vendors");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Day contacts and Good to know (§10.6, §10.9)
// ---------------------------------------------------------------------------
const dayContactSchema = z.object({
  label: z.string().trim().min(1, "Give them a label").max(80),
  phone: z.string().trim().min(3, "Add a phone number").max(40),
});

export async function saveDayContact(contactId: string | null, fields: { label: string; phone: string }): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = dayContactSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  if (contactId) {
    const { error } = await supabase.from("day_contacts").update(parsed.data).eq("id", contactId).eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
    revalidate();
    return ok({ id: contactId });
  }
  const { data: last } = await supabase.from("day_contacts").select("sort_order").eq("wedding_id", wedding.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("day_contacts")
    .insert({ ...parsed.data, wedding_id: wedding.id, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(error.message);
  revalidate();
  return ok({ id: data.id });
}

export async function deleteDayContact(contactId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("day_contacts").delete().eq("id", contactId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

const infoSchema = z.object({
  heading: z.string().trim().min(1, "Give the section a heading").max(80),
  body: z.string().trim().max(2000),
});

export async function saveInfoSection(sectionId: string | null, fields: { heading: string; body: string }): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = infoSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const supabase = await createClient();
  if (sectionId) {
    const { error } = await supabase.from("day_info_sections").update(parsed.data).eq("id", sectionId).eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
    revalidate();
    return ok({ id: sectionId });
  }
  const { data: last } = await supabase.from("day_info_sections").select("sort_order").eq("wedding_id", wedding.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("day_info_sections")
    .insert({ ...parsed.data, wedding_id: wedding.id, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(error.message);
  revalidate();
  return ok({ id: data.id });
}

export async function deleteInfoSection(sectionId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("day_info_sections").delete().eq("id", sectionId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

/** The couple answers a help request; the helper's banner shows it (§6.2). */
export async function answerHelp(activityId: string, answer: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const clean = answer.trim();
  if (!clean || clean.length > 500) return fail("Write a short answer (up to 500 characters)");
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("day_activity")
    .update({ answer: clean, answered_at: new Date().toISOString(), answered_by: user.user?.id ?? null })
    .eq("id", activityId)
    .eq("wedding_id", wedding.id)
    .eq("kind", "help");
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

