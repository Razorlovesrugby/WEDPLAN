"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
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

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/timeline");
  revalidatePath("/calendar");
  revalidatePath("/rsvp", "layout");
  return ok(undefined);
}
