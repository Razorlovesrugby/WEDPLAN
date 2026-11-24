"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestName } from "@/lib/format";
import { clampTapTime } from "@/lib/day-links/state";
import { signPaths } from "@/lib/supabase/storage";
import { personKey, type ShotItem, type ShotPerson } from "@/lib/shots/model";
import { resolveDayLink, type ResolvedDayLink } from "@/server/day-links/resolve";
import { fail, ok, type ActionResult } from "./result";

/**
 * The Shot list module of a day link (spec 52 §5). Read: one query scoped to
 * the link's wedding and, for a wrangler link, one section. Write: a shot's
 * status, nothing else, by tap time, so a replayed tap from the offline queue
 * can never undo a newer one. Other guests appear by display name only, and
 * the only guest note shown is `vendor_note`.
 */

const REFUSED: Record<string, string> = {
  throttled: "Too many tries. Wait a few minutes and try again.",
  expired: "This link has stopped working.",
  off: "This link has been turned off.",
};

async function authorise(token: string): Promise<{ ctx: ResolvedDayLink; sectionId: string | null } | ActionResult<never>> {
  if (typeof token !== "string" || token.length < 40 || token.length > 64) return fail("This link isn't valid.");
  const resolved = await resolveDayLink(token);
  if (!resolved.ok) return fail(REFUSED[resolved.reason] ?? "This link isn't valid.");
  const { link } = resolved.context;
  if (!link.modules.includes("shot_list")) return fail("The shot list isn't switched on for this link.");
  const sectionId = (link.module_config as { shot_list?: { section_id?: string }; section_id?: string })?.shot_list?.section_id
    ?? (link.module_config as { section_id?: string })?.section_id
    ?? null;
  return { ctx: resolved.context, sectionId };
}

export type ShotModuleSection = {
  id: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  shots: ShotItem[];
};

export type ShotFace = {
  id: string;
  name: string;
  relationship: string | null;
  vendorNote: string | null;
  photoUrl: string | null;
  /** Titles of the shots they are in. */
  shots: string[];
};

export type ShotModuleData = { sections: ShotModuleSection[]; faces: ShotFace[]; timeZone: string; loadedAt: string };

export async function loadShotModule(token: string): Promise<ActionResult<ShotModuleData>> {
  const auth = await authorise(token);
  if (!("ctx" in auth)) return auth;
  const { ctx, sectionId } = auth;
  const supabase = createAdminClient();
  const weddingId = ctx.wedding.id;

  let sectionQuery = supabase.from("shot_sections").select("*").eq("wedding_id", weddingId).order("sort_order").order("created_at");
  if (sectionId) sectionQuery = sectionQuery.eq("id", sectionId);
  const sections = await sectionQuery;
  if (sections.error) return fail(sections.error.message);
  const sectionIds = (sections.data ?? []).map((s) => s.id);
  if (sectionIds.length === 0) return ok({ sections: [], faces: [], timeZone: ctx.wedding.timezone, loadedAt: new Date().toISOString() });

  const shots = await supabase.from("shots").select("*").eq("wedding_id", weddingId).in("section_id", sectionIds).order("sort_order").order("created_at");
  if (shots.error) return fail(shots.error.message);
  const shotIds = (shots.data ?? []).map((s) => s.id);
  const shotPeople = shotIds.length
    ? await supabase.from("shot_people").select("*").eq("wedding_id", weddingId).in("shot_id", shotIds).order("sort_order")
    : { data: [], error: null };
  if (shotPeople.error) return fail(shotPeople.error.message);

  const guestIds = [...new Set((shotPeople.data ?? []).map((p) => p.guest_id).filter((x): x is string => !!x))];
  const personIds = [...new Set((shotPeople.data ?? []).map((p) => p.person_id).filter((x): x is string => !!x))];
  const itemIds = (sections.data ?? []).map((s) => s.run_sheet_item_id).filter((x): x is string => !!x);
  const [guests, people, items] = await Promise.all([
    guestIds.length
      ? supabase.from("guests").select("id, first_name, last_name, preferred_name, relationship, vendor_note, photo_path").eq("wedding_id", weddingId).is("deleted_at", null).in("id", guestIds)
      : Promise.resolve({ data: [], error: null }),
    personIds.length ? supabase.from("people").select("id, name").eq("wedding_id", weddingId).is("deleted_at", null).in("id", personIds) : Promise.resolve({ data: [], error: null }),
    itemIds.length ? supabase.from("run_sheet_items").select("id, starts_at, ends_at, location").eq("wedding_id", weddingId).in("id", itemIds) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [guests, people, items]) if (r.error) return fail(r.error.message);

  const guestById = new Map((guests.data ?? []).map((g) => [g.id, g]));
  const personById = new Map((people.data ?? []).map((p) => [p.id, p.name]));
  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));

  const peopleByShot = new Map<string, ShotPerson[]>();
  for (const sp of shotPeople.data ?? []) {
    let who: ShotPerson | null = null;
    if (sp.guest_id) {
      const g = guestById.get(sp.guest_id);
      if (g) who = { key: personKey("guest", g.id), kind: "guest", id: g.id, name: guestName(g) };
    } else if (sp.person_id) {
      const n = personById.get(sp.person_id);
      if (n) who = { key: personKey("person", sp.person_id), kind: "person", id: sp.person_id, name: n };
    } else if (sp.role) who = { key: personKey("role", sp.role), kind: "role", role: sp.role, name: sp.role };
    if (who) peopleByShot.set(sp.shot_id, [...(peopleByShot.get(sp.shot_id) ?? []), who]);
  }

  const refs = await signPaths((shots.data ?? []).map((s) => s.reference_path).filter((p): p is string => !!p));
  const shotItems: ShotItem[] = (shots.data ?? []).map((s) => ({
    id: s.id,
    sectionId: s.section_id,
    title: s.title,
    kind: s.kind,
    mustHave: s.must_have,
    minutes: s.minutes,
    note: s.note,
    shooter: s.shooter,
    referenceUrl: s.reference_path ? (refs.get(s.reference_path) ?? null) : null,
    sortOrder: s.sort_order,
    status: s.status,
    statusAt: s.status_at,
    statusBy: s.status_by,
    people: peopleByShot.get(s.id) ?? [],
  }));

  const facePhotos = await signPaths((guests.data ?? []).map((g) => g.photo_path).filter((p): p is string => !!p));
  const faces: ShotFace[] = (guests.data ?? [])
    .filter((g) => g.photo_path || g.relationship)
    .map((g) => ({
      id: g.id,
      name: guestName(g),
      relationship: g.relationship,
      vendorNote: g.vendor_note,
      photoUrl: g.photo_path ? (facePhotos.get(g.photo_path) ?? null) : null,
      shots: shotItems.filter((s) => s.people.some((p) => p.kind === "guest" && p.id === g.id)).map((s) => s.title),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  return ok({
    sections: (sections.data ?? []).map((sec) => {
      const item = sec.run_sheet_item_id ? itemById.get(sec.run_sheet_item_id) : undefined;
      return {
        id: sec.id,
        name: sec.name,
        location: item ? item.location : sec.location,
        startsAt: item?.starts_at ?? null,
        endsAt: item?.ends_at ?? null,
        shots: shotItems.filter((s) => s.sectionId === sec.id),
      };
    }),
    faces,
    timeZone: ctx.wedding.timezone,
    loadedAt: new Date().toISOString(),
  });
}

const statusSchema = z.enum(["todo", "taken", "skipped", "later"]);

/** The module's only write: the status a tap sets (never "toggle"), with the time of the tap. */
export async function setShotStatus(token: string, shotId: string, status: "todo" | "taken" | "skipped" | "later", tappedAtInput?: string): Promise<ActionResult<{ applied: boolean }>> {
  const auth = await authorise(token);
  if (!("ctx" in auth)) return auth;
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success || !z.string().uuid().safeParse(shotId).success) return fail("That isn't a valid tap.");
  const { ctx, sectionId } = auth;
  const supabase = createAdminClient();
  const tappedAt = clampTapTime(tappedAtInput);

  const { data: shot, error: readError } = await supabase.from("shots").select("id, title, section_id, status, status_at").eq("id", shotId).eq("wedding_id", ctx.wedding.id).maybeSingle();
  if (readError) return fail(readError.message);
  if (!shot) return fail("That shot no longer exists.");
  if (sectionId && shot.section_id !== sectionId) return fail("That shot isn't on your link.");

  // Latest tap wins: a replayed tap older than the status can't undo a newer one.
  if (shot.status_at && Date.parse(tappedAt) <= Date.parse(shot.status_at)) return ok({ applied: false });

  let update = supabase
    .from("shots")
    .update({ status: parsed.data, status_at: tappedAt, status_by: ctx.link.label })
    .eq("id", shotId)
    .eq("wedding_id", ctx.wedding.id);
  update = shot.status_at ? update.eq("status_at", shot.status_at) : update.is("status_at", null);
  const { data: updated, error } = await update.select("id");
  if (error) return fail(error.message);
  if (!updated?.length) return ok({ applied: false });

  const { error: activityError } = await supabase.from("day_activity").insert({
    wedding_id: ctx.wedding.id,
    link_id: ctx.link.id,
    vendor_id: ctx.link.vendor_id,
    guest_id: ctx.link.guest_id,
    person_id: ctx.link.person_id,
    kind: `shot_${parsed.data}`,
    payload: { shot_id: shot.id, title: shot.title },
    tapped_at: tappedAt,
  });
  if (activityError) return fail(activityError.message);
  return ok({ applied: true });
}
