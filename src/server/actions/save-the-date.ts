"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import {
  DEFAULT_SAVE_THE_DATE,
  SAVE_THE_DATE_BLOCK_KEY,
  SAVE_THE_DATE_LAYOUTS,
  SAVE_THE_DATE_PHOTO_LIMIT,
  SAVE_THE_DATE_TEXT_LIMITS as L,
  saveTheDatePayload,
} from "@/lib/site/save-the-date";
import { PALETTE_IDS } from "@/lib/theme/presets";
import { fail, ok, type ActionResult } from "./result";

/**
 * Saving the save-the-date's design (`/invitations/save-the-date`).
 *
 * One `site_content` row, like the theme. It is live the moment it saves —
 * there is no draft and publish here, because the page has no content a guest
 * could catch half-written: every blank falls back to the wedding's own name
 * and date.
 */

/** Blank means "use the default", which is stored as null. */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const schema = z.object({
  eyebrow: optional(L.eyebrow),
  headline: optional(L.headline),
  dateLabel: optional(L.dateLabel),
  location: optional(L.location),
  message: optional(L.message),
  photoIds: z
    .array(z.string().uuid())
    .max(SAVE_THE_DATE_PHOTO_LIMIT, `Up to ${SAVE_THE_DATE_PHOTO_LIMIT} photos`)
    .nullable(),
  layout: z.enum(SAVE_THE_DATE_LAYOUTS),
  palette: z.enum(["site", ...PALETTE_IDS]),
  showGreeting: z.boolean(),
  showCountdown: z.boolean(),
  showCalendar: z.boolean(),
});

export async function saveSaveTheDate(fields: unknown): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const supabase = await createClient();

  // Every chosen photo must be this wedding's and visible. RLS already hides
  // another wedding's rows, so a foreign id simply fails to come back; this
  // turns that into an error rather than a photo that silently never shows.
  const photoIds = data.photoIds ? [...new Set(data.photoIds)] : null;
  if (photoIds && photoIds.length > 0) {
    const { data: found, error } = await supabase
      .from("site_assets")
      .select("id")
      .eq("wedding_id", wedding.id)
      .not("approved_at", "is", null)
      .in("id", photoIds);
    if (error) return fail(`Could not check the photos: ${error.message}`);
    if ((found ?? []).length !== photoIds.length) {
      return fail("One of those photos has been removed — pick again and save.");
    }
  }

  const payload = saveTheDatePayload({
    eyebrow: data.eyebrow ?? DEFAULT_SAVE_THE_DATE.eyebrow,
    headline: data.headline,
    dateLabel: data.dateLabel,
    location: data.location,
    message: data.message ?? DEFAULT_SAVE_THE_DATE.message,
    photoIds,
    layout: data.layout,
    palette: data.palette,
    showGreeting: data.showGreeting,
    showCountdown: data.showCountdown,
    showCalendar: data.showCalendar,
  });

  const { error } = await supabase.from("site_content").upsert(
    {
      wedding_id: wedding.id,
      block_key: SAVE_THE_DATE_BLOCK_KEY,
      payload: payload as never,
      sort_order: -1, // Config, not a section.
    },
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not save the save-the-date: ${error.message}`);

  revalidatePath("/invitations/save-the-date");
  revalidatePath("/w/[slug]/[household]/save-the-date", "page");
  return ok(undefined);
}
