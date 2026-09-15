import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BudgetItemTaskView } from "@/lib/types/database";

/**
 * Manual budget-line <-> task/list linking (spec 6, section 7). Reads
 * `v_budget_item_tasks` (deduplicated: a task counts once whether it's
 * linked directly or via its list) plus `budget_item_lists` for the list
 * side of the popup, which needs open/done counts the task view doesn't
 * carry on its own.
 */

export type LinkedList = { id: string; title: string; color: string | null; openCount: number; doneCount: number };
export type LinkedTask = Omit<BudgetItemTaskView, "budget_item_id" | "linked_via_list">;

export const getBudgetItemLinks = cache(
  async (weddingId: string, budgetItemId: string): Promise<{ lists: LinkedList[]; tasks: LinkedTask[] }> => {
    const supabase = await createClient();

    const [{ data: linkedListRows, error: listsError }, { data: taskRows, error: tasksError }] = await Promise.all([
      supabase
        .from("budget_item_lists")
        .select("list_id, lists(id, title, color)")
        .eq("wedding_id", weddingId)
        .eq("budget_item_id", budgetItemId),
      supabase
        .from("v_budget_item_tasks")
        .select("*")
        .eq("budget_item_id", budgetItemId)
        .eq("linked_via_list", false),
    ]);
    if (listsError) throw new Error(`Could not load linked lists: ${listsError.message}`);
    if (tasksError) throw new Error(`Could not load linked tasks: ${tasksError.message}`);

    const listIds = (linkedListRows ?? []).map((r) => r.list_id);
    let counts = new Map<string, { open: number; done: number }>();
    if (listIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("list_items")
        .select("list_id, status")
        .eq("wedding_id", weddingId)
        .in("list_id", listIds);
      if (itemsError) throw new Error(`Could not load list item counts: ${itemsError.message}`);
      counts = new Map();
      for (const item of items ?? []) {
        const bucket = counts.get(item.list_id) ?? { open: 0, done: 0 };
        if (item.status === "done") bucket.done++;
        else bucket.open++;
        counts.set(item.list_id, bucket);
      }
    }

    const lists: LinkedList[] = (linkedListRows ?? [])
      .map((row) => {
        const list = row.lists as { id: string; title: string; color: string | null } | null;
        if (!list) return null;
        const bucket = counts.get(row.list_id) ?? { open: 0, done: 0 };
        return { id: list.id, title: list.title, color: list.color, openCount: bucket.open, doneCount: bucket.done };
      })
      .filter((l): l is LinkedList => l !== null);

    const tasks: LinkedTask[] = (taskRows ?? []).map(({ budget_item_id: _b, linked_via_list: _l, ...rest }) => rest);

    return { lists, tasks };
  },
);

/** Budget item id/label pairs linked to one list_item, directly or via its list — for the reverse badge on /lists/[id] and /timeline. */
export const getBudgetLinksForListItem = cache(
  async (weddingId: string, listItemId: string): Promise<{ id: string; label: string }[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_budget_item_tasks")
      .select("budget_item_id")
      .eq("list_item_id", listItemId);
    if (error) throw new Error(`Could not load budget links: ${error.message}`);

    const ids = [...new Set((data ?? []).map((r) => r.budget_item_id))];
    if (ids.length === 0) return [];

    const { data: items, error: itemsError } = await supabase
      .from("budget_items")
      .select("id, label, vendor_name")
      .eq("wedding_id", weddingId)
      .in("id", ids);
    if (itemsError) throw new Error(`Could not load budget items: ${itemsError.message}`);
    return (items ?? []).map((i) => ({ id: i.id, label: i.vendor_name || i.label }));
  },
);

/** Budget item id/label pairs linked to a whole list. */
export const getBudgetLinksForList = cache(
  async (weddingId: string, listId: string): Promise<{ id: string; label: string }[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_item_lists")
      .select("budget_items(id, label, vendor_name)")
      .eq("wedding_id", weddingId)
      .eq("list_id", listId);
    if (error) throw new Error(`Could not load budget links: ${error.message}`);
    return (data ?? [])
      .map((row) => row.budget_items as { id: string; label: string; vendor_name: string | null } | null)
      .filter((i): i is { id: string; label: string; vendor_name: string | null } => i !== null)
      .map((i) => ({ id: i.id, label: i.vendor_name || i.label }));
  },
);

/** Every budget item id linked (directly or via its list) to any item in a set of list ids — one query for a whole /lists or /timeline render. */
export const getBudgetLinksForListItems = cache(
  async (weddingId: string, listItemIds: string[]): Promise<Map<string, { id: string; label: string }[]>> => {
    const result = new Map<string, { id: string; label: string }[]>();
    if (listItemIds.length === 0) return result;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_budget_item_tasks")
      .select("list_item_id, budget_item_id")
      .in("list_item_id", listItemIds);
    if (error) throw new Error(`Could not load budget links: ${error.message}`);

    const budgetItemIds = [...new Set((data ?? []).map((r) => r.budget_item_id))];
    if (budgetItemIds.length === 0) return result;

    const { data: items, error: itemsError } = await supabase
      .from("budget_items")
      .select("id, label, vendor_name")
      .eq("wedding_id", weddingId)
      .in("id", budgetItemIds);
    if (itemsError) throw new Error(`Could not load budget items: ${itemsError.message}`);
    const labelById = new Map((items ?? []).map((i) => [i.id, i.vendor_name || i.label]));

    for (const row of data ?? []) {
      const label = labelById.get(row.budget_item_id);
      if (!label) continue;
      const list = result.get(row.list_item_id) ?? [];
      list.push({ id: row.budget_item_id, label });
      result.set(row.list_item_id, list);
    }
    return result;
  },
);
