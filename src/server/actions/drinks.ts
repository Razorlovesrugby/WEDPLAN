"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { sharesSumToOne } from "@/lib/drinks";
import { fail, ok, type ActionResult } from "./result";

/**
 * Drink plan writes (`docs/planning-spreadsheet-gaps.md` §5, Pattern C).
 *
 * **Nothing here touches money, and nothing here stores a serving count.**
 * A plan carries only the inputs a human chooses; the headcount is resolved
 * by `v_drink_plans` on read and the bottle counts by `src/lib/drinks.ts` on
 * render. `budget_item_id` is a link for navigation — this file never writes
 * to `budget_items`, `consumption_components` or `payments`, because the
 * budget is where a drink's cost lives and two writers to one number is how
 * the number goes wrong.
 *
 * The share-sum rules are checked here AND in the database. The database
 * CHECK is the guarantee; this is so the planner gets "your beer, wine and
 * spirits shares add up to 110%, not 100%" instead of a constraint violation.
 */

const share = z.coerce.number().min(0, "A share cannot be negative").max(1, "A share cannot be more than 100%");

const baseSchema = z.object({
  label: z.string().trim().min(1, "Give the plan a name").max(200),
  event_id: z.string().uuid().nullable().optional(),
  hours: z.coerce.number().min(0, "Hours cannot be negative").max(24, "A bar cannot run more than 24 hours"),
  intensity: z.coerce
    .number()
    .gt(0, "Intensity has to be more than zero")
    .max(3, "That intensity is not a wedding"),
  // NOT z.coerce.boolean(): Boolean("false") is true, and an unchecked
  // checkbox posts "" while a checked one posts "on". Same union the run
  // sheet and the question builder already use.
  champagne_toast: z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .transform((v) => v === true || v === "on"),
  beer_share: share,
  wine_share: share,
  spirit_share: share,
  red_share: share,
  white_share: share,
  rose_share: share,
  headcount_source: z.enum(["confirmed", "invited", "manual"]),
  manual_headcount: z.coerce.number().int().min(0).nullable().optional(),
  budget_item_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/**
 * The two cross-field rules, applied to whichever fields a call actually
 * carries. An update is a partial, so a call that touches only `notes` must
 * not be rejected for "not supplying" shares it was never going to change —
 * hence the `undefined` guards rather than a blanket refine on the object.
 */
function crossFieldErrors(v: Partial<z.infer<typeof baseSchema>>): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};

  const alcohol = [v.beer_share, v.wine_share, v.spirit_share];
  if (alcohol.every((s) => s !== undefined) && !sharesSumToOne(...(alcohol as number[]))) {
    errors.beer_share = ["Beer, wine and spirits have to add up to 100%"];
  }

  const wine = [v.red_share, v.white_share, v.rose_share];
  if (wine.every((s) => s !== undefined) && !sharesSumToOne(...(wine as number[]))) {
    errors.red_share = ["Red, white and rosé have to add up to 100%"];
  }

  // Mirrors the database's `drink_plans_manual_headcount_present`: a number
  // left over from a previous source is a number that will be believed later.
  if (v.headcount_source !== undefined) {
    if (v.headcount_source === "manual" && (v.manual_headcount === null || v.manual_headcount === undefined)) {
      errors.manual_headcount = ["Type the headcount you want to plan for"];
    }
    if (v.headcount_source !== "manual" && v.manual_headcount !== null && v.manual_headcount !== undefined) {
      errors.manual_headcount = ["Clear this to take the headcount from the guest list"];
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

function revalidateDrinks() {
  revalidatePath("/budget/drinks");
  // The plan's page links to its budget line, and /budget links back.
  revalidatePath("/budget");
}

export async function createDrinkPlan(fields: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = baseSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const crossErrors = crossFieldErrors(parsed.data);
  if (crossErrors) return fail("Some fields need fixing", crossErrors);

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("drink_plans")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("drink_plans")
    .insert({ ...parsed.data, wedding_id: wedding.id, sort_order: (last?.sort_order ?? 0) + 10 })
    .select("id")
    .single();

  if (error) return fail(error.message);
  revalidateDrinks();
  return ok({ id: data.id });
}

export async function updateDrinkPlan(id: string, fields: unknown): Promise<ActionResult> {
  const parsed = baseSchema.partial().safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const crossErrors = crossFieldErrors(parsed.data);
  if (crossErrors) return fail("Some fields need fixing", crossErrors);

  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("drink_plans")
    .update(parsed.data)
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateDrinks();
  return ok(undefined);
}

/**
 * A plan holds no history and nothing references it, so unlike a vendor or a
 * guest this is a real delete rather than an archive. The no-destructive-writes
 * rule in the platform spec is about guest data; a shopping list the planner
 * has finished with is not that.
 */
export async function deleteDrinkPlan(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("drink_plans")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidateDrinks();
  return ok(undefined);
}
