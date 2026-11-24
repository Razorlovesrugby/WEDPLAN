import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestName } from "@/lib/format";
import { assigneeColumn, type ResolvedDayLink } from "./resolve";
import type { TaskState } from "@/lib/day-links/state";

/**
 * Everything one day link may read (spec 54 §12): the person's own tasks, the
 * day contacts and the Good-to-know sections. Other people on a task appear by
 * name only; the couple's private notes are never selected.
 */

export type DayTask = {
  /** run_sheet_items.id */
  id: string;
  /** This person's own row: where state, ticks and "Got it" live. */
  assigneeRowId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  address: string | null;
  instructions: string | null;
  critical: boolean;
  state: TaskState;
  startedAt: string | null;
  doneAt: string | null;
  lateMinutes: number | null;
  handedBackReason: string | null;
  seenAt: string | null;
  confirmedAt: string | null;
  updatedAt: string;
  others: string[];
  steps: { id: string; text: string; ticked: boolean }[];
  bring: string[];
  contact: { label: string; phone: string } | null;
};

export type DayHelp = {
  id: string;
  itemId: string | null;
  reason: string;
  tappedAt: string;
  answeredAt: string | null;
  answer: string | null;
};

export type MyDayData = {
  tasks: DayTask[];
  contacts: { id: string; label: string; phone: string }[];
  info: { id: string; heading: string; body: string }[];
  help: DayHelp[];
  arrivedAt: string | null;
  /** Everything the page polls for changes against. */
  loadedAt: string;
};

export async function loadMyDay({ link, assignee, wedding }: ResolvedDayLink): Promise<MyDayData> {
  const supabase = createAdminClient();
  const column = assigneeColumn(assignee);

  const { data: rows, error } = await supabase
    .from("run_sheet_item_assignees")
    .select("*")
    .eq("wedding_id", wedding.id)
    .eq(column, assignee.id);
  if (error) throw new Error(`Could not load the jobs: ${error.message}`);

  const itemIds = [...new Set((rows ?? []).map((r) => r.item_id))];

  const [items, steps, others, contacts, info, help] = await Promise.all([
    itemIds.length
      ? supabase
          .from("run_sheet_items")
          .select("id, title, starts_at, ends_at, location, address, instructions, critical, contact_id, updated_at")
          .eq("wedding_id", wedding.id)
          .in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabase
          .from("run_sheet_item_steps")
          .select("id, item_id, kind, text, sort_order")
          .eq("wedding_id", wedding.id)
          .in("item_id", itemIds)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabase.from("run_sheet_item_assignees").select("*").eq("wedding_id", wedding.id).in("item_id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("day_contacts").select("id, label, phone").eq("wedding_id", wedding.id).order("sort_order"),
    supabase.from("day_info_sections").select("id, heading, body").eq("wedding_id", wedding.id).order("sort_order"),
    supabase
      .from("day_activity")
      .select("id, item_id, payload, tapped_at, answered_at, answer")
      .eq("wedding_id", wedding.id)
      .eq("link_id", link.id)
      .eq("kind", "help")
      .order("tapped_at", { ascending: false })
      .limit(10),
  ]);
  for (const [what, r] of [["tasks", items], ["steps", steps], ["people on tasks", others], ["contacts", contacts], ["good to know", info], ["help", help]] as const) {
    if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  }

  // Names only, for the others on each task.
  const otherRows = (others.data ?? []).filter((r) => r.id !== undefined && !rows?.some((mine) => mine.id === r.id));
  const guestIds = otherRows.map((r) => r.guest_id).filter((x): x is string => !!x);
  const vendorIds = otherRows.map((r) => r.vendor_id).filter((x): x is string => !!x);
  const personIds = otherRows.map((r) => r.person_id).filter((x): x is string => !!x);
  const collabIds = otherRows.map((r) => r.collaborator_user_id).filter((x): x is string => !!x);
  const [g, v, p, c] = await Promise.all([
    guestIds.length ? supabase.from("guests").select("id, first_name, last_name, preferred_name").in("id", guestIds) : Promise.resolve({ data: [] }),
    vendorIds.length ? supabase.from("vendors").select("id, name").in("id", vendorIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("people").select("id, name").in("id", personIds) : Promise.resolve({ data: [] }),
    collabIds.length ? supabase.from("collaborators").select("user_id, display_name, role").eq("wedding_id", wedding.id).in("user_id", collabIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string>();
  for (const x of g.data ?? []) nameOf.set(`g:${x.id}`, guestName(x));
  for (const x of v.data ?? []) nameOf.set(`v:${x.id}`, x.name);
  for (const x of p.data ?? []) nameOf.set(`p:${x.id}`, x.name);
  for (const x of c.data ?? []) nameOf.set(`c:${x.user_id}`, x.display_name?.trim() || (x.role === "owner" ? "The couple" : "Your partner"));
  const othersByItem = new Map<string, string[]>();
  for (const r of otherRows) {
    const key = r.guest_id ? `g:${r.guest_id}` : r.vendor_id ? `v:${r.vendor_id}` : r.person_id ? `p:${r.person_id}` : r.collaborator_user_id ? `c:${r.collaborator_user_id}` : null;
    const name = key ? nameOf.get(key) : undefined;
    if (!name) continue;
    othersByItem.set(r.item_id, [...(othersByItem.get(r.item_id) ?? []), name]);
  }

  const myRowIds = (rows ?? []).map((r) => r.id);
  const ticks = myRowIds.length
    ? await supabase.from("run_sheet_step_ticks").select("step_id, assignee_id").eq("wedding_id", wedding.id).in("assignee_id", myRowIds)
    : { data: [], error: null };
  if (ticks.error) throw new Error(`Could not load ticks: ${ticks.error.message}`);
  const ticked = new Set((ticks.data ?? []).map((t) => `${t.assignee_id}:${t.step_id}`));

  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));
  const contactById = new Map((contacts.data ?? []).map((x) => [x.id, x]));

  const tasks: DayTask[] = [];
  for (const row of rows ?? []) {
    const item = itemById.get(row.item_id);
    if (!item) continue;
    const mine = (steps.data ?? []).filter((s) => s.item_id === item.id);
    const contact = item.contact_id ? contactById.get(item.contact_id) : undefined;
    tasks.push({
      id: item.id,
      assigneeRowId: row.id,
      title: item.title,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      location: item.location,
      address: item.address,
      instructions: item.instructions,
      critical: item.critical,
      state: row.state,
      startedAt: row.started_at,
      doneAt: row.done_at,
      lateMinutes: row.late_minutes,
      handedBackReason: row.handed_back_reason,
      seenAt: row.seen_at,
      confirmedAt: row.confirmed_at,
      updatedAt: item.updated_at,
      others: othersByItem.get(item.id) ?? [],
      steps: mine
        .filter((s) => s.kind === "step")
        .map((s) => ({ id: s.id, text: s.text, ticked: ticked.has(`${row.id}:${s.id}`) })),
      bring: mine.filter((s) => s.kind === "bring").map((s) => s.text),
      contact: contact ? { label: contact.label, phone: contact.phone } : null,
    });
  }
  tasks.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  return {
    tasks,
    contacts: contacts.data ?? [],
    info: info.data ?? [],
    help: (help.data ?? []).map((h) => ({
      id: h.id,
      itemId: h.item_id,
      reason: String((h.payload as { reason?: string }).reason ?? "Help"),
      tappedAt: h.tapped_at,
      answeredAt: h.answered_at,
      answer: h.answer,
    })),
    arrivedAt: link.arrived_at,
    loadedAt: new Date().toISOString(),
  };
}
