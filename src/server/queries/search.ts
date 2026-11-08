import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ilikePattern, type Command } from "@/lib/command-palette";
import { guestName } from "@/lib/format";
import type { Viewer } from "@/lib/nav-groups";

/**
 * ⌘K's "Find" (spec 46): names only, at most 8 of each kind, read as the
 * signed-in person so RLS decides what comes back. Each kind fails soft: one
 * missing table must not empty the whole search.
 */
const LIMIT = 8;

async function soft<T>(load: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await load();
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

export const searchByName = cache(async (weddingId: string, query: string, viewer: Viewer): Promise<Command[]> => {
  if (query.trim().length < 2) return [];
  const supabase = await createClient();
  const pattern = ilikePattern(query);

  const [households, guests, vendors, lists, tasks, boards, budget] = await Promise.all([
    soft<{ id: string; display_name: string }>(() =>
      supabase.from("households").select("id, display_name").eq("wedding_id", weddingId).is("deleted_at", null).ilike("display_name", pattern).limit(LIMIT),
    ),
    soft<{ id: string; first_name: string; last_name: string | null; preferred_name: string | null }>(() =>
      supabase
        .from("guests")
        .select("id, first_name, last_name, preferred_name")
        .eq("wedding_id", weddingId)
        .is("deleted_at", null)
        .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},preferred_name.ilike.${pattern}`)
        .limit(LIMIT),
    ),
    soft<{ id: string; name: string }>(() =>
      supabase.from("vendors").select("id, name").eq("wedding_id", weddingId).is("archived_at", null).ilike("name", pattern).limit(LIMIT),
    ),
    soft<{ id: string; title: string }>(() =>
      supabase.from("lists").select("id, title").eq("wedding_id", weddingId).is("archived_at", null).ilike("title", pattern).limit(LIMIT),
    ),
    soft<{ id: string; title: string; list_id: string }>(() =>
      supabase.from("list_items").select("id, title, list_id").eq("wedding_id", weddingId).ilike("title", pattern).limit(LIMIT),
    ),
    soft<{ id: string; title: string }>(() =>
      supabase.from("moodboards").select("id, title").eq("wedding_id", weddingId).is("archived_at", null).ilike("title", pattern).limit(LIMIT),
    ),
    // A planner never sees the budget (spec 39), so it's not searched for them at all.
    viewer === "couple"
      ? soft<{ id: string; label: string }>(() =>
          supabase.from("budget_items").select("id, label").eq("wedding_id", weddingId).ilike("label", pattern).limit(LIMIT),
        )
      : Promise.resolve([]),
  ]);

  return [
    ...households.map((row) => ({ id: `find:household:${row.id}`, group: "find" as const, label: row.display_name, hint: "Household", href: `/households/${row.id}` })),
    ...guests.map((row) => ({ id: `find:guest:${row.id}`, group: "find" as const, label: guestName(row), hint: "Guest", href: `/guests/${row.id}` })),
    ...vendors.map((row) => ({ id: `find:vendor:${row.id}`, group: "find" as const, label: row.name, hint: "Vendor", href: `/vendors?inspect=vendor:${row.id}` })),
    ...lists.map((row) => ({ id: `find:list:${row.id}`, group: "find" as const, label: row.title, hint: "List", href: `/lists/${row.id}` })),
    ...tasks.map((row) => ({ id: `find:task:${row.id}`, group: "find" as const, label: row.title, hint: "Task", href: `/lists/${row.list_id}?highlight=${row.id}` })),
    ...boards.map((row) => ({ id: `find:board:${row.id}`, group: "find" as const, label: row.title, hint: "Moodboard", href: `/moodboards/${row.id}` })),
    ...budget.map((row) => ({ id: `find:budget:${row.id}`, group: "find" as const, label: row.label, hint: "Budget line", href: `/budget?inspect=budget:${row.id}` })),
  ];
});

/** The lists a typed task can be added to, in their own order. */
export const getActiveLists = cache(async (weddingId: string): Promise<{ id: string; title: string }[]> => {
  const supabase = await createClient();
  return soft<{ id: string; title: string }>(() =>
    supabase.from("lists").select("id, title").eq("wedding_id", weddingId).is("archived_at", null).order("sort_order").limit(20),
  );
});
