import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { guestName } from "@/lib/format";
import type { DayContactRow, DayInfoSectionRow } from "@/lib/types/database";

export type DayLinkPerson = {
  type: "vendor" | "guest" | "person";
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  tasks: number;
  done: number;
  handedBack: number;
  /** The live link, if any. */
  link: { id: string; opened: boolean; lastSeenAt: string | null; expiresAt: string; arrivedAt: string | null; modules: string[] } | null;
};

export type DayGroup = { id: string; name: string; members: { type: "vendor" | "guest" | "person"; id: string; name: string }[] };

export type DayAnnouncementRow = {
  id: string;
  text: string;
  important: boolean;
  audience: "everyone" | "group" | "link";
  to: string;
  sentAt: string;
  reached: number;
  seen: number;
  acknowledged: number;
};

export type NeedsSomeone = { itemId: string; itemTitle: string; who: string; reason: string | null; suggested: string | null };

export type DayHelpRequest = {
  id: string;
  who: string;
  itemTitle: string | null;
  reason: string;
  text: string;
  tappedAt: string;
  answeredAt: string | null;
  answer: string | null;
};

export type DayLinksOverview = {
  people: DayLinkPerson[];
  contacts: DayContactRow[];
  info: DayInfoSectionRow[];
  help: DayHelpRequest[];
  groups: DayGroup[];
  /** Everyone a group can hold: vendors, guests and helpers. */
  candidates: { type: "vendor" | "guest" | "person"; id: string; name: string }[];
  announcements: DayAnnouncementRow[];
  cues: { id: string; title: string; startsAt: string; calledAt: string | null }[];
  needsSomeone: NeedsSomeone[];
};

/** Everyone assigned a task who could have a day link, with their link's state (spec 54 §10.5). */
export const getDayLinksOverview = cache(async (weddingId: string): Promise<DayLinksOverview> => {
  const supabase = await createClient();
  const [assignees, links, contacts, info, activity, groupRows, memberRows, announcementRows, readRows, cueRows, allVendors, allGuests, allPeople] = await Promise.all([
    supabase
      .from("run_sheet_item_assignees")
      .select("item_id, vendor_id, guest_id, person_id, state, handed_back_reason")
      .eq("wedding_id", weddingId),
    supabase.from("day_links").select("*").eq("wedding_id", weddingId).is("revoked_at", null),
    supabase.from("day_contacts").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("day_info_sections").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase
      .from("day_activity")
      .select("id, vendor_id, guest_id, person_id, item_id, payload, tapped_at, answered_at, answer")
      .eq("wedding_id", weddingId)
      .in("kind", ["help", "question"])
      .order("tapped_at", { ascending: false })
      .limit(30),
    supabase.from("helper_groups").select("id, name").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("helper_group_members").select("*").eq("wedding_id", weddingId),
    supabase.from("day_announcements").select("*").eq("wedding_id", weddingId).order("sent_at", { ascending: false }).limit(20),
    supabase.from("day_announcement_reads").select("announcement_id, acknowledged_at").eq("wedding_id", weddingId),
    supabase.from("run_sheet_items").select("id, title, starts_at, cue_called_at").eq("wedding_id", weddingId).eq("is_cue", true).order("starts_at"),
    supabase.from("vendors").select("id, name").eq("wedding_id", weddingId).order("name"),
    supabase.from("guests").select("id, first_name, last_name, preferred_name").eq("wedding_id", weddingId).is("deleted_at", null).order("first_name"),
    supabase.from("people").select("id, name").eq("wedding_id", weddingId).is("deleted_at", null).order("name"),
  ]);
  for (const [what, r] of [["assignments", assignees], ["links", links], ["contacts", contacts], ["good to know", info], ["help requests", activity], ["groups", groupRows], ["group members", memberRows], ["announcements", announcementRows], ["announcement reads", readRows], ["cues", cueRows], ["vendors", allVendors], ["guests", allGuests], ["people", allPeople]] as const) {
    if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  }

  const counts = new Map<string, { type: DayLinkPerson["type"]; id: string; tasks: number; done: number; handedBack: number }>();
  for (const row of assignees.data ?? []) {
    const entry = row.vendor_id
      ? ({ type: "vendor", id: row.vendor_id } as const)
      : row.guest_id
        ? ({ type: "guest", id: row.guest_id } as const)
        : row.person_id
          ? ({ type: "person", id: row.person_id } as const)
          : null;
    if (!entry) continue;
    const key = `${entry.type}:${entry.id}`;
    const cur = counts.get(key) ?? { ...entry, tasks: 0, done: 0, handedBack: 0 };
    cur.tasks += 1;
    if (row.state === "done") cur.done += 1;
    if (row.state === "handed_back") cur.handedBack += 1;
    counts.set(key, cur);
  }

  const vendorIds = [...counts.values()].filter((c) => c.type === "vendor").map((c) => c.id);
  const guestIds = [...counts.values()].filter((c) => c.type === "guest").map((c) => c.id);
  const personIds = [...counts.values()].filter((c) => c.type === "person").map((c) => c.id);
  const [vendors, guests, people, devices] = await Promise.all([
    vendorIds.length ? supabase.from("vendors").select("id, name, phone, email").eq("wedding_id", weddingId).in("id", vendorIds) : Promise.resolve({ data: [], error: null }),
    guestIds.length
      ? supabase.from("guests").select("id, first_name, last_name, preferred_name, phone, email").eq("wedding_id", weddingId).is("deleted_at", null).in("id", guestIds)
      : Promise.resolve({ data: [], error: null }),
    personIds.length ? supabase.from("people").select("id, name, phone, email").eq("wedding_id", weddingId).is("deleted_at", null).in("id", personIds) : Promise.resolve({ data: [], error: null }),
    (links.data ?? []).length
      ? supabase.from("day_link_devices").select("link_id, last_seen_at").eq("wedding_id", weddingId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [what, r] of [["vendors", vendors], ["guests", guests], ["people", people], ["devices", devices]] as const) {
    if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  }

  const info_: Record<string, { name: string; phone: string | null; email: string | null }> = {};
  for (const v of vendors.data ?? []) info_[`vendor:${v.id}`] = { name: v.name, phone: v.phone, email: v.email };
  for (const g of guests.data ?? []) info_[`guest:${g.id}`] = { name: guestName(g), phone: g.phone, email: g.email };
  for (const p of people.data ?? []) info_[`person:${p.id}`] = { name: p.name, phone: p.phone, email: p.email };

  const seen = new Map<string, string>();
  for (const d of devices.data ?? []) {
    const cur = seen.get(d.link_id);
    if (!cur || d.last_seen_at > cur) seen.set(d.link_id, d.last_seen_at);
  }
  const linkOf = new Map<string, NonNullable<DayLinkPerson["link"]>>();
  for (const l of links.data ?? []) {
    const key = l.vendor_id ? `vendor:${l.vendor_id}` : l.guest_id ? `guest:${l.guest_id}` : `person:${l.person_id}`;
    linkOf.set(key, { id: l.id, modules: l.modules, opened: seen.has(l.id), lastSeenAt: seen.get(l.id) ?? null, expiresAt: l.expires_at, arrivedAt: l.arrived_at });
  }

  const people_: DayLinkPerson[] = [...counts.entries()]
    .map(([key, c]) => ({
      type: c.type,
      id: c.id,
      name: info_[key]?.name ?? "Removed",
      phone: info_[key]?.phone ?? null,
      email: info_[key]?.email ?? null,
      tasks: c.tasks,
      done: c.done,
      handedBack: c.handedBack,
      link: linkOf.get(key) ?? null,
    }))
    .filter((p) => info_[`${p.type}:${p.id}`])
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  const nameByKey = (a: { vendor_id: string | null; guest_id: string | null; person_id: string | null }) =>
    info_[a.vendor_id ? `vendor:${a.vendor_id}` : a.guest_id ? `guest:${a.guest_id}` : `person:${a.person_id}`]?.name ?? "Someone";
  const itemIds = [...new Set((activity.data ?? []).map((a) => a.item_id).filter((x): x is string => !!x))];
  const titles = itemIds.length ? await supabase.from("run_sheet_items").select("id, title").eq("wedding_id", weddingId).in("id", itemIds) : { data: [], error: null };
  if (titles.error) throw new Error(`Could not load tasks: ${titles.error.message}`);
  const titleOf = new Map((titles.data ?? []).map((t) => [t.id, t.title]));

  const candidates: DayLinksOverview["candidates"] = [
    ...(allVendors.data ?? []).map((v) => ({ type: "vendor" as const, id: v.id, name: v.name })),
    ...(allPeople.data ?? []).map((p) => ({ type: "person" as const, id: p.id, name: p.name })),
    ...(allGuests.data ?? []).map((g) => ({ type: "guest" as const, id: g.id, name: guestName(g) })),
  ];
  const nameOfCandidate = new Map(candidates.map((c) => [`${c.type}:${c.id}`, c.name]));
  const groups: DayGroup[] = (groupRows.data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    members: (memberRows.data ?? [])
      .filter((m) => m.group_id === g.id)
      .flatMap((m) => {
        const type = m.vendor_id ? ("vendor" as const) : m.guest_id ? ("guest" as const) : m.person_id ? ("person" as const) : null;
        const id = m.vendor_id ?? m.guest_id ?? m.person_id;
        const name = type && id ? nameOfCandidate.get(`${type}:${id}`) : undefined;
        return type && id && name ? [{ type, id, name }] : [];
      }),
  }));

  const liveLinks = (links.data ?? []).length;
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const linkLabel = new Map((links.data ?? []).map((l) => [l.id, l.label]));
  const reads = readRows.data ?? [];
  const announcements: DayAnnouncementRow[] = (announcementRows.data ?? []).map((a) => {
    const mine = reads.filter((r) => r.announcement_id === a.id);
    const reached =
      a.audience === "everyone"
        ? liveLinks
        : a.audience === "link"
          ? 1
          : (() => {
              const members = new Set((groups.find((g) => g.id === a.group_id)?.members ?? []).map((m) => `${m.type}:${m.id}`));
              return people_.filter((p) => p.link && members.has(`${p.type}:${p.id}`)).length;
            })();
    return {
      id: a.id,
      text: a.text,
      important: a.important,
      audience: a.audience,
      to: a.audience === "everyone" ? "Everyone" : a.audience === "group" ? (groupName.get(a.group_id ?? "") ?? "A group") : (linkLabel.get(a.link_id ?? "") ?? "One person"),
      sentAt: a.sent_at,
      reached,
      seen: mine.length,
      acknowledged: mine.filter((r) => r.acknowledged_at).length,
    };
  });

  const handed = (assignees.data ?? []).filter((a) => a.state === "handed_back");
  const handedItemIds = [...new Set(handed.map((a) => a.item_id))];
  const [handedItems, handedActivity] = handedItemIds.length
    ? await Promise.all([
        supabase.from("run_sheet_items").select("id, title").eq("wedding_id", weddingId).in("id", handedItemIds),
        supabase.from("day_activity").select("item_id, vendor_id, guest_id, person_id, payload, tapped_at").eq("wedding_id", weddingId).eq("kind", "handed_back").in("item_id", handedItemIds).order("tapped_at", { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (handedItems.error) throw new Error(`Could not load handed-back tasks: ${handedItems.error.message}`);
  if (handedActivity.error) throw new Error(`Could not load hand-backs: ${handedActivity.error.message}`);
  const handedTitle = new Map((handedItems.data ?? []).map((i) => [i.id, i.title]));
  const needsSomeone: NeedsSomeone[] = handed.map((a) => {
    const key = a.vendor_id ? `vendor:${a.vendor_id}` : a.guest_id ? `guest:${a.guest_id}` : `person:${a.person_id}`;
    const act = (handedActivity.data ?? []).find((x) => x.item_id === a.item_id && (x.vendor_id ?? x.guest_id ?? x.person_id) === (a.vendor_id ?? a.guest_id ?? a.person_id));
    const payload = (act?.payload ?? {}) as { reason?: string; suggested?: string };
    return {
      itemId: a.item_id,
      itemTitle: handedTitle.get(a.item_id) ?? "A task",
      who: info_[key]?.name ?? "Someone",
      reason: a.handed_back_reason ?? payload.reason ?? null,
      suggested: payload.suggested ?? null,
    };
  });

  return {
    groups,
    candidates,
    announcements,
    cues: (cueRows.data ?? []).map((c) => ({ id: c.id, title: c.title, startsAt: c.starts_at, calledAt: c.cue_called_at })),
    needsSomeone,
    people: people_,
    contacts: contacts.data ?? [],
    info: info.data ?? [],
    help: (activity.data ?? []).map((a) => ({
      id: a.id,
      who: nameByKey(a),
      itemTitle: a.item_id ? (titleOf.get(a.item_id) ?? null) : null,
      reason: String((a.payload as { reason?: string }).reason ?? "Help"),
      text: String((a.payload as { text?: string }).text ?? ""),
      tappedAt: a.tapped_at,
      answeredAt: a.answered_at,
      answer: a.answer,
    })),
  };
});
