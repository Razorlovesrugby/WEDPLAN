"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * The gift list (0030).
 *
 * Planner writes only. **There is no public write path here, and that is the
 * design** — nothing a guest does reaches this table. `contribute_url` sends
 * them to whatever actually takes the money, and `raised_minor` is a figure
 * the couple keeps up to date from the account it lands in.
 *
 * That is worth saying at the top rather than leaving to be discovered,
 * because the obvious next feature — "let guests record what they gave" — is
 * a payment integration wearing a form, and building the form first gets you
 * a number strangers can type into a wedding's own page.
 *
 * Money is integer minor units, NZD (spec 18). The forms take dollars because
 * that is what people type; the conversion happens once, here, at the
 * boundary.
 */

function revalidateGifts(): void {
  revalidatePath("/site/gifts");
  revalidatePath("/site");
  revalidatePath("/site/preview");
  revalidatePath("/w", "layout");
}

/**
 * Dollars in, minor units out.
 *
 * `Math.round` rather than a truncation: "12.10" arrives as 12.099999999999999
 * often enough that truncating it stores $12.09, and a figure that is one cent
 * short of what somebody typed is the kind of bug nobody reports and everybody
 * notices.
 *
 * An empty field is null, never 0 — spec 19's lesson from the budget, where a
 * stored 0 meaning "unset" outranked every real figure beneath it.
 */
const dollarsToMinor = z
  .union([z.coerce.number().min(0).max(10_000_000), z.literal("")])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : Math.round(value * 100)));

const fundSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "A fund needs a name").max(120),
  blurb: z.string().trim().max(400).optional().transform((v) => (v ? v : null)),
  target: dollarsToMinor,
  raised: dollarsToMinor,
  contribute_url: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : null))
    // Refused here as well as by 0030's check constraint. The value ends up
    // in an href in front of every guest, and "the database will catch it" is
    // not a thing to rely on for a rule about what reaches a browser.
    .refine((v) => v === null || /^https?:\/\//i.test(v), {
      message: "Needs to start with http:// or https://",
    }),
  sort_order: z.coerce.number().int().min(0).max(1000).optional(),
});

export async function saveGiftFund(fields: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = fundSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const { id, name, blurb, target, raised, contribute_url, sort_order } = parsed.data;
  const supabase = await createClient();

  const row = {
    wedding_id: wedding.id,
    name,
    blurb,
    target_minor: target,
    // A fund that has never been updated has raised nothing. Null here would
    // violate the column and mean the same thing anyway.
    raised_minor: raised ?? 0,
    contribute_url,
    ...(sort_order === undefined ? {} : { sort_order }),
  };

  const { data, error } = id
    ? await supabase
        .from("gift_funds")
        .update(row)
        .eq("wedding_id", wedding.id)
        .eq("id", id)
        .select("id")
        .single()
    : await supabase.from("gift_funds").insert(row).select("id").single();

  if (error || !data) return fail(error?.message ?? "Could not save that fund");
  revalidateGifts();
  return ok({ id: data.id });
}

/**
 * Delete a fund.
 *
 * A hard delete, unlike guest data. The no-destructive-writes rule exists
 * because a guest cut after invitations went out has to stay reconstructable;
 * a fund carries no history anybody can be held to — `raised_minor` is a
 * number the couple typed, not a ledger — so keeping a tombstone would buy
 * nothing and leave a row the funds screen has to learn to hide.
 */
export async function deleteGiftFund(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("gift_funds")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateGifts();
  return ok(undefined);
}
