import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { guestName, sideLabel } from "@/lib/format";
import { signPaths } from "@/lib/supabase/storage";
import { DEFAULT_SECTIONS, personKey, type ShotItem, type ShotPerson, type ShotSectionItem } from "@/lib/shots/model";

export type ShotGuestOption = {
  id: string;
  name: string;
  relationship: string | null;
  vendorNote: string | null;
  photoUrl: string | null;
  side: string | null;
  householdId: string | null;
};

export type ShotListData = {
  sections: ShotSectionItem[];
  guests: ShotGuestOption[];
  people: { id: string; name: string }[];
  /** Households and sides a whole group of guests can be added from (spec 58 §3.3). */
  households: { id: string; name: string }[];
  sides: { side: string; label: string }[];
  /** Run sheet items a section can be linked to. */
  items: { id: string; title: string; startsAt: string; endsAt: string; location: string | null }[];
  /** Day links with the Shot list module on, and for which section. */
  sharedWith: { linkId: string; label: string; sectionId: string | null }[];
};

/** The couple's whole shot list. A new wedding gets the six default sections on first read (spec 52 §4.1). */
export const getShotList = cache(async (weddingId: string): Promise<ShotListData> => {
  const supabase = await createClient();

  const first = await supabase.from("shot_sections").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId);
  if (first.error) throw new Error(`Could not load the shot list: ${first.error.message}`);
  if ((first.count ?? 0) === 0) {
    const { error } = await supabase
      .from("shot_sections")
      .insert(DEFAULT_SECTIONS.map((name, i) => ({ wedding_id: weddingId, name, sort_order: i + 1 })));
    if (error) throw new Error(`Could not start the shot list: ${error.message}`);
  }

  const [sections, shots, shotPeople, guests, people, items, links, households, collaborators] = await Promise.all([
    supabase.from("shot_sections").select("*").eq("wedding_id", weddingId).order("sort_order").order("created_at"),
    supabase.from("shots").select("*").eq("wedding_id", weddingId).order("sort_order").order("created_at"),
    supabase.from("shot_people").select("*").eq("wedding_id", weddingId).order("sort_order"),
    supabase
      .from("guests")
      .select("id, first_name, last_name, preferred_name, relationship, vendor_note, photo_path, side, household_id")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .order("first_name"),
    supabase.from("people").select("id, name").eq("wedding_id", weddingId).is("deleted_at", null).order("name"),
    supabase.from("run_sheet_items").select("id, title, starts_at, ends_at, location").eq("wedding_id", weddingId).order("starts_at"),
    supabase.from("day_links").select("id, label, modules, module_config").eq("wedding_id", weddingId).is("revoked_at", null),
    supabase.from("households").select("id, display_name").eq("wedding_id", weddingId).is("deleted_at", null).order("rank"),
    supabase.from("collaborators").select("role, display_name").eq("wedding_id", weddingId),
  ]);
  for (const [what, r] of [["sections", sections], ["shots", shots], ["shot people", shotPeople], ["guests", guests], ["helpers", people], ["tasks", items], ["links", links], ["households", households], ["names", collaborators]] as const) {
    if (r.error) throw new Error(`Could not load ${what}: ${r.error.message}`);
  }

  const signed = await signPaths((guests.data ?? []).map((g) => g.photo_path).filter((p): p is string => !!p));
  const guestOptions: ShotGuestOption[] = (guests.data ?? []).map((g) => ({
    id: g.id,
    name: guestName(g),
    relationship: g.relationship,
    vendorNote: g.vendor_note,
    photoUrl: g.photo_path ? (signed.get(g.photo_path) ?? null) : null,
    side: g.side,
    householdId: g.household_id,
  }));
  const nameOfGuest = new Map(guestOptions.map((g) => [g.id, g.name]));
  const nameOfPerson = new Map((people.data ?? []).map((p) => [p.id, p.name]));
  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));

  const peopleByShot = new Map<string, ShotPerson[]>();
  for (const sp of shotPeople.data ?? []) {
    let who: ShotPerson | null = null;
    if (sp.guest_id) {
      const name = nameOfGuest.get(sp.guest_id);
      if (name) who = { key: personKey("guest", sp.guest_id), kind: "guest", id: sp.guest_id, name };
    } else if (sp.person_id) {
      const name = nameOfPerson.get(sp.person_id);
      if (name) who = { key: personKey("person", sp.person_id), kind: "person", id: sp.person_id, name };
    } else if (sp.role) {
      who = { key: personKey("role", sp.role), kind: "role", role: sp.role, name: sp.role };
    }
    // A removed guest drops out of every shot (§4.2).
    if (who) peopleByShot.set(sp.shot_id, [...(peopleByShot.get(sp.shot_id) ?? []), who]);
  }

  const refSigned = await signPaths((shots.data ?? []).map((s) => s.reference_path).filter((p): p is string => !!p));
  const shotItems: ShotItem[] = (shots.data ?? []).map((s) => ({
    id: s.id,
    sectionId: s.section_id,
    title: s.title,
    kind: s.kind,
    mustHave: s.must_have,
    minutes: s.minutes,
    note: s.note,
    shooter: s.shooter,
    referenceUrl: s.reference_path ? (refSigned.get(s.reference_path) ?? null) : null,
    sortOrder: s.sort_order,
    status: s.status,
    statusAt: s.status_at,
    statusBy: s.status_by,
    people: peopleByShot.get(s.id) ?? [],
  }));

  return {
    sections: (sections.data ?? []).map((sec) => {
      const item = sec.run_sheet_item_id ? itemById.get(sec.run_sheet_item_id) : undefined;
      return {
        id: sec.id,
        name: sec.name,
        // The linked item decides the time and place (§4.1).
        location: item ? item.location : sec.location,
        runSheetItemId: sec.run_sheet_item_id,
        startsAt: item?.starts_at ?? null,
        endsAt: item?.ends_at ?? null,
        sortOrder: sec.sort_order,
        shots: shotItems.filter((s) => s.sectionId === sec.id),
      };
    }),
    guests: guestOptions,
    people: people.data ?? [],
    households: (households.data ?? []).map((h) => ({ id: h.id, name: h.display_name })),
    sides: (["partner_a", "partner_b", "both", "other"] as const)
      .filter((side) => guestOptions.some((g) => g.side === side))
      .map((side) => ({ side, label: `${sideLabel(side, collaborators.data ?? [])}'s side` })),
    items: (items.data ?? []).map((i) => ({ id: i.id, title: i.title, startsAt: i.starts_at, endsAt: i.ends_at, location: i.location })),
    sharedWith: (links.data ?? [])
      .filter((l) => l.modules.includes("shot_list"))
      .map((l) => ({ linkId: l.id, label: l.label, sectionId: ((l.module_config as { section_id?: string })?.section_id) ?? null })),
  };
});
