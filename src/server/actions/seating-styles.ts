"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseStyleChanges, parseStyleCentre, parseStylePlace, STYLE_LIMITS } from "@/lib/seating/items";
import { requireWedding } from "@/server/queries/wedding";
import { resolveLayout } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * Table styles and final item counts (spec 57 Part C). Styles are wedding-wide
 * and soft-deleted; which style a table has, and its own changes, live on the
 * table (and so travel with undo). Every Supabase `error` is checked.
 */

const uuid = z.string().uuid();

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

const styleInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Give the style a name").max(STYLE_LIMITS.name, "Keep the name under 60 characters"),
  place: z.unknown(),
  centre: z.unknown(),
});

/** Creates a style, or changes one. Returns its id. */
export async function saveTableStyle(eventId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const parsed = styleInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That style isn't right", parsed.error.flatten().fieldErrors);
  const { id, name } = parsed.data;
  const place = parseStylePlace(parsed.data.place);
  const centre = parseStyleCentre(parsed.data.centre);
  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("seating_table_styles")
      .update({ name, place, centre })
      .eq("id", id)
      .eq("wedding_id", wedding.id)
      .is("deleted_at", null)
      .select("id");
    if (error) return fail(error.code === "23505" ? "You already have a style with that name" : error.message);
    if (!data || data.length === 0) return fail("That style doesn't exist any more");
    revalidate(eventId);
    return ok({ id });
  }
  const { data, error } = await supabase
    .from("seating_table_styles")
    .insert({ wedding_id: wedding.id, name, place, centre })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? "You already have a style with that name" : error.message);
  revalidate(eventId);
  return ok({ id: data.id });
}

/** Retires a style. Tables using it go back to having none; nothing else is lost. */
export async function deleteTableStyle(eventId: string, styleId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId)) || !uuid.safeParse(styleId).success) return fail("That style doesn't exist");
  const supabase = await createClient();
  const cleared = await supabase.from("seating_tables").update({ style_id: null, style_changes: null }).eq("wedding_id", wedding.id).eq("style_id", styleId);
  if (cleared.error) return fail(cleared.error.message);
  const { error } = await supabase
    .from("seating_table_styles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", styleId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/** Gives these tables a style (or none), dropping any changes they had on the old one. */
export async function applyTableStyle(eventId: string, styleId: string | null, tableIds: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  if (styleId !== null && !uuid.safeParse(styleId).success) return fail("That style doesn't exist");
  const ids = z.array(uuid).max(500).safeParse(tableIds);
  if (!ids.success || ids.data.length === 0) return fail("Pick at least one table");
  const supabase = await createClient();
  if (styleId) {
    const { data, error } = await supabase.from("seating_table_styles").select("id").eq("id", styleId).eq("wedding_id", wedding.id).is("deleted_at", null).maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("That style doesn't exist any more");
  }
  const { error } = await supabase
    .from("seating_tables")
    .update({ style_id: styleId, style_changes: null })
    .eq("wedding_id", wedding.id)
    .eq("event_id", eventId)
    .in("id", ids.data);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/** Changes on one table over its style; null clears them ("Reset to style"). */
export async function setTableStyleChanges(eventId: string, tableId: string, changes: unknown): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId)) || !uuid.safeParse(tableId).success) return fail("That table doesn't exist");
  const parsed = changes === null ? null : parseStyleChanges(changes);
  if (changes !== null && !parsed) return fail("Those changes aren't right");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seating_tables")
    .update({ style_changes: parsed })
    .eq("id", tableId)
    .eq("wedding_id", wedding.id)
    .eq("event_id", eventId)
    .select("id");
  if (error) return fail(error.message);
  if (!data || data.length === 0) return fail("That table doesn't exist");
  revalidate(eventId);
  return ok(undefined);
}

/**
 * The number the couple types for an item. `suggested*` is what the app showed
 * them, kept so the list can say "Seating changed since you set this".
 * A null `final` clears the number and keeps the supplier and budget link.
 */
export async function setItemFinalCount(
  eventId: string,
  itemKey: string,
  final: number | null,
  suggested: { chairs: number; guests: number },
  layoutId?: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const parsed = z
    .object({
      key: z.string().min(1).max(160),
      final: z.number().int().min(0).max(100000).nullable(),
      chairs: z.number().int().min(0),
      guests: z.number().int().min(0),
    })
    .safeParse({ key: itemKey, final, chairs: suggested.chairs, guests: suggested.guests });
  if (!parsed.success) return fail("That number isn't right");
  const supabase = await createClient();
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const { error } = await supabase.from("seating_item_counts").upsert(
    {
      wedding_id: wedding.id,
      layout_id: layout.layout.id,
      item_key: parsed.data.key,
      final_count: parsed.data.final,
      suggested_chairs: parsed.data.final === null ? null : parsed.data.chairs,
      suggested_guests: parsed.data.final === null ? null : parsed.data.guests,
    },
    { onConflict: "layout_id,item_key" },
  );
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}
