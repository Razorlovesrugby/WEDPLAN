"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { getEventTypes } from "@/server/queries/event-types";
import { zonedInputToUtc } from "@/lib/timezone";
import { normaliseFeatures } from "@/lib/events/types";
import { fail, ok, type ActionResult } from "./result";

/**
 * Event times arrive from a datetime-local input, which has no timezone. They
 * are interpreted in the WEDDING's timezone, not the browser's: a ceremony at
 * 13:00 means 13:00 at the venue, whoever is typing and wherever they are.
 */
const flag = z.union([z.boolean(), z.literal("on"), z.literal("")]).optional();
const isOn = (v: boolean | "on" | "" | undefined) => v === true || v === "on";

const eventSchema = z.object({
  name: z.string().trim().min(1, "Give the event a name").max(120),
  starts_at: z.string().trim().optional(),
  venue: z.string().trim().max(200).optional(),
  address: z.string().trim().max(500).optional(),
  is_public: z.union([z.boolean(), z.literal("on"), z.literal("")]).optional(),
  is_main: z.union([z.boolean(), z.literal("on"), z.literal("")]).optional(),
  // Spec 21 §5.4. Guest-facing, so it is stitched into the pages of the
  // households invited to this event — and into nobody else's.
  guest_note: z.string().trim().max(2000).optional(),
  // Spec 51. The type presets the switches when an event is created; a switch
  // that is not sent at all falls back to the type's default on create and is
  // left alone on update.
  type_id: z.string().uuid("Pick a type"),
  asks_rsvp: flag,
  has_seating: flag,
  guest_facing: flag,
  sort_order: z.coerce.number().int().min(0).max(999).optional(),
});

export async function saveEvent(
  eventId: string | null,
  fields: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = eventSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const types = await getEventTypes(wedding.id);
  const type = types.find((t) => t.id === parsed.data.type_id);
  if (!type) return fail("Pick a type", { type_id: ["Pick a type"] });

  const supabase = await createClient();
  const d = parsed.data;
  // Create: an unsent switch takes the type's default. Update: it keeps the event's own.
  const existing = eventId
    ? (
        await supabase
          .from("events")
          .select("is_public, is_main, asks_rsvp, has_seating, guest_facing")
          .eq("id", eventId)
          .eq("wedding_id", wedding.id)
          .maybeSingle()
      ).data
    : null;
  if (eventId && !existing) return fail("That event no longer exists");
  const pick = (sent: boolean | "on" | "" | undefined, current: boolean | undefined, preset: boolean) =>
    sent === undefined ? (current ?? preset) : isOn(sent);
  const features = normaliseFeatures({
    asks_rsvp: pick(d.asks_rsvp, existing?.asks_rsvp, type.asks_rsvp),
    has_seating: pick(d.has_seating, existing?.has_seating, type.has_seating),
    guest_facing: pick(d.guest_facing, existing?.guest_facing, type.guest_facing),
    is_main: pick(d.is_main, existing?.is_main, type.is_main),
    is_public: pick(d.is_public, existing?.is_public, true),
  });

  const patch = {
    name: parsed.data.name,
    starts_at: parsed.data.starts_at
      ? zonedInputToUtc(parsed.data.starts_at, wedding.timezone)
      : null,
    venue: parsed.data.venue || null,
    address: parsed.data.address || null,
    ...features,
    type_id: type.id,
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
    revalidatePath("/invitations");
    revalidatePath("/seating");
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
