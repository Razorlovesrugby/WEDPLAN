"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { addDays } from "@/lib/lists/generate";
import { zonedInputToUtc } from "@/lib/timezone";
import { fail, ok, type ActionResult } from "./result";

/**
 * Settings, spec 03. Everything here is a UI over columns that already
 * existed (weddings.name/wedding_date/timezone/rsvp_lock_at/invite_send_on)
 * plus reminder_window_days (0007_settings.sql) — no new business concept,
 * just the first screen that can write these outside of bootstrap.sql or a
 * drag interaction.
 *
 * Cut lines and capacity are NOT duplicated here: setCutLine() and
 * setCapacity() in src/server/actions/rank.ts already do exactly this,
 * safely (setCutLine reads a household's own rank server-side rather than
 * accepting a raw rank string — see docs/HANDOFF.md section 5, point 3, on
 * why a client-supplied rank string is unsafe). /settings imports and
 * reuses them rather than re-implementing the same validation twice.
 */

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Give the wedding a name").max(120),
  wedding_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  timezone: z
    .string()
    .trim()
    .min(1, "Pick a timezone")
    .max(64)
    .refine(isValidTimeZone, "That doesn't look like a real timezone"),
  rsvp_lock_at: z.string().trim().optional(),
  invite_send_on: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  reminder_window_days: z.coerce.number().int().min(1).max(90),
});

export async function updateWeddingSettings(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = settingsSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const rsvpLockAt = parsed.data.rsvp_lock_at
    ? zonedInputToUtc(parsed.data.rsvp_lock_at, parsed.data.timezone)
    : null;
  if (parsed.data.rsvp_lock_at && rsvpLockAt === null) {
    return fail("RSVP lock date isn't valid", { rsvp_lock_at: ["RSVP lock date isn't valid"] });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("weddings")
    .update({
      name: parsed.data.name,
      wedding_date: parsed.data.wedding_date,
      timezone: parsed.data.timezone,
      rsvp_lock_at: rsvpLockAt,
      invite_send_on: parsed.data.invite_send_on,
      reminder_window_days: parsed.data.reminder_window_days,
    })
    .eq("id", wedding.id);

  if (error) return fail(error.message);

  // Spec 15 §5: a calculated due date ("2 weeks before the wedding") stays
  // correct when the wedding date moves — this is the one write path to
  // wedding_date, so recomputing here (rather than a database trigger) keeps
  // every list_items.due_date with a non-null due_date_offset_days in sync.
  if (parsed.data.wedding_date !== wedding.wedding_date) {
    const { data: relativeItems, error: relativeError } = await supabase
      .from("list_items")
      .select("id, due_date_offset_days")
      .eq("wedding_id", wedding.id)
      .not("due_date_offset_days", "is", null);
    if (relativeError) return fail(relativeError.message);

    const newWeddingDate = parsed.data.wedding_date;
    await Promise.all(
      (relativeItems ?? []).map((item) =>
        supabase
          .from("list_items")
          .update({
            due_date: newWeddingDate ? addDays(newWeddingDate, item.due_date_offset_days!) : null,
          })
          .eq("id", item.id)
          .eq("wedding_id", wedding.id),
      ),
    );
  }

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/timeline");
  revalidatePath("/calendar");
  revalidatePath("/lists");
  revalidatePath("/board");
  revalidatePath("/rsvp", "layout");
  return ok(undefined);
}

/**
 * A typed name for the assign picker (spec 15 §2) — either collaborator can
 * edit either name, the same shared-edit shape this app already uses for
 * list titles, section names, and the lists sidebar's own order.
 */
export async function updateCollaboratorName(
  collaboratorId: string,
  displayName: string,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = z.string().trim().max(80).safeParse(displayName);
  if (!parsed.success) return fail("That name's too long");

  const supabase = await createClient();
  const { error } = await supabase
    .from("collaborators")
    .update({ display_name: parsed.data || null })
    .eq("id", collaboratorId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePath("/settings");
  revalidatePath("/lists");
  revalidatePath("/lists", "layout");
  revalidatePath("/calendar");
  revalidatePath("/timeline");
  revalidatePath("/board");
  return ok(undefined);
}
