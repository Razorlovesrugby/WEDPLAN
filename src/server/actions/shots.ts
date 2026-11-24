"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import { DEFAULT_MINUTES } from "@/lib/shots/model";
import { inputKey, mergePeople } from "@/lib/shots/people";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * The couple's side of the shot list (spec 52 §6). Every write checks its
 * Supabase `error`. The photographer's one write, a shot's status, is in
 * `shot-module.ts` because it goes through a day link's token instead.
 */

function revalidate() {
  revalidatePath("/shots");
}

const idSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
const sectionSchema = z.object({
  name: z.string().trim().min(1, "Give the section a name").max(80),
  location: z.string().trim().max(200).optional(),
  runSheetItemId: idSchema.nullable().optional(),
});

/**
 * Linking a section to a run sheet item makes the section take that item's
 * time and place, and makes the item open the shot list on My day (§7).
 */
export async function saveSection(
  sectionId: string | null,
  input: z.input<typeof sectionSchema>,
): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the section");
  const f = parsed.data;
  const supabase = await createClient();

  let previousItem: string | null = null;
  let id = sectionId;
  if (id) {
    const { data: before, error } = await supabase.from("shot_sections").select("run_sheet_item_id").eq("id", id).eq("wedding_id", wedding.id).maybeSingle();
    if (error) return fail(error.message);
    if (!before) return fail("That section no longer exists");
    previousItem = before.run_sheet_item_id;
    const { error: updateError } = await supabase
      .from("shot_sections")
      .update({ name: f.name, location: f.location || null, run_sheet_item_id: f.runSheetItemId ?? null })
      .eq("id", id)
      .eq("wedding_id", wedding.id);
    if (updateError) return fail(updateError.message);
  } else {
    const { data: last } = await supabase.from("shot_sections").select("sort_order").eq("wedding_id", wedding.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("shot_sections")
      .insert({ wedding_id: wedding.id, name: f.name, location: f.location || null, run_sheet_item_id: f.runSheetItemId ?? null, sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error) return fail(error.message);
    id = data.id;
  }

  // Keep the run sheet items' "Opens" in step with the link.
  if (previousItem && previousItem !== (f.runSheetItemId ?? null)) {
    const { error } = await supabase
      .from("run_sheet_items")
      .update({ opens_module: null, opens_config: null })
      .eq("id", previousItem)
      .eq("wedding_id", wedding.id)
      .eq("opens_module", "shot_list");
    if (error) return fail(error.message);
  }
  if (f.runSheetItemId) {
    const { error } = await supabase
      .from("run_sheet_items")
      .update({ opens_module: "shot_list", opens_config: { section_id: id } })
      .eq("id", f.runSheetItemId)
      .eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }
  revalidate();
  revalidatePath("/run-sheet");
  return ok({ id: id! });
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: sec, error: readError } = await supabase.from("shot_sections").select("run_sheet_item_id").eq("id", sectionId).eq("wedding_id", wedding.id).maybeSingle();
  if (readError) return fail(readError.message);
  if (sec?.run_sheet_item_id) {
    const { error } = await supabase.from("run_sheet_items").update({ opens_module: null, opens_config: null }).eq("id", sec.run_sheet_item_id).eq("wedding_id", wedding.id).eq("opens_module", "shot_list");
    if (error) return fail(error.message);
  }
  const { error } = await supabase.from("shot_sections").delete().eq("id", sectionId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

async function swap(table: "shot_sections" | "shots", ids: string[], id: string, direction: "up" | "down", weddingId: string): Promise<ActionResult> {
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return ok(undefined);
  const order = [...ids];
  [order[i], order[j]] = [order[j]!, order[i]!];
  return writeOrder(table, order, weddingId);
}

async function writeOrder(table: "shot_sections" | "shots", order: string[], weddingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  for (const [index, id] of order.entries()) {
    const { error } = await supabase.from(table).update({ sort_order: index + 1 }).eq("id", id).eq("wedding_id", weddingId);
    if (error) return fail(error.message);
  }
  revalidate();
  return ok(undefined);
}

export async function moveSection(sectionId: string, direction: "up" | "down"): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data, error } = await supabase.from("shot_sections").select("id").eq("wedding_id", wedding.id).order("sort_order").order("created_at");
  if (error) return fail(error.message);
  return swap("shot_sections", (data ?? []).map((r) => r.id), sectionId, direction, wedding.id);
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------
const personInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("guest"), id: idSchema }),
  z.object({ kind: z.literal("person"), id: idSchema }),
  z.object({ kind: z.literal("role"), role: z.string().trim().min(1).max(80) }),
]);
export type ShotPersonInput = z.infer<typeof personInput>;

const shotSchema = z.object({
  title: z.string().trim().min(1, "Give the shot a title").max(160),
  kind: z.enum(["group", "moment", "detail", "portrait"]).default("group"),
  mustHave: z.boolean().default(false),
  minutes: z.number().int().min(0).max(120).optional(),
  note: z.string().trim().max(500).optional(),
  shooter: z.enum(["lead", "second"]).nullable().optional(),
  people: z.array(personInput).max(60).default([]),
});
export type ShotInput = z.input<typeof shotSchema>;

async function writePeople(shotId: string, weddingId: string, people: ShotPersonInput[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { error: clearError } = await supabase.from("shot_people").delete().eq("shot_id", shotId).eq("wedding_id", weddingId);
  if (clearError) return fail(clearError.message);
  const seen = new Set<string>();
  const rows = people.flatMap((p, i) => {
    const key = p.kind === "role" ? `r:${p.role.toLowerCase()}` : `${p.kind}:${p.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      wedding_id: weddingId,
      shot_id: shotId,
      guest_id: p.kind === "guest" ? p.id : null,
      person_id: p.kind === "person" ? p.id : null,
      role: p.kind === "role" ? p.role : null,
      sort_order: i,
    }];
  });
  if (rows.length > 0) {
    const { error } = await supabase.from("shot_people").insert(rows);
    if (error) return fail(error.message);
  }
  return ok(undefined);
}

export async function saveShot(shotId: string | null, sectionId: string, input: ShotInput): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  if (!idSchema.safeParse(sectionId).success) return fail("Unknown section");
  const parsed = shotSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the shot");
  const f = parsed.data;
  const supabase = await createClient();
  const patch = {
    title: f.title,
    kind: f.kind,
    must_have: f.mustHave,
    minutes: f.minutes ?? DEFAULT_MINUTES[f.kind],
    note: f.note || null,
    shooter: f.shooter ?? null,
  };

  let id = shotId;
  if (id) {
    const { error } = await supabase.from("shots").update({ ...patch, section_id: sectionId }).eq("id", id).eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  } else {
    const { data: last } = await supabase.from("shots").select("sort_order").eq("section_id", sectionId).eq("wedding_id", wedding.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("shots")
      .insert({ ...patch, wedding_id: wedding.id, section_id: sectionId, sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error) return fail(error.message);
    id = data.id;
  }
  const people = await writePeople(id!, wedding.id, f.people);
  if (!people.ok) return people;
  revalidate();
  return ok({ id: id! });
}

/**
 * A copy of a shot straight after the original (spec 58 §3.1): same title,
 * kind, people, minutes, note and shooter. Not must-have, not taken, no
 * reference image. Guests deleted since are left out.
 */
export async function duplicateShot(shotId: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  if (!idSchema.safeParse(shotId).success) return fail("Unknown shot");
  const supabase = await createClient();
  const { data: shot, error } = await supabase.from("shots").select("*").eq("id", shotId).eq("wedding_id", wedding.id).maybeSingle();
  if (error) return fail(error.message);
  if (!shot) return fail("That shot no longer exists");
  const [links, siblings, guests] = await Promise.all([
    supabase.from("shot_people").select("guest_id, person_id, role").eq("shot_id", shotId).eq("wedding_id", wedding.id).order("sort_order"),
    supabase.from("shots").select("id").eq("section_id", shot.section_id).eq("wedding_id", wedding.id).order("sort_order").order("created_at"),
    supabase.from("guests").select("id").eq("wedding_id", wedding.id).is("deleted_at", null),
  ]);
  for (const r of [links, siblings, guests]) if (r.error) return fail(r.error.message);
  const live = new Set((guests.data ?? []).map((g) => g.id));
  const people: ShotPersonInput[] = (links.data ?? []).flatMap((l): ShotPersonInput[] =>
    l.guest_id ? (live.has(l.guest_id) ? [{ kind: "guest", id: l.guest_id }] : []) : l.person_id ? [{ kind: "person", id: l.person_id }] : l.role ? [{ kind: "role", role: l.role }] : [],
  );
  const { data: created, error: insertError } = await supabase
    .from("shots")
    .insert({
      wedding_id: wedding.id,
      section_id: shot.section_id,
      title: shot.title,
      kind: shot.kind,
      must_have: false,
      minutes: shot.minutes,
      note: shot.note,
      shooter: shot.shooter,
      sort_order: (siblings.data?.length ?? 0) + 1000,
    })
    .select("id")
    .single();
  if (insertError) return fail(insertError.message);
  const written = await writePeople(created.id, wedding.id, people);
  if (!written.ok) {
    await supabase.from("shots").delete().eq("id", created.id).eq("wedding_id", wedding.id);
    return written;
  }
  const order = (siblings.data ?? []).map((r) => r.id);
  order.splice(order.indexOf(shotId) + 1, 0, created.id);
  const ordered = await writeOrder("shots", order, wedding.id);
  if (!ordered.ok) return ordered;
  return ok({ id: created.id });
}

/** Adds the same people to every ticked shot, skipping anyone already in it (spec 58 §3.5). One insert, so all or none. */
export async function addPeopleToShots(shotIds: string[], people: ShotPersonInput[]): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const ids = z.array(idSchema).min(1).max(200).safeParse(shotIds);
  const who = z.array(personInput).min(1).max(60).safeParse(people);
  if (!ids.success || !who.success) return fail("Pick at least one shot and one person");
  const supabase = await createClient();
  const { data, error } = await supabase.from("shot_people").select("shot_id, guest_id, person_id, role, sort_order").in("shot_id", ids.data).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  const { data: owned, error: ownedError } = await supabase.from("shots").select("id").in("id", ids.data).eq("wedding_id", wedding.id);
  if (ownedError) return fail(ownedError.message);
  const rows = (owned ?? []).flatMap((s) => {
    const there = (data ?? []).filter((r) => r.shot_id === s.id);
    const have = there.map((r): ShotPersonInput => (r.guest_id ? { kind: "guest", id: r.guest_id } : r.person_id ? { kind: "person", id: r.person_id } : { kind: "role", role: r.role ?? "" }));
    const haveKeys = new Set(have.map(inputKey));
    const fresh = mergePeople(have, who.data).filter((p) => !haveKeys.has(inputKey(p)));
    const start = there.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
    return fresh.map((p, i) => ({
      wedding_id: wedding.id,
      shot_id: s.id,
      guest_id: p.kind === "guest" ? p.id : null,
      person_id: p.kind === "person" ? p.id : null,
      role: p.kind === "role" ? p.role : null,
      sort_order: start + i,
    }));
  });
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("shot_people").insert(rows);
    if (insertError) return fail(insertError.message);
  }
  revalidate();
  return ok({ added: rows.length });
}

export async function deleteShot(shotId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: shot } = await supabase.from("shots").select("reference_path").eq("id", shotId).eq("wedding_id", wedding.id).maybeSingle();
  if (shot?.reference_path) await removePaths([shot.reference_path]);
  const { error } = await supabase.from("shots").delete().eq("id", shotId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

export async function moveShot(shotId: string, direction: "up" | "down"): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: shot, error: readError } = await supabase.from("shots").select("section_id").eq("id", shotId).eq("wedding_id", wedding.id).maybeSingle();
  if (readError) return fail(readError.message);
  if (!shot) return fail("That shot no longer exists");
  const { data, error } = await supabase.from("shots").select("id").eq("section_id", shot.section_id).eq("wedding_id", wedding.id).order("sort_order").order("created_at");
  if (error) return fail(error.message);
  return swap("shots", (data ?? []).map((r) => r.id), shotId, direction, wedding.id);
}

/** Moves a shot to another section, at the end. */
export async function moveShotToSection(shotId: string, sectionId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: last } = await supabase.from("shots").select("sort_order").eq("section_id", sectionId).eq("wedding_id", wedding.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("shots").update({ section_id: sectionId, sort_order: (last?.sort_order ?? 0) + 1 }).eq("id", shotId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

/** "Use this order" (§4.4): writes the suggested order. Undo is the previous order, re-sent by the caller. */
export async function applyShotOrder(sectionId: string, orderedIds: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  const ids = z.array(idSchema).max(500).safeParse(orderedIds);
  if (!ids.success) return fail("That order isn't valid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("shots").select("id").eq("section_id", sectionId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  const have = new Set((data ?? []).map((r) => r.id));
  if (ids.data.length !== have.size || !ids.data.every((id) => have.has(id))) return fail("The shots changed. Reload and try again.");
  return writeOrder("shots", ids.data, wedding.id);
}

/** Adds the ticked suggestions from "Suggest groups" (§4.5) to a section as group shots. */
export async function addShotProposals(
  sectionId: string,
  proposals: { title: string; minutes: number; people: ShotPersonInput[] }[],
): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const list = z.array(z.object({ title: z.string().trim().min(1).max(160), minutes: z.number().int().min(0).max(120), people: z.array(personInput).max(60) })).max(40).safeParse(proposals);
  if (!list.success) return fail("Those groups aren't valid");
  let added = 0;
  for (const p of list.data) {
    const r = await saveShot(null, sectionId, { title: p.title, kind: "group", mustHave: false, minutes: p.minutes, people: p.people });
    if (!r.ok) return r;
    added += 1;
  }
  return ok({ added });
}

// ---------------------------------------------------------------------------
// Faces to know (§4.3)
// ---------------------------------------------------------------------------
const faceSchema = z.object({
  relationship: z.string().trim().max(120).optional(),
  vendorNote: z.string().trim().max(300).optional(),
});

export async function setGuestFace(guestId: string, input: { relationship?: string; vendorNote?: string }): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = faceSchema.safeParse(input);
  if (!parsed.success) return fail("Keep the relationship under 120 characters and the note under 300");
  const supabase = await createClient();
  const patch: { relationship?: string | null; vendor_note?: string | null } = {};
  if (parsed.data.relationship !== undefined) patch.relationship = parsed.data.relationship || null;
  if (parsed.data.vendorNote !== undefined) patch.vendor_note = parsed.data.vendorNote || null;
  const { error } = await supabase.from("guests").update(patch).eq("id", guestId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  revalidatePath(`/guests/${guestId}`);
  return ok(undefined);
}

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** A signed upload URL for a guest's face. The path is new each time, so a replaced photo is never served stale from cache. */
export async function requestGuestPhotoUpload(guestId: string, contentType: string, byteSize: number): Promise<ActionResult<{ path: string; uploadUrl: string }>> {
  const wedding = await requireWedding();
  const ext = PHOTO_TYPES[contentType.toLowerCase()];
  if (!ext) return fail("JPEG, PNG or WebP, please.");
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > 6 * 1024 * 1024) return fail("Keep it under 6 MB.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("guests").select("id").eq("id", guestId).eq("wedding_id", wedding.id).is("deleted_at", null).maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("That guest no longer exists");
  const path = `shots/${wedding.id}/${guestId}-${crypto.randomUUID()}.${ext}`;
  const upload = await createUploadUrl(path);
  if (!upload) return fail("Storage isn't reachable. Has scripts/ensure-bucket.mjs been run here?");
  return ok({ path, uploadUrl: upload.signedUrl });
}

export async function confirmGuestPhoto(guestId: string, path: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!path.startsWith(`shots/${wedding.id}/${guestId}-`) || path.includes("..")) return fail("That photo isn't this guest's.");
  const supabase = await createClient();
  const { data: before, error: readError } = await supabase.from("guests").select("photo_path").eq("id", guestId).eq("wedding_id", wedding.id).maybeSingle();
  if (readError) return fail(readError.message);
  const { error } = await supabase.from("guests").update({ photo_path: path }).eq("id", guestId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  if (before?.photo_path && before.photo_path !== path) await removePaths([before.photo_path]);
  revalidate();
  revalidatePath(`/guests/${guestId}`);
  return ok(undefined);
}

export async function removeGuestPhoto(guestId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: before, error: readError } = await supabase.from("guests").select("photo_path").eq("id", guestId).eq("wedding_id", wedding.id).maybeSingle();
  if (readError) return fail(readError.message);
  if (before?.photo_path) {
    const removed = await removePaths([before.photo_path]);
    if (!removed.ok) return fail(removed.error ?? "Couldn't remove the photo");
  }
  const { error } = await supabase.from("guests").update({ photo_path: null }).eq("id", guestId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  revalidatePath(`/guests/${guestId}`);
  return ok(undefined);
}

/** A reference image for a shot, uploaded by the couple (a mood-board pick isn't offered yet). */
export async function requestShotReferenceUpload(shotId: string, contentType: string, byteSize: number): Promise<ActionResult<{ path: string; uploadUrl: string }>> {
  const wedding = await requireWedding();
  const ext = PHOTO_TYPES[contentType.toLowerCase()];
  if (!ext) return fail("JPEG, PNG or WebP, please.");
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > 8 * 1024 * 1024) return fail("Keep it under 8 MB.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("shots").select("id").eq("id", shotId).eq("wedding_id", wedding.id).maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("That shot no longer exists");
  const path = `shots/${wedding.id}/ref-${shotId}-${crypto.randomUUID()}.${ext}`;
  const upload = await createUploadUrl(path);
  if (!upload) return fail("Storage isn't reachable.");
  return ok({ path, uploadUrl: upload.signedUrl });
}

export async function confirmShotReference(shotId: string, path: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!path.startsWith(`shots/${wedding.id}/ref-${shotId}-`) || path.includes("..")) return fail("That image isn't this shot's.");
  const supabase = await createClient();
  const { data: before } = await supabase.from("shots").select("reference_path").eq("id", shotId).eq("wedding_id", wedding.id).maybeSingle();
  const { error } = await supabase.from("shots").update({ reference_path: path }).eq("id", shotId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  if (before?.reference_path && before.reference_path !== path) await removePaths([before.reference_path]);
  revalidate();
  return ok(undefined);
}

export async function removeShotReference(shotId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: before } = await supabase.from("shots").select("reference_path").eq("id", shotId).eq("wedding_id", wedding.id).maybeSingle();
  if (before?.reference_path) await removePaths([before.reference_path]);
  const { error } = await supabase.from("shots").update({ reference_path: null }).eq("id", shotId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

/** The couple can also set a status from their own screen (a correction). */
export async function setShotStatusAsCouple(shotId: string, status: "todo" | "taken" | "skipped" | "later"): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("shots")
    .update({ status, status_at: status === "todo" ? null : new Date().toISOString(), status_by: status === "todo" ? null : "The couple" })
    .eq("id", shotId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}
