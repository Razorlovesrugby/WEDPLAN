"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { zonedInputToUtc } from "@/lib/timezone";
import { fail, ok, type ActionResult } from "./result";

/**
 * Event times arrive from a datetime-local input, which has no timezone. They
 * are interpreted in the WEDDING's timezone, not the browser's: a ceremony at
 * 13:00 means 13:00 at the venue, whoever is typing and wherever they are.
 */
const eventSchema = z.object({
  name: z.string().trim().min(1, "Give the event a name").max(120),
  starts_at: z.string().trim().optional(),
  venue: z.string().trim().max(200).optional(),
  address: z.string().trim().max(500).optional(),
  is_public: z.union([z.boolean(), z.literal("on"), z.literal("")]).optional(),
  // Spec 21 §5.4. Guest-facing, so it is stitched into the pages of the
  // households invited to this event — and into nobody else's.
  guest_note: z.string().trim().max(2000).optional(),
  sort_order: z.coerce.number().int().min(0).max(999).optional(),
});

export async function saveEvent(
  eventId: string | null,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = eventSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const patch = {
    name: parsed.data.name,
    starts_at: parsed.data.starts_at
      ? zonedInputToUtc(parsed.data.starts_at, wedding.timezone)
      : null,
    venue: parsed.data.venue || null,
    address: parsed.data.address || null,
    is_public: parsed.data.is_public === true || parsed.data.is_public === "on",
    guest_note: parsed.data.guest_note || null,
    sort_order: parsed.data.sort_order ?? 0,
  };

  if (eventId) {
    const { error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", eventId)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
    revalidatePath("/events");
    return ok({ id: eventId });
  }

  const { data, error } = await supabase
    .from("events")
    .insert({ ...patch, wedding_id: wedding.id })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidatePath("/events");
  revalidatePath("/invitations");
  return ok({ id: data.id });
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // Cascades to invitation_events and rsvps by foreign key. That is the right
  // behaviour — an event that is not happening has no answers — but it is
  // destructive, so the UI asks first.
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePath("/events");
  revalidatePath("/invitations");
  return ok(undefined);
}
