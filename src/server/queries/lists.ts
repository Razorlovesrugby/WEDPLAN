import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { generateTimelineItems, todayIso, type GeneratedListItem, type TemplateSection } from "@/lib/lists/generate";
import { buildDigest, type DigestContent, type DigestItem } from "@/lib/reminders/digest";
import type {
  ListItemRow,
  ListRow,
  ListSectionRow,
  ListTemplateRow,
  TimelineItemView,
} from "@/lib/types/database";

/**
 * `cache()` deduplicates within a single render pass — see
 * src/server/queries/wedding.ts for the same convention.
 */

export type ListItemWithList = ListItemRow & {
  lists: Pick<ListRow, "title" | "color" | "icon" | "kind"> | null;
};

export const getLists = cache(async (weddingId: string): Promise<ListRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("wedding_id", weddingId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load lists: ${error.message}`);
  return data ?? [];
});

export type SectionWithList = ListSectionRow & { list_title: string };

/** Every section across every active list, for the budget popup's "Link a section…" search (spec 16 §3) — the same "few hundred rows, filtered in memory" approach the existing "Link a task…" search already uses. */
export const getAllSections = cache(async (weddingId: string): Promise<SectionWithList[]> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("list_sections")
    .select("*, lists(title)")
    .eq("wedding_id", weddingId)
    .in("list_id", activeListIds);
  if (error) throw new Error(`Could not load sections: ${error.message}`);
  return (data ?? []).map(({ lists, ...section }) => ({
    ...section,
    list_title: (lists as { title: string } | null)?.title ?? "",
  }));
});

/**
 * Per-list count of not-done items, sub-items included — a sub-item is a
 * real, separately completable thing, and excluding it would undercount a
 * list that leans on sub-tasks (spec 16 §1). Backs the sidebar's badge,
 * replacing the Move up/down buttons that used to sit in the same spot.
 */
export const getOpenItemCounts = cache(async (weddingId: string): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return {};
  const { data, error } = await supabase
    .from("list_items")
    .select("list_id")
    .eq("wedding_id", weddingId)
    .in("list_id", activeListIds)
    .neq("status", "done");
  if (error) throw new Error(`Could not load open item counts: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.list_id] = (counts[row.list_id] ?? 0) + 1;
  return counts;
});

/**
 * Non-archived list ids, for scoping a query over list_items to "every
 * active list".
 *
 * Derived from `getLists` rather than issuing its own `select id` — same
 * wedding, same `archived_at is null` filter, so the same set. Every smart
 * view below awaits this *before* it can build its own query, which made it
 * a strict serial round trip in front of each one; and because it was a
 * bare async function rather than a cached one, rendering a page that shows
 * two views (or `/budget`, which calls `getLists` and `getAllItems`) paid
 * for it again each time. Going through the cached `getLists` collapses all
 * of that to a single `lists` query per render — usually one the page has
 * already made for its sidebar.
 */
async function getActiveListIds(weddingId: string): Promise<string[]> {
  const lists = await getLists(weddingId);
  return lists.map((row) => row.id);
}

export const getListDetail = cache(
  async (
    weddingId: string,
    listId: string,
  ): Promise<{ list: ListRow; sections: ListSectionRow[]; items: ListItemRow[] } | null> => {
    const supabase = await createClient();

    const { data: list, error: listError } = await supabase
      .from("lists")
      .select("*")
      .eq("id", listId)
      .eq("wedding_id", weddingId)
      .maybeSingle();
    if (listError) throw new Error(`Could not load list: ${listError.message}`);
    if (!list) return null;

    const [{ data: sections, error: sectionsError }, { data: items, error: itemsError }] = await Promise.all([
      supabase
        .from("list_sections")
        .select("*")
        .eq("wedding_id", weddingId)
        .eq("list_id", listId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("list_items")
        .select("*")
        .eq("wedding_id", weddingId)
        .eq("list_id", listId)
        .order("sort_order", { ascending: true }),
    ]);
    if (sectionsError) throw new Error(`Could not load sections: ${sectionsError.message}`);
    if (itemsError) throw new Error(`Could not load items: ${itemsError.message}`);

    return { list, sections: sections ?? [], items: items ?? [] };
  },
);

export const getListTemplates = cache(async (): Promise<ListTemplateRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_templates")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Could not load list templates: ${error.message}`);
  return data ?? [];
});

/**
 * Preview for `/setup/plan`: what generating the timeline template would
 * produce, without writing anything. Read-only twin of
 * `generateTimelineTemplate` in src/server/actions/lists.ts, sharing the same
 * pure computation so the preview can never drift from what "generate"
 * actually does.
 */
export const getTimelineTemplatePreview = cache(
  async (weddingDate: string | null): Promise<{ items: GeneratedListItem[]; templateFound: boolean }> => {
    const supabase = await createClient();
    const { data: template, error } = await supabase
      .from("list_templates")
      .select("payload")
      .eq("key", "timeline")
      .maybeSingle();
    if (error) throw new Error(`Could not load the timeline template: ${error.message}`);
    if (!template) return { items: [], templateFound: false };

    const payload = template.payload as { sections?: TemplateSection[] };
    return { items: generateTimelineItems("timeline", weddingDate, payload.sections ?? []), templateFound: true };
  },
);

// ---------------------------------------------------------------------------
// Smart views — computed from list_items, never stored (spec 1, section 4).
// ---------------------------------------------------------------------------

// Today/Scheduled query list_items directly (joined to lists) rather than
// v_timeline_items, so they come back in the same shape as the other smart
// views and can share ItemRow. v_timeline_items itself still backs
// getTimelineItems below, for /timeline.

export const getTodayItems = cache(async (weddingId: string): Promise<ListItemWithList[]> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("list_items")
    .select("*, lists(title, color, icon, kind)")
    .eq("wedding_id", weddingId)
    .eq("due_date", todayIso())
    .neq("status", "done")
    .in("list_id", activeListIds)
    .order("priority", { ascending: false });
  if (error) throw new Error(`Could not load today's items: ${error.message}`);
  return (data ?? []) as ListItemWithList[];
});

export const getScheduledItems = cache(async (weddingId: string): Promise<ListItemWithList[]> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("list_items")
    .select("*, lists(title, color, icon, kind)")
    .eq("wedding_id", weddingId)
    .not("due_date", "is", null)
    .neq("status", "done")
    .in("list_id", activeListIds)
    .order("due_date", { ascending: true });
  if (error) throw new Error(`Could not load scheduled items: ${error.message}`);
  return (data ?? []) as ListItemWithList[];
});

export const getFlaggedItems = cache(async (weddingId: string): Promise<ListItemWithList[]> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("list_items")
    .select("*, lists(title, color, icon, kind)")
    .eq("wedding_id", weddingId)
    .eq("flagged", true)
    .in("list_id", activeListIds)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Could not load flagged items: ${error.message}`);
  return (data ?? []) as ListItemWithList[];
});

/** A checklist item joined to its section's kind, so a "notes" section's plain-text lines can be filtered out of a view that has no other reason to exclude them (spec 15 §4 — see getAllItems/getBoardItems). */
type ListItemWithSectionKind = ListItemWithList & { list_sections: { kind: string } | null };

function excludeNotes(items: ListItemWithSectionKind[]): ListItemWithList[] {
  return items.filter((item) => item.list_sections?.kind !== "notes");
}

export const getAllItems = cache(async (weddingId: string): Promise<ListItemWithList[]> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("list_items")
    .select("*, lists(title, color, icon, kind), list_sections(kind)")
    .eq("wedding_id", weddingId)
    .in("list_id", activeListIds)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Could not load items: ${error.message}`);
  return excludeNotes((data ?? []) as ListItemWithSectionKind[]);
});

export const getAssignedToMeItems = cache(
  async (weddingId: string, userId: string): Promise<ListItemWithList[]> => {
    const supabase = await createClient();
    const activeListIds = await getActiveListIds(weddingId);
    if (activeListIds.length === 0) return [];
    const { data, error } = await supabase
      .from("list_items")
      .select("*, lists(title, color, icon, kind)")
      .eq("wedding_id", weddingId)
      .eq("assigned_to", userId)
      .neq("status", "done")
      .in("list_id", activeListIds)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(`Could not load your items: ${error.message}`);
    return (data ?? []) as ListItemWithList[];
  },
);

// ---------------------------------------------------------------------------
// /timeline and /board
// ---------------------------------------------------------------------------

export const getTimelineItems = cache(async (weddingId: string): Promise<TimelineItemView[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_timeline_items")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("due_date", { ascending: true });
  if (error) throw new Error(`Could not load the timeline: ${error.message}`);
  return data ?? [];
});

/**
 * "Overdue" / "due this week" for the dashboard tiles — built from the same
 * `v_reminders_due` + `buildDigest` the weekly digest cron uses, so the
 * dashboard, the digest email, and the "Budget" tile's payment count can
 * never disagree about what counts as overdue. See
 * src/app/api/cron/reminders/route.ts for the email side. Reads
 * `v_reminders_due` (spec 6, section 3), not `v_timeline_items` directly —
 * that view unions in unpaid payments, so a due deposit shows up here the
 * same way an overdue checklist item does. `/timeline` itself is
 * unaffected: it still reads `getTimelineItems` above, list-items-only.
 */
export const getTimelineSummary = cache(
  async (weddingId: string, windowDays = 7): Promise<DigestContent> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("v_reminders_due")
      .select("*")
      .eq("wedding_id", weddingId);
    if (error) throw new Error(`Could not load what's due: ${error.message}`);

    const digestItems: DigestItem[] = (data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      due_date: item.due_date,
      list_title: item.list_title,
      list_color: item.list_color,
      snoozed_until: item.snoozed_until,
      done: item.status === "done",
      source: item.source,
    }));
    return buildDigest(digestItems, undefined, windowDays);
  },
);

// ---------------------------------------------------------------------------
// CSV export (spec 17) — every item across every active list, joined to its
// list and section for context, ordered the same way /lists/[id] groups
// them: by list, then by section (an item with no section sorts last within
// its list, matching ListDetail's own "no section" bucket rule), then by
// the item's own sort_order.
// ---------------------------------------------------------------------------

export type ListItemForExport = ListItemRow & {
  lists: Pick<ListRow, "title" | "sort_order"> | null;
  list_sections: Pick<ListSectionRow, "title" | "sort_order"> | null;
};

export const getItemsForExport = cache(async (weddingId: string): Promise<ListItemForExport[]> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("list_items")
    .select("*, lists(title, sort_order), list_sections(title, sort_order)")
    .eq("wedding_id", weddingId)
    .in("list_id", activeListIds);
  if (error) throw new Error(`Could not load tasks: ${error.message}`);

  const items = (data ?? []) as ListItemForExport[];
  return items.sort((a, b) => {
    const byList = (a.lists?.sort_order ?? 0) - (b.lists?.sort_order ?? 0);
    if (byList !== 0) return byList;
    const aSection = a.list_sections?.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bSection = b.list_sections?.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aSection !== bSection) return aSection - bSection;
    return a.sort_order - b.sort_order;
  });
});

export const getBoardItems = cache(
  async (weddingId: string, listId?: string): Promise<ListItemWithList[]> => {
    const supabase = await createClient();
    const activeListIds = listId ? [listId] : await getActiveListIds(weddingId);
    if (activeListIds.length === 0) return [];
    const { data, error } = await supabase
      .from("list_items")
      .select("*, lists(title, color, icon, kind), list_sections(kind)")
      .eq("wedding_id", weddingId)
      .in("list_id", activeListIds)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`Could not load the board: ${error.message}`);
    return excludeNotes((data ?? []) as ListItemWithSectionKind[]);
  },
);
