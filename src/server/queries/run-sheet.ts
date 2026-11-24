import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { guestName } from "@/lib/format";
import { collaboratorLabel } from "@/lib/people";
import { assigneeKey, type HelperGroup, type RunSheetAssignee, type RunSheetItem } from "@/lib/run-sheet";
import { signPaths } from "@/lib/supabase/storage";
import type { RunSheetAssigneeType, RunSheetItemAssigneeRow, RunSheetItemView } from "@/lib/types/database";
import { getCollaborators } from "./wedding";
import { getPeople } from "./people";

export type RunSheetData = {
  /** Every item, in order of start, then end, then title. */
  items: RunSheetItem[];
  /** Who a task can name as its contact (spec 54 §10.6). */
  contacts: { id: string; label: string; phone: string }[];
  groups: HelperGroup[];
  /** A person's day-link state by assignee key: made, or opened on a phone. Absent = no link. */
  linkStates: Record<string, "made" | "opened">;
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

  const [itemsResult, assigneesResult, guestsResult, vendorsResult, collaborators, people, contentResult, stepsResult, contactsResult, filesResult, groupsResult, membersResult, linksResult, devicesResult] = await Promise.all([
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
    supabase
      .from("run_sheet_items")
      .select("id, instructions, address, critical, contact_id, photo_on_done, is_cue, cue_called_at, opens_module, open_to_group_id, open_places")
      .eq("wedding_id", weddingId),
    supabase.from("run_sheet_item_steps").select("item_id, kind, text, sort_order").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("day_contacts").select("id, label, phone").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("run_sheet_item_files").select("id, item_id, path, mime_type, caption").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("helper_groups").select("id, name").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("helper_group_members").select("*").eq("wedding_id", weddingId),
    supabase.from("day_links").select("id, vendor_id, guest_id, person_id").eq("wedding_id", weddingId).is("revoked_at", null),
    supabase.from("day_link_devices").select("link_id").eq("wedding_id", weddingId),
  ]);

  if (itemsResult.error) throw new Error(`Could not load the run sheet: ${itemsResult.error.message}`);
  if (assigneesResult.error) throw new Error(`Could not load who is on the run sheet: ${assigneesResult.error.message}`);
  if (guestsResult.error) throw new Error(`Could not load guests: ${guestsResult.error.message}`);
  if (vendorsResult.error) throw new Error(`Could not load vendors: ${vendorsResult.error.message}`);
  if (contentResult.error) throw new Error(`Could not load task details: ${contentResult.error.message}`);
  if (stepsResult.error) throw new Error(`Could not load task steps: ${stepsResult.error.message}`);
  if (filesResult.error) throw new Error(`Could not load task photos: ${filesResult.error.message}`);
  if (linksResult.error) throw new Error(`Could not load day links: ${linksResult.error.message}`);
  if (devicesResult.error) throw new Error(`Could not load day link devices: ${devicesResult.error.message}`);
  if (groupsResult.error) throw new Error(`Could not load groups: ${groupsResult.error.message}`);
  if (membersResult.error) throw new Error(`Could not load group members: ${membersResult.error.message}`);
  if (contactsResult.error) throw new Error(`Could not load day contacts: ${contactsResult.error.message}`);

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
    list.push(row.is_lead ? { ...who, isLead: true } : who);
    onItem.set(row.item_id, list);
  }

  const signedFiles = await signPaths((filesResult.data ?? []).map((f) => f.path));
  const groups: HelperGroup[] = (groupsResult.data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    memberKeys: (membersResult.data ?? [])
      .filter((m) => m.group_id === g.id)
      .map((m) => (m.vendor_id ? assigneeKey("vendor", m.vendor_id) : m.guest_id ? assigneeKey("guest", m.guest_id) : m.person_id ? assigneeKey("person", m.person_id) : ""))
      .filter((k) => k && byKey.has(k)),
  }));
  const opened = new Set((devicesResult.data ?? []).map((d) => d.link_id));
  const linkStates: Record<string, "made" | "opened"> = {};
  for (const l of linksResult.data ?? []) {
    const key = l.vendor_id ? assigneeKey("vendor", l.vendor_id) : l.guest_id ? assigneeKey("guest", l.guest_id) : l.person_id ? assigneeKey("person", l.person_id) : null;
    if (key) linkStates[key] = opened.has(l.id) ? "opened" : "made";
  }
  const contentById = new Map((contentResult.data ?? []).map((c) => [c.id, c]));
  const items: RunSheetItem[] = ((itemsResult.data ?? []) as RunSheetItemView[]).map((item) => {
    const content = contentById.get(item.id);
    const own = (stepsResult.data ?? []).filter((s) => s.item_id === item.id);
    return {
      ...item,
      assignees: onItem.get(item.id) ?? [],
      helper: {
        instructions: content?.instructions ?? null,
        address: content?.address ?? null,
        critical: content?.critical ?? false,
        contactId: content?.contact_id ?? null,
        steps: own.filter((s) => s.kind === "step").map((s) => s.text),
        bring: own.filter((s) => s.kind === "bring").map((s) => s.text),
        photoOnDone: content?.photo_on_done ?? false,
        isCue: content?.is_cue ?? false,
        cueCalledAt: content?.cue_called_at ?? null,
        opensModule: content?.opens_module ?? null,
        openGroupId: content?.open_to_group_id ?? null,
        openPlaces: content?.open_places ?? null,
        files: (filesResult.data ?? [])
          .filter((f) => f.item_id === item.id)
          .map((f) => ({ id: f.id, url: signedFiles.get(f.path) ?? null, mime: f.mime_type, caption: f.caption })),
      },
    };
  });

  return { items, options, contacts: contactsResult.data ?? [], groups, linkStates };
});
