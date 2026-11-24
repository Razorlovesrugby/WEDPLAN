"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding, getSessionUser } from "@/server/queries/wedding";
import { clearConfirmedForMoved, snapshotTimes } from "@/server/day-links/confirmations";
import { fail, ok, type ActionResult } from "./result";

/**
 * The master's actions (spec 55 §10). Each writes what it changes and one
 * `day_activity` row recording who did it (the `by` in the payload), so the
 * feed shows who dealt with what. Every Supabase `error` is checked.
 * Calling a cue, announcing and answering reuse spec 54's actions
 * (`callCue`, `sendAnnouncement`, `answerHelp`) and add the activity row here.
 */

function revalidate() {
  revalidatePath("/day");
  revalidatePath("/run-sheet");
  revalidatePath("/run-sheet/links");
}

type Actor = { name: string; kind: "collaborator" | "person"; id: string };

/** The signed-in collaborator or planner, as an assignee reference and a name. */
async function actor(weddingId: string): Promise<Actor | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: collab } = await supabase.from("collaborators").select("user_id, display_name, role").eq("wedding_id", weddingId).eq("user_id", user.id).maybeSingle();
  if (collab) return { name: collab.display_name?.trim() || (collab.role === "owner" ? "The couple" : "Partner"), kind: "collaborator", id: collab.user_id };
  const { data: person } = await supabase.from("people").select("id, name").eq("wedding_id", weddingId).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  if (person) return { name: person.name, kind: "person", id: person.id };
  return null;
}

async function logActivity(weddingId: string, who: Actor | null, kind: string, itemId: string | null, payload: Record<string, unknown>): Promise<string | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("day_activity")
    .insert({ wedding_id: weddingId, kind, item_id: itemId, payload: { ...payload, by: who?.name ?? "Someone" }, tapped_at: now });
  return error?.message ?? null;
}

const idSchema = z.string().uuid();

/** Answers a help request or a question; the helper's banner shows it. */
export async function answerAlert(activityId: string, answer: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!idSchema.safeParse(activityId).success) return fail("Unknown request");
  const clean = answer.trim();
  if (!clean || clean.length > 500) return fail("Write a short answer (up to 500 characters)");
  const who = await actor(wedding.id);
  const supabase = await createClient();
  const { data: row, error: readError } = await supabase.from("day_activity").select("kind, item_id").eq("id", activityId).eq("wedding_id", wedding.id).in("kind", ["help", "question"]).maybeSingle();
  if (readError) return fail(readError.message);
  if (!row) return fail("That request no longer exists");
  const user = await getSessionUser();
  const { error } = await supabase
    .from("day_activity")
    .update({ answer: clean, answered_at: new Date().toISOString(), answered_by: user?.id ?? null })
    .eq("id", activityId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  const problem = await logActivity(wedding.id, who, row.kind === "help" ? "help_answered" : "question_answered", row.item_id, { text: clean, request_id: activityId });
  if (problem) return fail(problem);
  revalidate();
  return ok(undefined);
}

async function addAssignee(weddingId: string, itemId: string, a: { type: "collaborator" | "guest" | "vendor" | "person"; id: string }): Promise<string | null> {
  const supabase = await createClient();
  const column = a.type === "collaborator" ? "collaborator_user_id" : (`${a.type}_id` as "guest_id" | "vendor_id" | "person_id");
  const { data: existing, error } = await supabase.from("run_sheet_item_assignees").select("id, state").eq("wedding_id", weddingId).eq("item_id", itemId).eq(column, a.id).maybeSingle();
  if (error) return error.message;
  if (existing) {
    // Someone who handed it back and is asked again: put them back on it.
    if (existing.state === "handed_back") {
      const { error: resetError } = await supabase.from("run_sheet_item_assignees").update({ state: "todo", state_at: new Date().toISOString(), handed_back_reason: null }).eq("id", existing.id);
      return resetError?.message ?? null;
    }
    return null;
  }
  const { error: insertError } = await supabase.from("run_sheet_item_assignees").insert({
    wedding_id: weddingId,
    item_id: itemId,
    collaborator_user_id: a.type === "collaborator" ? a.id : null,
    guest_id: a.type === "guest" ? a.id : null,
    vendor_id: a.type === "vendor" ? a.id : null,
    person_id: a.type === "person" ? a.id : null,
  });
  return insertError?.message ?? null;
}

const assigneeSchema = z.object({ type: z.enum(["collaborator", "guest", "vendor", "person"]), id: idSchema });

/** "I'll take it" / "Reassign": adds someone to the task, who sees it on their link at once. */
export async function reassignTask(itemId: string, assignee: z.input<typeof assigneeSchema>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = assigneeSchema.safeParse(assignee);
  if (!idSchema.safeParse(itemId).success || !parsed.success) return fail("Pick who takes it");
  const problem = await addAssignee(wedding.id, itemId, parsed.data);
  if (problem) return fail(problem);
  const who = await actor(wedding.id);
  const logged = await logActivity(wedding.id, who, "reassigned", itemId, { to: parsed.data });
  if (logged) return fail(logged);
  revalidate();
  return ok(undefined);
}

/** The person answering takes the task themselves. */
export async function takeTask(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const who = await actor(wedding.id);
  if (!who) return fail("Only the couple and the planner can take a task");
  return reassignTask(itemId, { type: who.kind, id: who.id });
}

/** Marks everyone still to do on a task as started (they didn't tap Start). */
export async function markStarted(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!idSchema.safeParse(itemId).success) return fail("Unknown task");
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("run_sheet_item_assignees")
    .update({ state: "started", state_at: now, started_at: now })
    .eq("wedding_id", wedding.id)
    .eq("item_id", itemId)
    .eq("state", "todo")
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("Nobody is waiting to start on that task");
  const problem = await logActivity(wedding.id, await actor(wedding.id), "marked_started", itemId, {});
  if (problem) return fail(problem);
  revalidate();
  return ok(undefined);
}

/** Puts an alert away until something changes. The key says which. */
export async function dismissAlert(alertKey: string, itemId: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const key = z.string().min(3).max(200).safeParse(alertKey);
  if (!key.success) return fail("Unknown alert");
  const problem = await logActivity(wedding.id, await actor(wedding.id), "alert_dismissed", itemId, { key: key.data });
  if (problem) return fail(problem);
  revalidate();
  return ok(undefined);
}

/**
 * Shifts the schedule through spec 50's own function: the item and everything
 * that starts after it move together, fixed items stay. "Just this item" is
 * allowed only when nothing starts after it. The result carries what Undo needs.
 */
export async function shiftSchedule(itemId: string, deltaMinutes: number, scope: "chain" | "only", summary: string): Promise<ActionResult<{ itemId: string; deltaMinutes: number }>> {
  const wedding = await requireWedding();
  const delta = z.number().int().min(-1440).max(1440).refine((n) => n !== 0).safeParse(deltaMinutes);
  if (!idSchema.safeParse(itemId).success || !delta.success) return fail("Pick a number of minutes");
  const supabase = await createClient();

  if (scope === "only") {
    const { count, error } = await supabase.from("run_sheet_items").select("id", { count: "exact", head: true }).eq("wedding_id", wedding.id).eq("predecessor_id", itemId);
    if (error) return fail(error.message);
    if ((count ?? 0) > 0) return fail("Items start after this one, so they move with it.");
  }
  const before = await snapshotTimes(wedding.id);
  const { error } = await supabase.rpc("shift_run_sheet_item", { p_wedding_id: wedding.id, p_item_id: itemId, p_delta_minutes: delta.data });
  if (error) return fail(error.message);
  const cleared = await clearConfirmedForMoved(wedding.id, before);
  if (cleared) return fail(cleared);
  const problem = await logActivity(wedding.id, await actor(wedding.id), "schedule_shifted", itemId, { minutes: delta.data, text: summary.slice(0, 200) });
  if (problem) return fail(problem);
  revalidate();
  return ok({ itemId, deltaMinutes: delta.data });
}

/** Records Go as the master's act (spec 54's `callCue` sets the time and writes `cue_go`). */
export async function announce(input: { audience: "everyone" | "group" | "link"; groupId?: string | null; linkId?: string | null; text: string; important?: boolean }): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const text = z.string().trim().min(1, "Write the message").max(500).safeParse(input.text);
  if (!text.success) return fail("Write a short message (up to 500 characters)");
  if (input.audience === "group" && !input.groupId) return fail("Pick a group");
  if (input.audience === "link" && !input.linkId) return fail("Pick a person");
  const supabase = await createClient();
  const user = await getSessionUser();
  const { data, error } = await supabase
    .from("day_announcements")
    .insert({
      wedding_id: wedding.id,
      audience: input.audience,
      group_id: input.audience === "group" ? input.groupId! : null,
      link_id: input.audience === "link" ? input.linkId! : null,
      text: text.data,
      important: input.important ?? false,
      sent_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  const problem = await logActivity(wedding.id, await actor(wedding.id), "announced", null, { text: text.data, important: input.important ?? false });
  if (problem) return fail(problem);
  revalidate();
  return ok({ id: data.id });
}

/** Names (or clears) the day lead. Naming one turns the couple's own alerts off by default (§6). */
export async function setDayLead(lead: { type: "collaborator" | "person"; id: string } | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  if (lead && (!idSchema.safeParse(lead.id).success || !["collaborator", "person"].includes(lead.type))) return fail("Pick the day lead");
  const { error } = await supabase
    .from("weddings")
    .update({
      day_lead_user_id: lead?.type === "collaborator" ? lead.id : null,
      day_lead_person_id: lead?.type === "person" ? lead.id : null,
    })
    .eq("id", wedding.id);
  if (error) return fail(error.message);
  if (lead) {
    // The couple step back: alerts off for the collaborators who aren't the lead.
    const { error: alertsError } = await supabase.from("collaborators").update({ day_alerts: false }).eq("wedding_id", wedding.id).neq("user_id", lead.type === "collaborator" ? lead.id : "00000000-0000-0000-0000-000000000000");
    if (alertsError) return fail(alertsError.message);
  }
  revalidate();
  return ok(undefined);
}

/** My own "Alerts on the day" switch (§6). */
export async function setDayAlerts(on: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_day_alerts", { p_wedding_id: wedding.id, p_on: on });
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}
