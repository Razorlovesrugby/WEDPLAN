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
  link: { id: string; opened: boolean; lastSeenAt: string | null; expiresAt: string; arrivedAt: string | null } | null;
};

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
};

/** Everyone assigned a task who could have a day link, with their link's state (spec 54 §10.5). */
export const getDayLinksOverview = cache(async (weddingId: string): Promise<DayLinksOverview> => {
  const supabase = await createClient();
  const [assignees, links, contacts, info, activity] = await Promise.all([
    supabase
      .from("run_sheet_item_assignees")
      .select("vendor_id, guest_id, person_id, state")
      .eq("wedding_id", weddingId),
    supabase.from("day_links").select("*").eq("wedding_id", weddingId).is("revoked_at", null),
    supabase.from("day_contacts").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase.from("day_info_sections").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase
      .from("day_activity")
      .select("id, vendor_id, guest_id, person_id, item_id, payload, tapped_at, answered_at, answer")
      .eq("wedding_id", weddingId)
      .eq("kind", "help")
      .order("tapped_at", { ascending: false })
      .limit(30),
  ]);
  for (const [what, r] of [["assignments", assignees], ["links", links], ["contacts", contacts], ["good to know", info], ["help requests", activity]] as const) {
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
    linkOf.set(key, { id: l.id, opened: seen.has(l.id), lastSeenAt: seen.get(l.id) ?? null, expiresAt: l.expires_at, arrivedAt: l.arrived_at });
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

  return {
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
