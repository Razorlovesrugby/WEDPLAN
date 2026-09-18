import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BudgetItemTaskView } from "@/lib/types/database";

/**
 * Manual budget-line <-> task/list/section linking (spec 6, section 7; the
 * section grain is spec 16, section 3). Reads `v_budget_item_tasks`
 * (deduplicated to a task's single most specific source — direct, via its
 * list, or via its section) plus `budget_item_lists`/`budget_item_sections`
 * for the list/section sides of the popup, which need open/done counts the
 * task view doesn't carry on its own.
 */

export type LinkedList = { id: string; title: string; color: string | null; openCount: number; doneCount: number };
export type LinkedSection = {
  id: string;
  title: string;
  listId: string;
  listTitle: string;
  openCount: number;
  doneCount: number;
};
export type LinkedTask = Omit<BudgetItemTaskView, "budget_item_id" | "link_source">;

export type BudgetItemLinks = { lists: LinkedList[]; sections: LinkedSection[]; tasks: LinkedTask[] };

const NO_LINKS: BudgetItemLinks = { lists: [], sections: [], tasks: [] };

/**
 * Every budget line's links, for a whole `/budget` render, in four queries.
 *
 * The per-item version this replaced cost three round trips *per budget
 * line* — and one of those three reads `v_budget_item_tasks`, which is a
 * `union all` of three sources wrapped in a `group by`, so it cannot use an
 * index on the `link_source` filter and is re-aggregated on every call.
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

    const [
      { data: linkedListRows, error: listsError },
      { data: linkedSectionRows, error: sectionsError },
      { data: taskRows, error: tasksError },
    ] = await Promise.all([
      supabase
        .from("budget_item_lists")
        .select("budget_item_id, list_id, lists(id, title, color)")
        .eq("wedding_id", weddingId)
        .in("budget_item_id", budgetItemIds),
      supabase
        .from("budget_item_sections")
        .select("budget_item_id, section_id, list_sections(id, title, list_id, lists(title))")
        .eq("wedding_id", weddingId)
        .in("budget_item_id", budgetItemIds),
      supabase
        .from("v_budget_item_tasks")
        .select("*")
        .in("budget_item_id", budgetItemIds)
        .eq("link_source", "direct"),
    ]);
    if (listsError) throw new Error(`Could not load linked lists: ${listsError.message}`);
    if (sectionsError) throw new Error(`Could not load linked sections: ${sectionsError.message}`);
    if (tasksError) throw new Error(`Could not load linked tasks: ${tasksError.message}`);

    // One counts query for every linked list/section across the whole page,
    // not one per budget line that happens to have one attached.
    const listIds = [...new Set((linkedListRows ?? []).map((r) => r.list_id))];
    const sectionIds = [...new Set((linkedSectionRows ?? []).map((r) => r.section_id))];
    const listCounts = new Map<string, { open: number; done: number }>();
    const sectionCounts = new Map<string, { open: number; done: number }>();
    if (listIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("list_items")
        .select("list_id, status")
        .eq("wedding_id", weddingId)
        .in("list_id", listIds);
      if (itemsError) throw new Error(`Could not load list item counts: ${itemsError.message}`);
      for (const item of items ?? []) {
        const bucket = listCounts.get(item.list_id) ?? { open: 0, done: 0 };
        if (item.status === "done") bucket.done++;
        else bucket.open++;
        listCounts.set(item.list_id, bucket);
      }
    }
    if (sectionIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("list_items")
        .select("section_id, status")
        .eq("wedding_id", weddingId)
        .in("section_id", sectionIds);
      if (itemsError) throw new Error(`Could not load section item counts: ${itemsError.message}`);
      for (const item of items ?? []) {
        if (!item.section_id) continue;
        const bucket = sectionCounts.get(item.section_id) ?? { open: 0, done: 0 };
        if (item.status === "done") bucket.done++;
        else bucket.open++;
        sectionCounts.set(item.section_id, bucket);
      }
    }

    const bucketFor = (budgetItemId: string): BudgetItemLinks => {
      const existing = result.get(budgetItemId);
      if (existing) return existing;
      const fresh: BudgetItemLinks = { lists: [], sections: [], tasks: [] };
      result.set(budgetItemId, fresh);
      return fresh;
    };

    for (const row of linkedListRows ?? []) {
      const list = row.lists as { id: string; title: string; color: string | null } | null;
      if (!list) continue;
      const bucket = listCounts.get(row.list_id) ?? { open: 0, done: 0 };
      bucketFor(row.budget_item_id).lists.push({
        id: list.id,
        title: list.title,
        color: list.color,
        openCount: bucket.open,
        doneCount: bucket.done,
      });
    }

    for (const row of linkedSectionRows ?? []) {
      const section = row.list_sections as { id: string; title: string; list_id: string; lists: { title: string } | null } | null;
      if (!section) continue;
      const bucket = sectionCounts.get(row.section_id) ?? { open: 0, done: 0 };
      bucketFor(row.budget_item_id).sections.push({
        id: section.id,
        title: section.title,
        listId: section.list_id,
        listTitle: section.lists?.title ?? "",
        openCount: bucket.open,
        doneCount: bucket.done,
      });
    }

    for (const { budget_item_id, link_source: _s, ...rest } of taskRows ?? []) {
      bucketFor(budget_item_id).tasks.push(rest);
    }

    return result;
  },
);

/** The empty result to render a budget line with, when it has no links at all. */
export function noBudgetItemLinks(): BudgetItemLinks {
  return NO_LINKS;
}

/**
 * Budget item id/label pairs linked to one list_item — directly or via its
 * whole list, for the reverse badge on /lists/[id] and /timeline. A link via
 * the item's *section* is deliberately excluded here: a linked section
 * badges its own heading only, not every item inside it (spec 16 §3) —
 * three link sources showing on the same item would make each one
 * indistinguishable from the others.
 */
export const getBudgetLinksForListItem = cache(
  async (weddingId: string, listItemId: string): Promise<{ id: string; label: string }[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_budget_item_tasks")
      .select("budget_item_id")
      .eq("list_item_id", listItemId)
      .neq("link_source", "via_section");
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
 * whichever of the view's two id columns the caller is filtering on. A
 * via-section link never produces an item-level badge here — same reasoning
 * as `getBudgetLinksForListItem` above.
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
    .in(scopeColumn, scopeIds)
    .neq("link_source", "via_section");
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

export type BudgetLinksBySection = Map<string, { id: string; label: string }[]>;

/**
 * Budget item id/label pairs linked to a set of sections directly — the
 * section-heading badge (spec 16 §3), concurrent with a page's other
 * queries the same way `getBudgetLinksForLists` already is.
 */
export const getBudgetLinksForSections = cache(
  async (weddingId: string, sectionIds: string[]): Promise<BudgetLinksBySection> => {
    const result: BudgetLinksBySection = new Map();
    if (sectionIds.length === 0) return result;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("budget_item_sections")
      .select("section_id, budget_items(id, label, vendor_name)")
      .eq("wedding_id", weddingId)
      .in("section_id", sectionIds);
    if (error) throw new Error(`Could not load budget links: ${error.message}`);

    for (const row of data ?? []) {
      const item = row.budget_items as { id: string; label: string; vendor_name: string | null } | null;
      if (!item) continue;
      const list = result.get(row.section_id) ?? [];
      list.push({ id: item.id, label: item.vendor_name || item.label });
      result.set(row.section_id, list);
    }
    return result;
  },
);
