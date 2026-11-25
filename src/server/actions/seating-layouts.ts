"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DELETED_DRAFT_DAYS } from "@/lib/seating/layouts";
import { getSessionUser, requireWedding } from "@/server/queries/wedding";
import { resolveLayout } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * Draft layouts (spec 57 Part G): try a layout, rename, delete and restore a
 * draft, and swap one in as the live layout. The copy and the swap are single
 * database functions (migration 0059), so each is one transaction. Every
 * Supabase `error` is checked.
 */

const uuid = z.string().uuid();
const nameSchema = z.string().trim().min(1, "Give the layout a name").max(60, "Keep the name under 60 characters");

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/seating`);
  revalidatePath(`/events/${eventId}/seating/print`);
  revalidatePath("/seating");
}

async function eventBelongs(weddingId: string, eventId: string): Promise<boolean> {
  if (!uuid.safeParse(eventId).success) return false;
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id").eq("id", eventId).eq("wedding_id", weddingId).maybeSingle();
  return Boolean(data);
}

/** Copies the shown layout, with its seating, into a new draft named `name`. Returns the draft's id. */
export async function tryLayout(eventId: string, sourceLayoutId: string | null, name: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Give the layout a name");
  const source = await resolveLayout(wedding.id, eventId, sourceLayoutId);
  if (!source.ok) return fail(source.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seating_try_layout", {
    p_event_id: eventId,
    p_source_layout_id: source.layout.id,
    p_name: parsed.data,
  });
  if (error) return fail(error.code === "54000" ? "Twenty drafts is the most. Delete one first." : error.message);
  revalidate(eventId);
  return ok({ id: data });
}

export async function renameLayout(eventId: string, layoutId: string, name: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Give the layout a name");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const supabase = await createClient();
  const { error } = await supabase.from("seating_layouts").update({ name: parsed.data }).eq("id", layout.layout.id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/** A draft goes to "Recently deleted" for 30 days. The live layout can't be deleted. */
export async function deleteLayoutDraft(eventId: string, layoutId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  if (layout.layout.isLive) return fail("The live layout can't be deleted. Make another layout live first.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_layouts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", layout.layout.id)
    .eq("wedding_id", wedding.id)
    .eq("is_live", false);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/** Brings a deleted draft back, if it was deleted in the last 30 days. */
export async function restoreLayoutDraft(eventId: string, layoutId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId)) || !uuid.safeParse(layoutId).success) return fail("That layout doesn't exist");
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - DELETED_DRAFT_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("seating_layouts")
    .update({ deleted_at: null })
    .eq("id", layoutId)
    .eq("wedding_id", wedding.id)
    .eq("event_id", eventId)
    .gte("deleted_at", cutoff)
    .select("id");
  if (error) return fail(error.message);
  if (!data || data.length === 0) return fail("That draft was deleted more than 30 days ago");
  revalidate(eventId);
  return ok(undefined);
}

/**
 * Swaps a draft in. The layout that was live becomes a draft named "<name>
 * (before <date>)", so the swap can be undone the same way. Guests' pages and
 * day links follow at once, so they're refreshed when the table reveal is on.
 */
export async function makeLayoutLive(eventId: string, layoutId: string): Promise<ActionResult<{ previousId: string | null }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId)) || !uuid.safeParse(layoutId).success) return fail("That layout doesn't exist");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("seating_make_live", { p_event_id: eventId, p_layout_id: layoutId });
  if (error) {
    if (error.code === "55000") return fail("The live layout is locked. Unlock it before swapping another in.");
    if (error.code === "22023") return fail("That layout is already live.");
    return fail(error.message);
  }
  revalidate(eventId);
  revalidatePath("/w", "layout");
  revalidatePath("/day", "layout");
  return ok({ previousId: data.previous });
}

/**
 * Lock room (spec 57 Part D): freezes the shown layout's walls, drawing,
 * areas, furniture and décor. Any collaborator can lock or unlock; the plan
 * shows who and when. Seating, freeing seats, table styles and counts still
 * work. Every write that would change the room enforces it.
 */
export async function setRoomLock(eventId: string, layoutId: string | undefined, locked: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const user = await getSessionUser();
  if (!user) return fail("Sign in again to lock the room");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_layouts")
    .update(locked ? { locked_at: new Date().toISOString(), locked_by: user.id } : { locked_at: null, locked_by: null })
    .eq("id", layout.layout.id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}
