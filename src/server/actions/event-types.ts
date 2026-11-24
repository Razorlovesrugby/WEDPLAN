"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { getEventTypes } from "@/server/queries/event-types";
import {
  EVENT_TYPE_NAME_MAX,
  OTHER_DEFAULTS,
  normaliseFeatures,
  normaliseTypeName,
  typeNameAvailable,
} from "@/lib/events/types";
import { fail, ok, type ActionResult } from "./result";

/** Spec 51 §4.3. Types are hidden, never deleted, so no event is left without one. */

const nameSchema = z
  .string()
  .transform(normaliseTypeName)
  .pipe(z.string().min(1, "Give the type a name").max(EVENT_TYPE_NAME_MAX, `At most ${EVENT_TYPE_NAME_MAX} characters`));

const featuresSchema = z.object({
  asks_rsvp: z.boolean(),
  has_seating: z.boolean(),
  guest_facing: z.boolean(),
  is_main: z.boolean(),
});

function refresh() {
  revalidatePath("/events");
  revalidatePath("/invitations");
}

export async function createEventType(
  name: string,
  features?: Record<string, unknown>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return fail(parsedName.error.issues[0]?.message ?? "Check the name");
  const parsedFeatures = featuresSchema.safeParse(features ?? OTHER_DEFAULTS);
  if (!parsedFeatures.success) return fail("Check the defaults");

  const types = await getEventTypes(wedding.id);
  if (!typeNameAvailable(parsedName.data, types)) return fail("You already have a type with that name");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_types")
    .insert({
      wedding_id: wedding.id,
      name: parsedName.data,
      ...normaliseFeatures(parsedFeatures.data),
      sort_order: Math.max(0, ...types.map((t) => t.sort_order)) + 1,
    })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? "You already have a type with that name" : error.message);
  refresh();
  return ok({ id: data.id });
}

export async function renameEventType(typeId: string, name: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the name");
  const types = await getEventTypes(wedding.id);
  if (!typeNameAvailable(parsed.data, types, typeId)) return fail("You already have a type with that name");

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_types")
    .update({ name: parsed.data })
    .eq("id", typeId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.code === "23505" ? "You already have a type with that name" : error.message);
  refresh();
  return ok(undefined);
}

/** Changes the defaults a type presets onto events made afterwards. Existing events are untouched. */
export async function setEventTypeDefaults(
  typeId: string,
  features: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = featuresSchema.safeParse(features);
  if (!parsed.success) return fail("Check the defaults");

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_types")
    .update(normaliseFeatures(parsed.data))
    .eq("id", typeId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  refresh();
  return ok(undefined);
}

export async function duplicateEventType(typeId: string, name: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const types = await getEventTypes(wedding.id);
  const source = types.find((t) => t.id === typeId);
  if (!source) return fail("That type no longer exists");
  return createEventType(name, {
    asks_rsvp: source.asks_rsvp,
    has_seating: source.has_seating,
    guest_facing: source.guest_facing,
    is_main: source.is_main,
  });
}

export async function setEventTypeHidden(typeId: string, hidden: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const types = await getEventTypes(wedding.id);
  const type = types.find((t) => t.id === typeId);
  if (!type) return fail("That type no longer exists");
  if (hidden && type.builtin_key === "other") return fail("Other is the fallback type and can't be hidden");

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_types")
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("id", typeId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  refresh();
  return ok(undefined);
}

/** Swap a type with its neighbour. Positions are rewritten 1..n so ties heal. */
export async function moveEventType(typeId: string, direction: "up" | "down"): Promise<ActionResult> {
  const wedding = await requireWedding();
  const types = await getEventTypes(wedding.id);
  const index = types.findIndex((t) => t.id === typeId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= types.length) return ok(undefined);

  const order = types.map((t) => t.id);
  [order[index], order[target]] = [order[target]!, order[index]!];

  const supabase = await createClient();
  for (const [i, id] of order.entries()) {
    const { error } = await supabase
      .from("event_types")
      .update({ sort_order: i + 1 })
      .eq("id", id)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }
  refresh();
  return ok(undefined);
}
