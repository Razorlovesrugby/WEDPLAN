"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { parseNzAccount } from "@/lib/site/bank-account";
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
 * Spec 28 §6.1 changed what a fund is: a name and a line, with the couple's
 * bank details written once for the wedding (`saveGiftBankDetails`). The
 * target and "raised so far" fields are gone from the form, but **the columns
 * stay and this action never writes them** — an update that sent `null` and
 * `0` for fields it no longer shows would wipe figures the couple typed.
 */

function revalidateGifts(): void {
  revalidatePath("/site/gifts");
  revalidatePath("/site");
  revalidatePath("/site/preview");
  revalidatePath("/w", "layout");
}

const fundSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "A fund needs a name").max(120),
  blurb: z.string().trim().max(400).optional().transform((v) => (v ? v : null)),
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

  const { id, name, blurb, contribute_url, sort_order } = parsed.data;
  const supabase = await createClient();

  // No `target_minor` / `raised_minor`: see the header. A new row gets the
  // column defaults (no target, nothing raised); an existing one keeps what it
  // has.
  const row = {
    wedding_id: wedding.id,
    name,
    blurb,
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

// ---------------------------------------------------------------------------
// Where a guest sends a gift (0033)
// ---------------------------------------------------------------------------

const bankSchema = z.object({
  account_name: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  // Checked with the same function the editor uses for its live message, so
  // what the form says is wrong and what this refuses cannot differ.
  account_number: z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      if (!value || value.trim() === "") return;
      const parsed = parseNzAccount(value);
      if (!parsed.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error });
    })
    .transform((value) => {
      if (!value || value.trim() === "") return null;
      const parsed = parseNzAccount(value);
      return parsed.ok ? parsed.digits : null;
    }),
  message: z.string().trim().max(300).optional().transform((v) => (v ? v : null)),
  note: z.string().trim().max(400).optional().transform((v) => (v ? v : null)),
});

/**
 * Save the wedding's bank details — one row, written whole.
 *
 * Planner writes only, like everything here. The account number is stored as
 * digits (the table's check insists) and grouped at render time. Saving all
 * four fields empty removes nothing and stores nothing: the row simply holds
 * nulls, which the guest page reads as "no details" and so shows no Contribute
 * button.
 */
export async function saveGiftBankDetails(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = bankSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.from("gift_bank_details").upsert(
    {
      wedding_id: wedding.id,
      account_name: parsed.data.account_name,
      account_number: parsed.data.account_number,
      message: parsed.data.message,
      note: parsed.data.note,
    },
    { onConflict: "wedding_id" },
  );

  if (error) return fail(`Could not save the bank details: ${error.message}`);
  revalidateGifts();
  return ok(undefined);
}
