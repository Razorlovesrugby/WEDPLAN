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
  lists: Pick<ListRow, "title" | "color" | "kind"> | null;
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

/** Non-archived list ids, for scoping a query over list_items to "every active list". */
async function getActiveListIds(weddingId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .select("id")
    .eq("wedding_id", weddingId)
    .is("archived_at", null);
  if (error) throw new Error(`Could not load lists: ${error.message}`);
  return (data ?? []).map((row) => row.id);
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
    .select("*, lists(title, color, kind)")
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
    .select("*, lists(title, color, kind)")
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
    .select("*, lists(title, color, kind)")
    .eq("wedding_id", weddingId)
    .eq("flagged", true)
    .in("list_id", activeListIds)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Could not load flagged items: ${error.message}`);
  return (data ?? []) as ListItemWithList[];
});

export const getAllItems = cache(async (weddingId: string): Promise<ListItemWithList[]> => {
  const supabase = await createClient();
  const activeListIds = await getActiveListIds(weddingId);
  if (activeListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("list_items")
    .select("*, lists(title, color, kind)")
    .eq("wedding_id", weddingId)
    .in("list_id", activeListIds)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Could not load items: ${error.message}`);
  return (data ?? []) as ListItemWithList[];
});

export const getAssignedToMeItems = cache(
  async (weddingId: string, userId: string): Promise<ListItemWithList[]> => {
    const supabase = await createClient();
    const activeListIds = await getActiveListIds(weddingId);
    if (activeListIds.length === 0) return [];
    const { data, error } = await supabase
      .from("list_items")
      .select("*, lists(title, color, kind)")
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

export const getBoardItems = cache(
  async (weddingId: string, listId?: string): Promise<ListItemWithList[]> => {
    const supabase = await createClient();
    const activeListIds = listId ? [listId] : await getActiveListIds(weddingId);
    if (activeListIds.length === 0) return [];
    const { data, error } = await supabase
      .from("list_items")
      .select("*, lists(title, color, kind)")
      .eq("wedding_id", weddingId)
      .in("list_id", activeListIds)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`Could not load the board: ${error.message}`);
    return (data ?? []) as ListItemWithList[];
  },
);
