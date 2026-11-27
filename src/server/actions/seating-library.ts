"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * The couple's own décor items and marquee templates (spec 57 A.3 and B.5):
 * wedding-wide, soft-deleted so a placed one keeps drawing. Every Supabase
 * `error` is checked.
 */

const uuid = z.string().uuid();
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour").nullable().optional();

function revalidate(eventId: string) {
  revalidatePath(`/events/${eventId}/seating`);
  revalidatePath("/seating");
}

const customItemSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Give the item a name").max(60, "Keep the name under 60 characters"),
  shape: z.enum(["rect", "round"]),
  width_cm: z.number().int().min(20, "At least 20 cm").max(5000, "5 m at most"),
  depth_cm: z.number().int().min(20, "At least 20 cm").max(5000, "5 m at most"),
  colour,
  vendor_id: uuid.nullable().optional(),
});

/** Creates one of the couple's own décor items, or changes one. */
export async function saveCustomItem(eventId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = customItemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That item isn't right", parsed.error.flatten().fieldErrors);
  const { id, ...fields } = parsed.data;
  const row = { name: fields.name, shape: fields.shape, width_cm: fields.width_cm, depth_cm: fields.depth_cm, colour: fields.colour ?? null, vendor_id: fields.vendor_id ?? null };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("seating_custom_items").update(row).eq("id", id).eq("wedding_id", wedding.id).is("deleted_at", null).select("id");
    if (error) return fail(error.message);
    if (!data || data.length === 0) return fail("That item doesn't exist any more");
    revalidate(eventId);
    return ok({ id });
  }
  const { data, error } = await supabase.from("seating_custom_items").insert({ wedding_id: wedding.id, ...row }).select("id").single();
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ id: data.id });
}

/** Retires an item. Ones already placed keep drawing and counting. */
export async function deleteCustomItem(eventId: string, id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!uuid.safeParse(id).success) return fail("That item doesn't exist");
  const supabase = await createClient();
  const { error } = await supabase.from("seating_custom_items").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}

const marqueeSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1, "Give the marquee a name").max(60, "Keep the name under 60 characters"),
  width_cm: z.number().int().min(100, "At least 1 m").max(20000, "200 m at most"),
  length_cm: z.number().int().min(100, "At least 1 m").max(20000, "200 m at most"),
  pole_spacing_cm: z.number().int().min(50, "At least 50 cm apart").max(5000, "50 m at most").nullable().optional(),
  middle_poles: z.boolean().default(false),
  rounded_ends: z.boolean().default(false),
});

/** A marquee the couple has hired: its size, where its poles are, and whether its ends are rounded. */
export async function saveMarquee(eventId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = marqueeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "That marquee isn't right", parsed.error.flatten().fieldErrors);
  const { id, ...fields } = parsed.data;
  const row = { ...fields, pole_spacing_cm: fields.pole_spacing_cm ?? null };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("seating_marquees").update(row).eq("id", id).eq("wedding_id", wedding.id).is("deleted_at", null).select("id");
    if (error) return fail(error.message);
    if (!data || data.length === 0) return fail("That marquee doesn't exist any more");
    revalidate(eventId);
    return ok({ id });
  }
  const { data, error } = await supabase.from("seating_marquees").insert({ wedding_id: wedding.id, ...row }).select("id").single();
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok({ id: data.id });
}

export async function deleteMarquee(eventId: string, id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!uuid.safeParse(id).success) return fail("That marquee doesn't exist");
  const supabase = await createClient();
  const { error } = await supabase.from("seating_marquees").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate(eventId);
  return ok(undefined);
}
