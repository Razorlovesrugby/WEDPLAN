"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isServiceStyle, parseMenu, typedPlatters } from "@/lib/seating/service";
import { requireWedding } from "@/server/queries/wedding";
import { resolveLayout } from "@/server/seating-layout";
import { fail, ok, type ActionResult } from "./result";

/**
 * How food is served (spec 57 Part F): the event's service style and menu,
 * platter counts typed by hand, and who has their own plate or a kids' meal.
 * Service never touches RSVP questions or answers. Every Supabase `error` is
 * checked.
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

/** The plan's default service style; each course can take it or its own. */
export async function setServiceStyle(eventId: string, style: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!isServiceStyle(style)) return fail("That isn't one of the four ways to serve");
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_plans")
    .upsert({ wedding_id: wedding.id, event_id: eventId, service_style: style }, { onConflict: "event_id" });
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/** Saves the whole menu. Checked by `parseMenu` first: says what is wrong rather than repairing it. */
export async function saveSeatingMenu(eventId: string, menu: unknown): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const parsed = parseMenu(menu);
  if (!parsed.ok) return fail(parsed.error);
  if (new TextEncoder().encode(JSON.stringify(parsed.menu)).length > 64 * 1024) return fail("That menu is too big to save.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("seating_plans")
    .upsert({ wedding_id: wedding.id, event_id: eventId, menu: parsed.menu }, { onConflict: "event_id" });
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/**
 * A platter count typed for one table and dish. It remembers how many guests
 * were sharing, so it clears itself (and the table is flagged "Check
 * platters") when they change. `n` null puts the formula's count back.
 */
export async function setPlatterCount(eventId: string, tableId: string, dishId: string, n: number | null, sharingNow: number): Promise<ActionResult> {
  const wedding = await requireWedding();
  const input = z
    .object({ tableId: uuid, dishId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), n: z.number().int().min(0).max(999).nullable(), sharing: z.number().int().min(0).max(1000) })
    .safeParse({ tableId, dishId, n, sharing: sharingNow });
  if (!input.success) return fail("That count isn't right");
  const supabase = await createClient();
  const { data: table, error: readError } = await supabase.from("seating_tables").select("platter_counts").eq("id", tableId).eq("wedding_id", wedding.id).maybeSingle();
  if (readError) return fail(readError.message);
  if (!table) return fail("That table doesn't exist");
  const next = typedPlatters(table.platter_counts, dishId, n, sharingNow);
  const { error } = await supabase
    .from("seating_tables")
    .update({ platter_counts: Object.keys(next).length > 0 ? next : null })
    .eq("id", tableId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

/**
 * Own plate and kids' meal on one seat, for one course (F.5). `ownPlate`
 * true puts the guest outside that course's platters; `kidsMeal` false makes
 * a child share instead of the default plated kids' meal. Omitted fields are
 * left alone.
 */
export async function setSeatFood(
  eventId: string,
  guestId: string,
  courseId: string,
  change: { ownPlate?: boolean; kidsMeal?: boolean },
  layoutId?: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!uuid.safeParse(guestId).success || !/^[A-Za-z0-9_-]{1,40}$/.test(courseId)) return fail("That seat doesn't exist");
  if (!(await eventBelongs(wedding.id, eventId))) return fail("That event doesn't exist");
  const layout = await resolveLayout(wedding.id, eventId, layoutId);
  if (!layout.ok) return fail(layout.error);
  const supabase = await createClient();
  const { data: seat, error: readError } = await supabase
    .from("seat_assignments")
    .select("own_plate, kids_meal")
    .eq("wedding_id", wedding.id)
    .eq("layout_id", layout.layout.id)
    .eq("guest_id", guestId)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!seat) return fail("That guest isn't seated");

  const patch = (current: unknown, value: boolean | undefined) => {
    const out: Record<string, boolean> = {};
    if (current && typeof current === "object" && !Array.isArray(current)) {
      for (const [k, v] of Object.entries(current)) if (typeof v === "boolean") out[k] = v;
    }
    if (value !== undefined) out[courseId] = value;
    return out;
  };
  const { error } = await supabase
    .from("seat_assignments")
    .update({ own_plate: patch(seat.own_plate, change.ownPlate), kids_meal: patch(seat.kids_meal, change.kidsMeal) })
    .eq("wedding_id", wedding.id)
    .eq("layout_id", layout.layout.id)
    .eq("guest_id", guestId);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}
