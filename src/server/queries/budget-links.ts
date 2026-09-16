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

export type BudgetItemLinks = { lists: LinkedList[]; tasks: LinkedTask[] };

const NO_LINKS: BudgetItemLinks = { lists: [], tasks: [] };

/**
 * Every budget line's links, for a whole `/budget` render, in three queries.
 *
 * The per-item version this replaced cost three round trips *per budget
 * line* — and one of those three reads `v_budget_item_tasks`, which is a
 * `union all` of two sources wrapped in a `group by`, so it cannot use an
 * index on the `linked_via_list` filter and is re-aggregated on every call.
 * Forty budget lines meant a hundred and twenty queries to paint one page.
 * Firing them through `Promise.all` did not save it: they still queue behind
 * the same PostgREST connection, so the page waited for all of them.
 *
 * Scoped by the wedding's own budget item ids rather than a `wedding_id`
 * filter because `v_budget_item_tasks` does not project that column. The
 * view is `security_invoker`, so RLS is still what decides visibility — the
 * id list is a scoping convenience, not the tenancy boundary.
 */
export const getBudgetItemLinksForItems = cache(
  async (weddingId: string, budgetItemIds: string[]): Promise<Map<string, BudgetItemLinks>> => {
    const result = new Map<string, BudgetItemLinks>();
    if (budgetItemIds.length === 0) return result;

    const supabase = await createClient();

    const [{ data: linkedListRows, error: listsError }, { data: taskRows, error: tasksError }] = await Promise.all([
      supabase
        .from("budget_item_lists")
        .select("budget_item_id, list_id, lists(id, title, color)")
        .eq("wedding_id", weddingId)
        .in("budget_item_id", budgetItemIds),
      supabase
        .from("v_budget_item_tasks")
        .select("*")
        .in("budget_item_id", budgetItemIds)
        .eq("linked_via_list", false),
    ]);
    if (listsError) throw new Error(`Could not load linked lists: ${listsError.message}`);
    if (tasksError) throw new Error(`Could not load linked tasks: ${tasksError.message}`);

    // One counts query for every linked list across the whole page, not one
    // per budget line that happens to have a list attached.
    const listIds = [...new Set((linkedListRows ?? []).map((r) => r.list_id))];
    const counts = new Map<string, { open: number; done: number }>();
    if (listIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("list_items")
        .select("list_id, status")
        .eq("wedding_id", weddingId)
        .in("list_id", listIds);
      if (itemsError) throw new Error(`Could not load list item counts: ${itemsError.message}`);
      for (const item of items ?? []) {
        const bucket = counts.get(item.list_id) ?? { open: 0, done: 0 };
        if (item.status === "done") bucket.done++;
        else bucket.open++;
        counts.set(item.list_id, bucket);
      }
    }

    const bucketFor = (budgetItemId: string): BudgetItemLinks => {
      const existing = result.get(budgetItemId);
      if (existing) return existing;
      const fresh: BudgetItemLinks = { lists: [], tasks: [] };
      result.set(budgetItemId, fresh);
      return fresh;
    };

    for (const row of linkedListRows ?? []) {
      const list = row.lists as { id: string; title: string; color: string | null } | null;
      if (!list) continue;
      const bucket = counts.get(row.list_id) ?? { open: 0, done: 0 };
      bucketFor(row.budget_item_id).lists.push({
        id: list.id,
        title: list.title,
        color: list.color,
        openCount: bucket.open,
        doneCount: bucket.done,
      });
    }

    for (const { budget_item_id, linked_via_list: _l, ...rest } of taskRows ?? []) {
      bucketFor(budget_item_id).tasks.push(rest);
    }

    return result;
  },
);

/** The empty result to render a budget line with, when it has no links at all. */
export function noBudgetItemLinks(): BudgetItemLinks {
  return NO_LINKS;
}

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

export type BudgetLinksByListItem = Map<string, { id: string; label: string }[]>;

/**
 * Shared body of the two lookups below: resolve `v_budget_item_tasks` rows
 * to `{ id, label }` badges, keyed by `list_item_id`. `scopeColumn` is
 * whichever of the view's two id columns the caller is filtering on.
 */
async function budgetLinksFrom(
  weddingId: string,
  scopeColumn: "list_item_id" | "list_id",
  scopeIds: string[],
): Promise<BudgetLinksByListItem> {
  const result: BudgetLinksByListItem = new Map();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("v_budget_item_tasks")
    .select("list_item_id, budget_item_id")
    .in(scopeColumn, scopeIds);
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
}

/** Every budget item id linked (directly or via its list) to any item in a set of list ids. */
export const getBudgetLinksForListItems = cache(
  async (weddingId: string, listItemIds: string[]): Promise<BudgetLinksByListItem> => {
    if (listItemIds.length === 0) return new Map();
    return budgetLinksFrom(weddingId, "list_item_id", listItemIds);
  },
);

/**
 * The same badges, scoped by the *lists* the items belong to rather than by
 * the item ids themselves.
 *
 * This exists so the callers stop waterfalling. Keyed by item id, this
 * lookup could not start until its page had already fetched the items —
 * `/timeline` and `/lists/[id]` each paid a full serial round trip for the
 * items, then another for the links, then another for the labels. The view
 * carries `list_id`, and every list item belongs to exactly one list, so
 * scoping by list is the same set of rows and can be fetched *concurrently*
 * with the items instead of after them.
 */
export const getBudgetLinksForLists = cache(
  async (weddingId: string, listIds: string[]): Promise<BudgetLinksByListItem> => {
    if (listIds.length === 0) return new Map();
    return budgetLinksFrom(weddingId, "list_id", listIds);
  },
);
