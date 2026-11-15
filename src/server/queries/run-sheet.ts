import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { guestName } from "@/lib/format";
import { collaboratorLabel } from "@/lib/people";
import { assigneeKey, type RunSheetAssignee, type RunSheetItem } from "@/lib/run-sheet";
import type { RunSheetAssigneeType, RunSheetItemAssigneeRow, RunSheetItemView } from "@/lib/types/database";
import { getCollaborators } from "./wedding";
import { getPeople } from "./people";

export type RunSheetData = {
  /** Every item, in order of start, then end, then title. */
  items: RunSheetItem[];
  /** Everyone the picker can offer: collaborators, vendors, guests, people. Removed guests and people are left out. */
  options: RunSheetAssignee[];
};

function assignee(type: RunSheetAssigneeType, id: string, label: string): RunSheetAssignee {
  return { key: assigneeKey(type, id), type, id, label };
}

/**
 * The whole wedding's run sheet (spec 50): one list, each item with the people
 * on it. An assignment to a removed (soft-deleted) guest or person is kept in
 * the database but not shown here.
 */
export const getRunSheet = cache(async (weddingId: string, currentUserId?: string): Promise<RunSheetData> => {
  const supabase = await createClient();

  const [itemsResult, assigneesResult, guestsResult, vendorsResult, collaborators, people] = await Promise.all([
    supabase
      .from("v_run_sheet_items")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("starts_at", { ascending: true })
      .order("ends_at", { ascending: true })
      .order("title", { ascending: true }),
    supabase.from("run_sheet_item_assignees").select("*").eq("wedding_id", weddingId),
    supabase
      .from("guests")
      .select("id, first_name, last_name, preferred_name")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .order("first_name"),
    supabase.from("vendors").select("id, name").eq("wedding_id", weddingId).order("name"),
    getCollaborators(weddingId),
    getPeople(weddingId),
  ]);

  if (itemsResult.error) throw new Error(`Could not load the run sheet: ${itemsResult.error.message}`);
  if (assigneesResult.error) throw new Error(`Could not load who is on the run sheet: ${assigneesResult.error.message}`);
  if (guestsResult.error) throw new Error(`Could not load guests: ${guestsResult.error.message}`);
  if (vendorsResult.error) throw new Error(`Could not load vendors: ${vendorsResult.error.message}`);

  const options: RunSheetAssignee[] = [
    ...collaborators.map((c) => assignee("collaborator", c.user_id, collaboratorLabel(c, currentUserId))),
    ...(vendorsResult.data ?? []).map((v) => assignee("vendor", v.id, v.name)),
    ...(guestsResult.data ?? []).map((g) => assignee("guest", g.id, guestName(g))),
    ...people.filter((p) => !p.deleted_at).map((p) => assignee("person", p.id, p.name)),
  ];
  const byKey = new Map(options.map((option) => [option.key, option]));

  const onItem = new Map<string, RunSheetAssignee[]>();
  for (const row of (assigneesResult.data ?? []) as RunSheetItemAssigneeRow[]) {
    const key = row.collaborator_user_id
      ? assigneeKey("collaborator", row.collaborator_user_id)
      : row.guest_id
        ? assigneeKey("guest", row.guest_id)
        : row.vendor_id
          ? assigneeKey("vendor", row.vendor_id)
          : row.person_id
            ? assigneeKey("person", row.person_id)
            : null;
    const who = key ? byKey.get(key) : undefined;
    if (!who) continue; // removed guest or person: kept, not shown
    const list = onItem.get(row.item_id) ?? [];
    list.push(who);
    onItem.set(row.item_id, list);
  }

  const items: RunSheetItem[] = ((itemsResult.data ?? []) as RunSheetItemView[]).map((item) => ({
    ...item,
    assignees: onItem.get(item.id) ?? [],
  }));

  return { items, options };
});
