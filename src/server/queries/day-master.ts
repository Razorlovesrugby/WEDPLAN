import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { guestName } from "@/lib/format";
import { signPaths } from "@/lib/supabase/storage";
import { dayPhase } from "@/lib/day-links/my-day";
import type { MasterActivity, MasterAssignee, MasterItem } from "@/lib/day-master/alerts";
import { counts as shotCounts, missedShots } from "@/lib/shots/progress";
import { getDayLinksOverview, type DayLinksOverview } from "./day-links";
import { getSessionUser } from "./wedding";

export type MasterAssigneeFull = MasterAssignee & {
  /** Which assignee column this is, for reassigning and calling. */
  ref: { type: "collaborator" | "guest" | "vendor" | "person"; id: string };
  phone: string | null;
  isLead: boolean;
  startedAt: string | null;
  doneAt: string | null;
  stepsTicked: number;
};

export type MasterItemFull = MasterItem & {
  location: string | null;
  predecessorId: string | null;
  isCue: boolean;
  cueCalledAt: string | null;
  stepsTotal: number;
  openPlaces: number;
  assignees: MasterAssigneeFull[];
};

export type MasterFeedRow = MasterActivity & {
  itemTitle: string | null;
  answer: string | null;
  photoUrl: string | null;
  text: string;
  group: "problems" | "notes" | "progress" | "shots" | "seating" | "other";
};

export type MasterPerson = DayLinksOverview["people"][number] & { nowTitle: string | null; stateLabel: string };

export type MasterData = {
  mode: "before" | "live" | "after";
  items: MasterItemFull[];
  assignees: MasterAssigneeFull[];
  activity: MasterFeedRow[];
  dismissed: string[];
  people: MasterPerson[];
  contacts: DayLinksOverview["contacts"];
  announcements: (DayLinksOverview["announcements"][number] & { seenNames: string[]; ackNames: string[] })[];
  groups: DayLinksOverview["groups"];
  moduleCards: { key: string; label: string; summary: string; href: string }[];
  questions: { id: string; who: string; text: string; itemTitle: string | null; tappedAt: string; answer: string | null }[];
  viewer: { userId: string | null; name: string; alertsOn: boolean; kind: "collaborator" | "person" | null };
  dayLead: { name: string; ref: { type: "collaborator" | "person"; id: string } } | null;
  assigneeOptions: { key: string; type: "collaborator" | "guest" | "vendor" | "person"; id: string; label: string }[];
  readiness: import("@/lib/day-master/readiness").ReadinessInput;
  loadedAt: string;
};

const FEED_TEXT = (a: { kind: string; who: string; payload: Record<string, unknown>; itemTitle: string | null }): string => {
  const p = a.payload as { reason?: string; text?: string; minutes?: number; title?: string; step?: string };
  const on = a.itemTitle ? ` ${a.itemTitle}` : "";
  switch (a.kind) {
    case "opened": return `${a.who} opened their link`;
    case "started": return `${a.who} started${on}`;
    case "done": return `${a.who} finished${on}`;
    case "undone": return `${a.who} undid a tap${on ? ` on${on}` : ""}`;
    case "step_done": return `${a.who} ticked "${p.text ?? p.step ?? "a step"}"${on ? ` on${on}` : ""}`;
    case "step_undone": return `${a.who} unticked a step${on ? ` on${on}` : ""}`;
    case "late": return `${a.who} is running late${p.minutes ? ` (+${p.minutes})` : ""}${on ? ` on${on}` : ""}`;
    case "help": return `${a.who} needs help${p.reason ? `: ${p.reason}` : ""}${p.text ? `. ${p.text}` : ""}`;
    case "handed_back": return `${a.who} handed back${on}${p.reason ? `: ${p.reason}` : ""}`;
    case "note": return `${a.who}: ${p.text ?? ""}`;
    case "question": return `${a.who} asks: ${p.text ?? ""}`;
    case "confirmed": return `${a.who} confirmed${on}`;
    case "arrived": return `${a.who} is here`;
    case "claimed": return `${a.who} took${on}`;
    case "announcement_seen": return `${a.who} saw an announcement`;
    case "announcement_ok": return `${a.who} tapped OK on an announcement`;
    case "shot_taken": return `${a.who} took "${p.title ?? "a shot"}"`;
    case "shot_skipped": return `${a.who} skipped "${p.title ?? "a shot"}"`;
    case "shot_later": return `${a.who} put "${p.title ?? "a shot"}" off`;
    case "shot_todo": return `${a.who} reset "${p.title ?? "a shot"}"`;
    case "seat_arrived": return `${a.who} marked a guest arrived`;
    case "seat_unarrived": return `${a.who} un-marked a guest`;
    case "seat_moved": return `${a.who} moved a guest`;
    case "seat_walk_in": return `${a.who} seated a walk-in`;
    case "help_answered": return `${a.who} answered: ${p.text ?? ""}`;
    case "reassigned": return `${a.who} reassigned${on}`;
    case "marked_started": return `${a.who} marked${on} started`;
    case "alert_dismissed": return `${a.who} dismissed an alert`;
    case "schedule_shifted": return `${a.who} shifted the schedule${p.text ? `: ${p.text}` : ""}`;
    case "cue_go": return `Go was called${on}`;
    case "announced": return `${a.who} announced: ${p.text ?? ""}`;
    case "question_answered": return `${a.who} answered a question`;
    default: return `${a.who}: ${a.kind.replace(/_/g, " ")}`;
  }
};

function groupOf(kind: string): MasterFeedRow["group"] {
  if (["help", "handed_back", "late", "help_answered", "alert_dismissed"].includes(kind)) return "problems";
  if (["note", "question", "question_answered", "announced"].includes(kind)) return "notes";
  if (kind.startsWith("shot_")) return "shots";
  if (kind.startsWith("seat_")) return "seating";
  if (["started", "done", "undone", "step_done", "step_undone", "confirmed", "arrived", "claimed", "marked_started", "reassigned", "schedule_shifted", "cue_go", "opened"].includes(kind)) return "progress";
  return "other";
}

/** Everything the on-the-day master shows, in one read through the viewer's own session (spec 55). */
export const getMasterData = cache(async (wedding: { id: string; timezone: string; day_lead_person_id: string | null; day_lead_user_id: string | null }): Promise<MasterData> => {
  const supabase = await createClient();
  const weddingId = wedding.id;
  const user = await getSessionUser();
  const [items, assigneeRows, steps, ticks, recentActivity, importantActivity, dismissedRows, overview, collaborators, people, guests, vendors, shotSections, shots, checkins, seatAssign, files] = await Promise.all([
    supabase.from("run_sheet_items").select("id, title, starts_at, ends_at, location, critical, predecessor_id, is_cue, cue_called_at, open_to_group_id, open_places").eq("wedding_id", weddingId).order("starts_at"),
    supabase.from("run_sheet_item_assignees").select("*").eq("wedding_id", weddingId),
    supabase.from("run_sheet_item_steps").select("id, item_id, kind").eq("wedding_id", weddingId).eq("kind", "step"),
    supabase.from("run_sheet_step_ticks").select("step_id, assignee_id").eq("wedding_id", weddingId),
    supabase.from("day_activity").select("*").eq("wedding_id", weddingId).order("tapped_at", { ascending: false }).limit(300),
    // Alerts and the summary must never lose a request to a busy feed: these kinds are read whole, not from the newest 300.
    supabase.from("day_activity").select("*").eq("wedding_id", weddingId).in("kind", ["help", "question", "late", "note", "handed_back", "help_answered", "question_answered"]).order("tapped_at", { ascending: false }).limit(3000),
    supabase.from("day_activity").select("payload").eq("wedding_id", weddingId).eq("kind", "alert_dismissed").limit(1000),
    getDayLinksOverview(weddingId),
    supabase.from("collaborators").select("user_id, display_name, role, day_alerts").eq("wedding_id", weddingId),
    supabase.from("people").select("id, name, phone, user_id, day_alerts").eq("wedding_id", weddingId).is("deleted_at", null),
    supabase.from("guests").select("id, first_name, last_name, preferred_name, phone").eq("wedding_id", weddingId).is("deleted_at", null),
    supabase.from("vendors").select("id, name, phone").eq("wedding_id", weddingId),
    supabase.from("shot_sections").select("id, name, run_sheet_item_id").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("shots").select("section_id, kind, minutes, status").eq("wedding_id", weddingId),
    supabase.from("seating_checkins").select("guest_id").eq("wedding_id", weddingId),
    supabase.from("v_live_seat_assignments").select("guest_id").eq("wedding_id", weddingId),
    Promise.resolve(null),
  ]);
  void files;
  for (const [what, r] of [["tasks", items], ["assignees", assigneeRows], ["steps", steps], ["ticks", ticks], ["activity", recentActivity], ["requests", importantActivity], ["dismissals", dismissedRows], ["collaborators", collaborators], ["helpers", people], ["guests", guests], ["vendors", vendors], ["shot sections", shotSections], ["shots", shots], ["arrivals", checkins], ["seats", seatAssign]] as const) {
    if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  }

  const seenIds = new Set<string>();
  const activity = {
    data: [...(importantActivity.data ?? []), ...(recentActivity.data ?? [])]
      .filter((a) => (seenIds.has(a.id) ? false : (seenIds.add(a.id), true)))
      .sort((a, b) => Date.parse(b.tapped_at) - Date.parse(a.tapped_at)),
  };

  // Names and phones, by assignee reference.
  const label = (c: { display_name: string | null; role: string }) => c.display_name?.trim() || (c.role === "owner" ? "The couple" : "Partner");
  const nameOf = new Map<string, { name: string; phone: string | null }>();
  for (const c of collaborators.data ?? []) nameOf.set(`collaborator:${c.user_id}`, { name: label(c), phone: null });
  for (const g of guests.data ?? []) nameOf.set(`guest:${g.id}`, { name: guestName(g), phone: g.phone });
  for (const v of vendors.data ?? []) nameOf.set(`vendor:${v.id}`, { name: v.name, phone: v.phone });
  for (const p of people.data ?? []) nameOf.set(`person:${p.id}`, { name: p.name, phone: p.phone });

  const ticksByRow = new Map<string, number>();
  for (const t of ticks.data ?? []) ticksByRow.set(t.assignee_id, (ticksByRow.get(t.assignee_id) ?? 0) + 1);
  const stepsByItem = new Map<string, number>();
  for (const s of steps.data ?? []) stepsByItem.set(s.item_id, (stepsByItem.get(s.item_id) ?? 0) + 1);

  const allAssignees: MasterAssigneeFull[] = (assigneeRows.data ?? []).flatMap((r) => {
    const ref = r.collaborator_user_id ? ({ type: "collaborator", id: r.collaborator_user_id } as const) : r.guest_id ? ({ type: "guest", id: r.guest_id } as const) : r.vendor_id ? ({ type: "vendor", id: r.vendor_id } as const) : r.person_id ? ({ type: "person", id: r.person_id } as const) : null;
    const who = ref ? nameOf.get(`${ref.type}:${ref.id}`) : undefined;
    if (!ref || !who) return [];
    return [{
      rowId: r.id, itemId: r.item_id, name: who.name, state: r.state, lateMinutes: r.late_minutes, handedBackReason: r.handed_back_reason,
      ref, phone: who.phone, isLead: r.is_lead, startedAt: r.started_at, doneAt: r.done_at, stepsTicked: ticksByRow.get(r.id) ?? 0,
    }];
  });

  const masterItems: MasterItemFull[] = (items.data ?? []).map((i) => ({
    id: i.id, title: i.title, startsAt: i.starts_at, endsAt: i.ends_at, critical: i.critical, location: i.location, predecessorId: i.predecessor_id,
    isCue: i.is_cue, cueCalledAt: i.cue_called_at, stepsTotal: stepsByItem.get(i.id) ?? 0,
    openPlaces: i.open_to_group_id ? (i.open_places ?? 0) : 0,
    // The lead first (spec 55 §5.2).
    assignees: allAssignees.filter((a) => a.itemId === i.id).sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name, "en-GB")),
  }));
  const itemTitle = new Map(masterItems.map((i) => [i.id, i.title]));

  // Who made each activity row: the link's person, or the actor the master action recorded.
  const linkLabel = new Map<string, string>();
  for (const p of overview.people) if (p.link) linkLabel.set(p.link.id, p.name);
  const photoUrls = await signPaths((activity.data ?? []).map((a) => a.photo_path).filter((p): p is string => !!p));
  const feed: MasterFeedRow[] = (activity.data ?? []).map((a) => {
    const payload = (a.payload ?? {}) as Record<string, unknown>;
    const who = (a.link_id && linkLabel.get(a.link_id)) || (typeof payload.by === "string" ? payload.by : null) || nameOf.get(`vendor:${a.vendor_id}`)?.name || nameOf.get(`guest:${a.guest_id}`)?.name || nameOf.get(`person:${a.person_id}`)?.name || "Someone";
    const row = { id: a.id, kind: a.kind, itemId: a.item_id, who, payload, tappedAt: a.tapped_at, answeredAt: a.answered_at, itemTitle: a.item_id ? (itemTitle.get(a.item_id) ?? null) : null, answer: a.answer };
    return { ...row, photoUrl: a.photo_path ? (photoUrls.get(a.photo_path) ?? null) : null, text: FEED_TEXT(row), group: groupOf(a.kind) };
  });

  const dismissed = (dismissedRows.data ?? []).map((d) => String((d.payload as { key?: string }).key ?? "")).filter(Boolean);

  // People: their link state, what they're on now.
  const nowMs = Date.now();
  const people_: MasterPerson[] = overview.people.map((p) => {
    const mine = allAssignees.filter((a) => a.ref.type === p.type && a.ref.id === p.id);
    const current = mine.map((a) => ({ a, item: masterItems.find((i) => i.id === a.itemId)! })).filter((x) => x.item && (x.a.state === "started" || (x.a.state === "todo" && Date.parse(x.item.startsAt) <= nowMs && nowMs < Date.parse(x.item.endsAt)))).sort((x, y) => Number(y.a.state === "started") - Number(x.a.state === "started"))[0];
    return { ...p, nowTitle: current?.item.title ?? null, stateLabel: current ? ({ todo: "To do", started: "On it", done: "Done", handed_back: "Handed back" } as const)[current.a.state] : "" };
  });

  // Module cards (spec 55 §5.6).
  const moduleCards: MasterData["moduleCards"] = [];
  const sections = shotSections.data ?? [];
  if (sections.length > 0 && (shots.data ?? []).length > 0) {
    const nowDate = new Date();
    const parts = sections
      .map((sec) => {
        const mine = (shots.data ?? []).filter((s) => s.section_id === sec.id).map((s) => ({ id: "", kind: s.kind, minutes: s.minutes, status: s.status }));
        if (mine.length === 0) return null;
        const end = sec.run_sheet_item_id ? (masterItems.find((i) => i.id === sec.run_sheet_item_id)?.endsAt ?? null) : null;
        const c = shotCounts(mine);
        const missed = missedShots(mine, end, nowDate).length;
        return `${sec.name} · ${c.taken} of ${c.total}${missed ? ` · ${missed} missed` : ""}`;
      })
      .filter(Boolean);
    if (parts.length > 0) moduleCards.push({ key: "shot_list", label: "Shot list", summary: parts.join("  |  "), href: "/shots" });
  }
  const seated = new Set((seatAssign.data ?? []).map((s) => s.guest_id));
  if (seated.size > 0 && (checkins.data ?? []).length > 0) {
    moduleCards.push({ key: "seating", label: "Seating", summary: `${(checkins.data ?? []).filter((c) => seated.has(c.guest_id)).length} of ${seated.size} arrived`, href: "/seating" });
  }

  const questions = (activity.data ?? [])
    .filter((a) => a.kind === "question")
    .map((a) => ({ id: a.id, who: (a.link_id && linkLabel.get(a.link_id)) || "Someone", text: String((a.payload as { text?: string }).text ?? ""), itemTitle: a.item_id ? (itemTitle.get(a.item_id) ?? null) : null, tappedAt: a.tapped_at, answer: a.answer }));

  // Announcement names.
  const [announcementReads, linkRows] = await Promise.all([
    supabase.from("day_announcement_reads").select("announcement_id, link_id, acknowledged_at").eq("wedding_id", weddingId),
    supabase.from("day_links").select("id, label").eq("wedding_id", weddingId),
  ]);
  if (announcementReads.error) throw new Error(`Could not load announcement reads: ${announcementReads.error.message}`);
  if (linkRows.error) throw new Error(`Could not load links: ${linkRows.error.message}`);
  const labelOfLink = new Map((linkRows.data ?? []).map((l) => [l.id, l.label]));
  const announcements = overview.announcements.map((a) => {
    const mine = (announcementReads.data ?? []).filter((r) => r.announcement_id === a.id);
    return { ...a, seenNames: mine.map((r) => labelOfLink.get(r.link_id) ?? "Someone"), ackNames: mine.filter((r) => r.acknowledged_at).map((r) => labelOfLink.get(r.link_id) ?? "Someone") };
  });

  // The viewer, and the day lead.
  const myCollab = (collaborators.data ?? []).find((c) => c.user_id === user?.id);
  const myPerson = (people.data ?? []).find((p) => p.user_id === user?.id);
  const dayLead = wedding.day_lead_user_id
    ? { name: nameOf.get(`collaborator:${wedding.day_lead_user_id}`)?.name ?? "The day lead", ref: { type: "collaborator" as const, id: wedding.day_lead_user_id } }
    : wedding.day_lead_person_id
      ? { name: nameOf.get(`person:${wedding.day_lead_person_id}`)?.name ?? "The day lead", ref: { type: "person" as const, id: wedding.day_lead_person_id } }
      : null;
  // Naming a day lead turns the couple's own alerts off by default (`setDayLead` writes that); each can switch them back on.
  const alertsOn = myCollab ? myCollab.day_alerts : (myPerson?.day_alerts ?? true);

  const phase = dayPhase(masterItems.map((i) => ({ startsAt: i.startsAt, endsAt: i.endsAt })), new Date(), wedding.timezone);
  const mode: MasterData["mode"] = phase === "day" ? "live" : phase === "after" ? "after" : "before";

  const helpers = overview.people.map((p) => ({ key: `${p.type}:${p.id}`, name: p.name, hasLink: Boolean(p.link), opened: Boolean(p.link?.opened), phone: p.phone }));
  const myAssigneeItems = masterItems.map((i) => ({ id: i.id, title: i.title, assigneeCount: i.assignees.filter((a) => a.state !== "handed_back").length, handedBack: i.assignees.some((a) => a.state === "handed_back") && i.assignees.every((a) => a.state === "handed_back"), openPlaces: i.openPlaces }));
  const helperRows = allAssignees.filter((a) => a.ref.type !== "collaborator");
  const readiness = {
    items: myAssigneeItems,
    helpers,
    tasks: { total: helperRows.length, confirmed: (assigneeRows.data ?? []).filter((r) => (r.guest_id || r.vendor_id || r.person_id) && r.confirmed_at).length },
    questions: questions.filter((q) => !q.answer).length,
    contacts: overview.contacts.length,
    infoSections: overview.info.filter((s) => s.body.trim()).length,
  };

  return {
    mode,
    items: masterItems,
    assignees: allAssignees,
    activity: feed,
    dismissed,
    people: people_,
    contacts: overview.contacts,
    announcements,
    groups: overview.groups,
    moduleCards,
    questions,
    viewer: { userId: user?.id ?? null, name: myCollab ? label(myCollab) : (myPerson?.name ?? "Someone"), alertsOn, kind: myCollab ? "collaborator" : myPerson ? "person" : null },
    dayLead,
    assigneeOptions: [...nameOf.entries()].map(([key, v]) => {
      const [type, id] = key.split(":") as ["collaborator" | "guest" | "vendor" | "person", string];
      return { key, type, id, label: v.name };
    }),
    readiness,
    loadedAt: new Date().toISOString(),
  };
});
