"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { addItem } from "./lists";
import { fail, ok, type ActionResult } from "./result";

/**
 * Manual budget-line <-> task/list linking (spec 6, section 7). A link
 * changes nothing about either row — no cascading effect, purely "these are
 * related" — so every action here is a plain join-table insert/delete.
 */

function revalidateLinks(listId?: string) {
  revalidatePath("/budget");
  revalidatePath("/lists");
  revalidatePath("/timeline");
  if (listId) revalidatePath(`/lists/${listId}`);
}

export async function linkBudgetItemToTask(budgetItemId: string, listItemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_item_tasks")
    .upsert(
      { wedding_id: wedding.id, budget_item_id: budgetItemId, list_item_id: listItemId },
      { onConflict: "budget_item_id,list_item_id" },
    );
  if (error) return fail(error.message);

  revalidateLinks();
  return ok(undefined);
}

export async function unlinkBudgetItemFromTask(budgetItemId: string, listItemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_item_tasks")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("budget_item_id", budgetItemId)
    .eq("list_item_id", listItemId);
  if (error) return fail(error.message);

  revalidateLinks();
  return ok(undefined);
}

export async function linkBudgetItemToList(budgetItemId: string, listId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_item_lists")
    .upsert(
      { wedding_id: wedding.id, budget_item_id: budgetItemId, list_id: listId },
      { onConflict: "budget_item_id,list_id" },
    );
  if (error) return fail(error.message);

  revalidateLinks(listId);
  return ok(undefined);
}

export async function unlinkBudgetItemFromList(budgetItemId: string, listId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_item_lists")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("budget_item_id", budgetItemId)
    .eq("list_id", listId);
  if (error) return fail(error.message);

  revalidateLinks(listId);
  return ok(undefined);
}

/** The one link grain spec 6 §7 scoped out — a section of a list, without pulling in the rest of it (spec 16 §3). */
export async function linkBudgetItemToSection(budgetItemId: string, sectionId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_item_sections")
    .upsert(
      { wedding_id: wedding.id, budget_item_id: budgetItemId, section_id: sectionId },
      { onConflict: "budget_item_id,section_id" },
    );
  if (error) return fail(error.message);

  const listId = await listIdForSection(supabase, wedding.id, sectionId);
  revalidateLinks(listId);
  return ok(undefined);
}

export async function unlinkBudgetItemFromSection(budgetItemId: string, sectionId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("budget_item_sections")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("budget_item_id", budgetItemId)
    .eq("section_id", sectionId);
  if (error) return fail(error.message);

  const listId = await listIdForSection(supabase, wedding.id, sectionId);
  revalidateLinks(listId);
  return ok(undefined);
}

async function listIdForSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  sectionId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from("list_sections")
    .select("list_id")
    .eq("id", sectionId)
    .eq("wedding_id", weddingId)
    .maybeSingle();
  return data?.list_id;
}

/** "+ Create a new task and link it here" — spec 4's HouseholdPicker's "create the destination inline" pattern, applied to a task. */
export async function createLinkedTask(
  budgetItemId: string,
  listId: string,
  title: string,
): Promise<ActionResult<{ id: string }>> {
  const created = await addItem(listId, { title });
  if (!created.ok) return created;

  const linked = await linkBudgetItemToTask(budgetItemId, created.data.id);
  if (!linked.ok) return linked;

  return ok({ id: created.data.id });
}
