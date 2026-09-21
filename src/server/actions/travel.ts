"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWedding } from "@/server/queries/wedding";
import { resolveInvitation } from "@/server/rsvp/resolve";
import { canReserve } from "@/lib/travel/coach";
import { zonedInputToUtc } from "@/lib/timezone";
import { fail, ok, type ActionResult } from "./result";

/**
 * Getting there (spec 14 §7).
 *
 * The planner's writes go through `createClient()` and are scoped by RLS. The
 * one public write — a household reserving coach seats — resolves its own
 * invitation token first and then uses the service role, exactly as the RSVP
 * writes already do: the token is the credential, and the row it resolves to
 * is the only row the action will touch.
 */

const optionalText = z.string().trim().max(2000).optional().transform((v) => (v ? v : null));

// ---------------------------------------------------------------------------
// Transport options, and places to stay
// ---------------------------------------------------------------------------

/**
 * An optional whole number from a form.
 *
 * An empty field is null, never 0. Spec 19 learned this the expensive way in
 * the budget: a stored 0 that means "unset" outranks every real figure beneath
 * it. Here a 0 has to keep meaning zero — a free shuttle is a real price — so
 * the emptiness is resolved at the boundary rather than in the renderer.
 */
const optionalWholeNumber = z
  .union([z.coerce.number().int().min(0).max(100_000_000), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const transportSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(["parking", "taxi", "train", "walk", "other"]),
    name: z.string().trim().min(1, "Give it a name").max(200),
    detail: optionalText,
    url: optionalText,
    // Spec 25 §5. All optional: 0017 refused these columns because a wedding
    // people drive to would show empty ones, and that stays true.
    arrival_point_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
    duration_minutes: optionalWholeNumber,
    /** Integer minor units, NZD (spec 18). The form collects dollars. */
    cost_low: optionalWholeNumber,
    cost_high: optionalWholeNumber,
  })
  .refine(
    (v) => v.cost_low === null || v.cost_high === null || v.cost_high >= v.cost_low,
    { message: "The top of the range is below the bottom", path: ["cost_high"] },
  );

export async function saveTransportOption(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = transportSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("transport_options").update(values).eq("id", id).eq("wedding_id", wedding.id)
    : await supabase.from("transport_options").insert({ ...values, wedding_id: wedding.id });

  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

export async function deleteTransportOption(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("transport_options")
    .delete()
    .eq("id", id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

const staySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Give it a name").max(200),
  address: optionalText,
  url: optionalText,
  distance_label: optionalText,
  notes: optionalText,
});

export async function saveAccommodation(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = staySchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("accommodations").update(values).eq("id", id).eq("wedding_id", wedding.id)
    : await supabase.from("accommodations").insert({ ...values, wedding_id: wedding.id });

  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

export async function deleteAccommodation(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("accommodations")
    .delete()
    .eq("id", id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Coach runs and stops
// ---------------------------------------------------------------------------

const runSchema = z.object({
  id: z.string().uuid().optional(),
  direction: z.enum(["to_venue", "from_venue"]),
  label: z.string().trim().min(1, "Give the run a name").max(200),
  /** A local datetime from the form, converted using the wedding's timezone. */
  departs_at: z.string().trim().optional(),
  capacity: z
    .union([z.coerce.number().int().min(1).max(200), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  notes: optionalText,
  /**
   * The event this run serves (spec 25 §6). Null means the whole weekend,
   * which is what every run meant before this column existed — so a run left
   * unset keeps rendering in the coach block and nowhere else.
   */
  event_id: z.string().uuid().nullable().optional().transform((v) => v ?? null),
});

export async function saveCoachRun(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = runSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const { id, departs_at, ...values } = parsed.data;

  const departsAt = departs_at ? zonedInputToUtc(departs_at, wedding.timezone) : null;
  if (departs_at && departsAt === null) {
    return fail("That departure time isn't valid", { departs_at: ["Not a valid time"] });
  }

  const supabase = await createClient();
  const row = { ...values, departs_at: departsAt };
  const { error } = id
    ? await supabase.from("coach_runs").update(row).eq("id", id).eq("wedding_id", wedding.id)
    : await supabase.from("coach_runs").insert({ ...row, wedding_id: wedding.id });

  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

export async function deleteCoachRun(
  id: string,
): Promise<ActionResult<{ seatsRemoved: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  // Deleting a run cascades its stops and its seats, and those seats are
  // people expecting a lift. The count is returned so the screen can say how
  // many rather than leaving it to be discovered on the day.
  const { count } = await supabase
    .from("coach_seats")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", wedding.id)
    .eq("coach_run_id", id);

  const { error } = await supabase.from("coach_runs").delete().eq("id", id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidateTravel();
  return ok({ seatsRemoved: count ?? 0 });
}

const stopSchema = z.object({
  id: z.string().uuid().optional(),
  coach_run_id: z.string().uuid(),
  name: z.string().trim().min(1, "Give the stop a name").max(200),
  address: optionalText,
  map_url: optionalText,
  pickup_at: z.string().trim().optional(),
  sort_order: z.coerce.number().int().min(0).max(999).optional(),
});

export async function saveCoachStop(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = stopSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const { id, pickup_at, ...values } = parsed.data;

  const pickupAt = pickup_at ? zonedInputToUtc(pickup_at, wedding.timezone) : null;
  if (pickup_at && pickupAt === null) {
    return fail("That pickup time isn't valid", { pickup_at: ["Not a valid time"] });
  }

  const supabase = await createClient();
  const row = { ...values, pickup_at: pickupAt };
  const { error } = id
    ? await supabase.from("coach_stops").update(row).eq("id", id).eq("wedding_id", wedding.id)
    : await supabase.from("coach_stops").insert({ ...row, wedding_id: wedding.id });

  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

export async function deleteCoachStop(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_stops")
    .delete()
    .eq("id", id)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The one public write: a household reserving seats
// ---------------------------------------------------------------------------

const reserveSchema = z.object({
  token: z.string(),
  coach_run_id: z.string().uuid(),
  coach_stop_id: z.string().uuid(),
  /** Zero means "we're not coming on the coach", which removes the row. */
  seats: z.coerce.number().int().min(0).max(20),
});

export async function reserveCoachSeats(
  fields: Record<string, unknown>,
): Promise<ActionResult<{ seats: number }>> {
  const parsed = reserveSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const { token, coach_run_id, coach_stop_id, seats } = parsed.data;

  // The token is the credential. Everything below is scoped to what it
  // resolved to, and nothing from the client names a household.
  const resolved = await resolveInvitation(token);
  if (!resolved.ok) return fail("That link isn't valid");

  const { wedding, household } = resolved.context;
  const supabase = createAdminClient();

  const [{ data: run }, { data: stop }, { data: existing }] = await Promise.all([
    supabase
      .from("v_coach_runs")
      .select("id, capacity, seats_taken")
      .eq("wedding_id", wedding.id)
      .eq("id", coach_run_id)
      .maybeSingle(),
    supabase
      .from("coach_stops")
      .select("id")
      .eq("wedding_id", wedding.id)
      .eq("coach_run_id", coach_run_id)
      .eq("id", coach_stop_id)
      .maybeSingle(),
    supabase
      .from("coach_seats")
      .select("id, seats")
      .eq("wedding_id", wedding.id)
      .eq("coach_run_id", coach_run_id)
      .eq("household_id", household.id)
      .maybeSingle(),
  ]);

  if (!run) return fail("That coach isn't running any more");
  // Checked rather than trusted: a stop belonging to a different run would put
  // a household at a kerb the coach never visits.
  if (!stop) return fail("That pickup point isn't on this coach");

  if (seats === 0) {
    if (existing) {
      await supabase
        .from("coach_seats")
        .delete()
        .eq("id", existing.id)
        .eq("wedding_id", wedding.id);
    }
    revalidatePath(`/rsvp/${token}`);
    return ok({ seats: 0 });
  }

  const check = canReserve({
    seats,
    existingSeats: existing?.seats ?? 0,
    capacity: run.capacity,
    seatsTaken: run.seats_taken,
  });
  if (!check.ok) return fail(check.reason);

  const { error } = existing
    ? await supabase
        .from("coach_seats")
        .update({ seats, coach_stop_id })
        .eq("id", existing.id)
        .eq("wedding_id", wedding.id)
    : await supabase.from("coach_seats").insert({
        wedding_id: wedding.id,
        coach_run_id,
        coach_stop_id,
        household_id: household.id,
        seats,
      });

  if (error) {
    // 23505 on (coach_run_id, household_id) means two tabs raced. The other
    // one won and the answer it wrote is as valid as this one.
    if (error.code === "23505") return ok({ seats });
    return fail(error.message);
  }

  revalidatePath(`/rsvp/${token}`);
  return ok({ seats });
}

function revalidateTravel() {
  revalidatePath("/travel");
  revalidatePath("/w");
  revalidatePath("/w/[slug]", "page");
}

// ---------------------------------------------------------------------------
// Arrival points (spec 25 §5)
// ---------------------------------------------------------------------------

const arrivalSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(8).optional().transform((v) => (v ? v.toUpperCase() : null)),
  name: z.string().trim().min(1, "Give it a name").max(200),
  region: optionalText,
  minutes_to_venue: z
    .union([z.coerce.number().int().min(0).max(10_000), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export async function saveArrivalPoint(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = arrivalSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("arrival_points").update(values).eq("id", id).eq("wedding_id", wedding.id)
    : await supabase.from("arrival_points").insert({ ...values, wedding_id: wedding.id });

  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}

/**
 * Deleting an arrival point does not delete the legs under it.
 *
 * `on delete set null (arrival_point_id)` leaves them loose, and the renderer
 * draws loose legs as a plain list — the same list every wedding had before
 * arrival points existed. Somebody tidying up their airports should not lose
 * three taxi numbers.
 */
export async function deleteArrivalPoint(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("arrival_points")
    .delete()
    .eq("id", id)
    .eq("wedding_id", wedding.id);

  if (error) return fail(error.message);
  revalidateTravel();
  return ok(undefined);
}
