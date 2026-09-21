import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  BudgetItemView,
  VendorCategoryRow,
  VendorContactRow,
  VendorNoteRow,
  VendorView,
} from "@/lib/types/database";

/**
 * Reading vendors (spec 8 §7).
 *
 * Everything here is the planner's, through `createClient()` so RLS scopes
 * it. There is no public vendor surface at all: vendors never log in, never
 * get a token, and nothing in this app sends them anything.
 */

export const listVendors = cache(async (weddingId: string): Promise<VendorView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_vendors")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("name");

  if (error) throw new Error(`Could not load vendors: ${error.message}`);
  return (data ?? []) as VendorView[];
});

export const getVendor = cache(
  async (weddingId: string, id: string): Promise<VendorView | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("v_vendors")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("id", id)
      .maybeSingle();
    return (data as VendorView | null) ?? null;
  },
);

export const listVendorCategories = cache(
  async (weddingId: string): Promise<VendorCategoryRow[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("vendor_categories")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("sort_order")
      .order("name");
    return (data ?? []) as VendorCategoryRow[];
  },
);

export const listVendorContacts = cache(
  async (weddingId: string, vendorId: string): Promise<VendorContactRow[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("vendor_contacts")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("vendor_id", vendorId)
      // Primary first: it is the one you want at 6am.
      .order("is_primary", { ascending: false })
      .order("sort_order")
      .order("created_at");
    return (data ?? []) as VendorContactRow[];
  },
);

export type VendorNote = VendorNoteRow & { authorName: string | null };

export const listVendorNotes = cache(
  async (weddingId: string, vendorId: string): Promise<VendorNote[]> => {
    const supabase = await createClient();

    // `author_id` references auth.users, NOT collaborators, so there is no
    // relationship to embed through — PostgREST would resolve the join to
    // nothing and the types say so. The name is looked up separately, keyed
    // by `collaborators.user_id`.
    const [{ data }, { data: people }] = await Promise.all([
      supabase
        .from("vendor_notes")
        .select("*")
        .eq("wedding_id", weddingId)
        .eq("vendor_id", vendorId)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("collaborators")
        .select("user_id, display_name")
        .eq("wedding_id", weddingId),
    ]);

    const names = new Map(
      ((people ?? []) as { user_id: string; display_name: string | null }[]).map((row) => [
        row.user_id,
        row.display_name,
      ]),
    );

    return ((data ?? []) as VendorNoteRow[]).map((row) => ({
      ...row,
      // Null when the author has left the wedding, or when their display name
      // was never set. The note itself stays either way.
      authorName: row.author_id ? (names.get(row.author_id) ?? null) : null,
    }));
  },
);

/** Every budget line linked to this vendor, with spec 6's live numbers. */
export const listVendorBudgetLines = cache(
  async (weddingId: string, vendorId: string): Promise<BudgetItemView[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("v_budget_items")
      .select("*")
      .eq("wedding_id", weddingId)
      .eq("vendor_id", vendorId)
      .order("label");
    return (data ?? []) as BudgetItemView[];
  },
);

export type VendorTask = {
  listItemId: string;
  listId: string;
  listTitle: string;
  title: string;
  dueDate: string | null;
  doneAt: string | null;
};

/**
 * Tasks about this vendor — a join, not a new concept (spec 8 §11.7).
 *
 * A task is already linkable to a budget line, and a budget line is now
 * linkable to a vendor, so "tasks about this vendor" needs no third link
 * table and no second place to look. Read-only, for the same reason.
 */
export const listVendorTasks = cache(
  async (weddingId: string, vendorId: string): Promise<VendorTask[]> => {
    const supabase = await createClient();

    const { data: lines } = await supabase
      .from("budget_items")
      .select("id")
      .eq("wedding_id", weddingId)
      .eq("vendor_id", vendorId);

    const ids = ((lines ?? []) as { id: string }[]).map((row) => row.id);
    if (ids.length === 0) return [];

    const { data } = await supabase
      .from("v_budget_item_tasks")
      .select("list_item_id, list_id, list_title, title, due_date, done_at")
      .in("budget_item_id", ids);

    const rows = (data ?? []) as {
      list_item_id: string;
      list_id: string;
      list_title: string;
      title: string;
      due_date: string | null;
      done_at: string | null;
    }[];

    // A task linked to two of this vendor's lines is still one task.
    const seen = new Map<string, VendorTask>();
    for (const row of rows) {
      if (seen.has(row.list_item_id)) continue;
      seen.set(row.list_item_id, {
        listItemId: row.list_item_id,
        listId: row.list_id,
        listTitle: row.list_title,
        title: row.title,
        dueDate: row.due_date,
        doneAt: row.done_at,
      });
    }
    return [...seen.values()];
  },
);

export type UnlinkedVendorName = { name: string; lineCount: number };

/**
 * The backfill panel's source (spec 8 §4).
 *
 * Distinct `vendor_name` strings on budget lines with no `vendor_id`.
 * **Exact grouping only** — this app owns a trigram matcher and deliberately
 * does not use it here. A budget line's vendor name was typed by the planner
 * in this app, so "The Old Barn" and "Old Barn" are as likely to be two
 * genuinely different suppliers as one, and guessing wrong merges two
 * people's money.
 */
export const listUnlinkedVendorNames = cache(
  async (weddingId: string): Promise<UnlinkedVendorName[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("budget_items")
      .select("vendor_name")
      .eq("wedding_id", weddingId)
      .is("vendor_id", null)
      .not("vendor_name", "is", null);

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as { vendor_name: string | null }[]) {
      const name = row.vendor_name?.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([name, lineCount]) => ({ name, lineCount }))
      .sort((a, b) => b.lineCount - a.lineCount || a.name.localeCompare(b.name));
  },
);
