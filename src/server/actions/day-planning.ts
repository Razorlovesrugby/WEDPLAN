"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createUploadUrl, removePaths } from "@/lib/supabase/storage";
import { MODULE_KEY, moduleByKey } from "@/lib/day-links/modules";
import { requireWedding } from "@/server/queries/wedding";
import { fail, ok, type ActionResult } from "./result";

/**
 * The couple's side of helper planning (spec 54 §10.2, §6.10, §6.13, §6.16):
 * reference photos, groups, leads, open tasks, assigning several at once,
 * the cue's Go, announcements and the module switches. Every write checks its
 * Supabase `error`.
 */

const assigneeSchema = z.object({ type: z.enum(["vendor", "guest", "person"]), id: z.string().uuid() });
type Assignee = z.infer<typeof assigneeSchema>;

function revalidate() {
  revalidatePath("/run-sheet");
  revalidatePath("/run-sheet/links");
}

const columnOf = (a: Assignee) => `${a.type}_id` as "vendor_id" | "guest_id" | "person_id";

// ---------------------------------------------------------------------------
// Reference photos and files on a task (§6.10)
// ---------------------------------------------------------------------------
const MAX_ITEM_FILES = 10;
const FILE_MAX_BYTES = 12 * 1024 * 1024;
const FILE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function requestItemFileUpload(
  itemId: string,
  contentType: string,
  byteSize: number,
): Promise<ActionResult<{ path: string; uploadUrl: string }>> {
  const wedding = await requireWedding();
  if (!z.string().uuid().safeParse(itemId).success) return fail("Unknown item");
  const ext = FILE_TYPES[contentType.toLowerCase()];
  if (!ext) return fail("Photos (JPEG, PNG, WebP) or a PDF, please.");
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > FILE_MAX_BYTES) return fail("That file is too big. Anything under 12 MB is fine.");

  const supabase = await createClient();
  const { data: item, error } = await supabase.from("run_sheet_items").select("id").eq("id", itemId).eq("wedding_id", wedding.id).maybeSingle();
  if (error) return fail(error.message);
  if (!item) return fail("That item no longer exists");
  const { count, error: countError } = await supabase
    .from("run_sheet_item_files")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("wedding_id", wedding.id);
  if (countError) return fail(countError.message);
  if ((count ?? 0) >= MAX_ITEM_FILES) return fail(`A task can hold up to ${MAX_ITEM_FILES} photos and files.`);

  const path = `run-sheet/${wedding.id}/${itemId}/${crypto.randomUUID()}.${ext}`;
  const upload = await createUploadUrl(path);
  if (!upload) return fail("Storage isn't reachable. Has scripts/ensure-bucket.mjs been run here?");
  return ok({ path, uploadUrl: upload.signedUrl });
}

export async function confirmItemFile(itemId: string, path: string, mimeType: string, caption?: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  // The path must be one this wedding's item was given by requestItemFileUpload.
  if (!path.startsWith(`run-sheet/${wedding.id}/${itemId}/`) || path.includes("..")) return fail("That file isn't part of this task.");
  if (!FILE_TYPES[mimeType.toLowerCase()]) return fail("That type of file isn't allowed.");
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("run_sheet_item_files")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
    .eq("wedding_id", wedding.id);
  if (countError) return fail(countError.message);
  if ((count ?? 0) >= MAX_ITEM_FILES) return fail(`A task can hold up to ${MAX_ITEM_FILES} photos and files.`);
  const { data, error } = await supabase
    .from("run_sheet_item_files")
    .insert({
      wedding_id: wedding.id,
      item_id: itemId,
      path,
      mime_type: mimeType.toLowerCase(),
      caption: caption?.trim().slice(0, 200) || null,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  revalidate();
  return ok({ id: data.id });
}

export async function deleteItemFile(fileId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: file, error } = await supabase.from("run_sheet_item_files").select("path").eq("id", fileId).eq("wedding_id", wedding.id).maybeSingle();
  if (error) return fail(error.message);
  if (!file) return ok(undefined);
  // The object first, then the row: the other order strands bytes with nothing pointing at them.
  const removed = await removePaths([file.path]);
  if (!removed.ok) return fail(removed.error ?? "Couldn't remove the file");
  const { error: deleteError } = await supabase.from("run_sheet_item_files").delete().eq("id", fileId).eq("wedding_id", wedding.id);
  if (deleteError) return fail(deleteError.message);
  revalidate();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Groups (§10.2)
// ---------------------------------------------------------------------------
const groupSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name").max(60),
  members: z.array(assigneeSchema).max(100),
});

/** Saves a group and its members. Later changes never touch tasks already assigned. */
export async function saveGroup(groupId: string | null, input: { name: string; members: Assignee[] }): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the group");
  const supabase = await createClient();

  let id = groupId;
  if (id) {
    const { error } = await supabase.from("helper_groups").update({ name: parsed.data.name }).eq("id", id).eq("wedding_id", wedding.id);
    if (error) return fail(error.code === "23505" ? "You already have a group with that name" : error.message);
  } else {
    const { data: last } = await supabase.from("helper_groups").select("sort_order").eq("wedding_id", wedding.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("helper_groups")
      .insert({ wedding_id: wedding.id, name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error) return fail(error.code === "23505" ? "You already have a group with that name" : error.message);
    id = data.id;
  }

  const { error: clearError } = await supabase.from("helper_group_members").delete().eq("group_id", id).eq("wedding_id", wedding.id);
  if (clearError) return fail(clearError.message);
  if (parsed.data.members.length > 0) {
    const { error } = await supabase.from("helper_group_members").insert(
      parsed.data.members.map((m) => ({
        wedding_id: wedding.id,
        group_id: id!,
        vendor_id: m.type === "vendor" ? m.id : null,
        guest_id: m.type === "guest" ? m.id : null,
        person_id: m.type === "person" ? m.id : null,
      })),
    );
    if (error) return fail(error.message);
  }
  revalidate();
  return ok({ id });
}

export async function deleteGroup(groupId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("helper_groups").delete().eq("id", groupId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

/** Adds each member of a group to a task as their own assignee, so each has their own Done. */
export async function assignGroup(itemId: string, groupId: string): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: members, error } = await supabase.from("helper_group_members").select("*").eq("group_id", groupId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  const assignees: Assignee[] = (members ?? []).flatMap((m): Assignee[] =>
    m.vendor_id ? [{ type: "vendor", id: m.vendor_id }] : m.guest_id ? [{ type: "guest", id: m.guest_id }] : m.person_id ? [{ type: "person", id: m.person_id }] : [],
  );
  let added = 0;
  for (const a of assignees) {
    const r = await addAssignee(itemId, a);
    if (!r.ok) return r;
    added += r.data.added;
  }
  revalidate();
  return ok({ added });
}

async function addAssignee(itemId: string, a: Assignee): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("run_sheet_item_assignees")
    .select("id")
    .eq("item_id", itemId)
    .eq("wedding_id", wedding.id)
    .eq(columnOf(a), a.id)
    .maybeSingle();
  if (error) return fail(error.message);
  if (existing) return ok({ added: 0 });
  const { error: insertError } = await supabase.from("run_sheet_item_assignees").insert({
    wedding_id: wedding.id,
    item_id: itemId,
    vendor_id: a.type === "vendor" ? a.id : null,
    guest_id: a.type === "guest" ? a.id : null,
    person_id: a.type === "person" ? a.id : null,
  });
  if (insertError) return fail(insertError.message);
  return ok({ added: 1 });
}

/** One person onto several tasks at once: "Assign to…" in the list, and "+ Assign a task" on their page. */
export async function assignToItems(itemIds: string[], assignee: Assignee): Promise<ActionResult<{ added: number }>> {
  await requireWedding();
  const ids = z.array(z.string().uuid()).min(1).max(100).safeParse(itemIds);
  const who = assigneeSchema.safeParse(assignee);
  if (!ids.success || !who.success) return fail("Pick at least one task");
  let added = 0;
  for (const id of ids.data) {
    const r = await addAssignee(id, who.data);
    if (!r.ok) return r;
    added += r.data.added;
  }
  revalidate();
  return ok({ added });
}

export async function removeAssignee(itemId: string, assignee: Assignee): Promise<ActionResult> {
  const wedding = await requireWedding();
  const who = assigneeSchema.safeParse(assignee);
  if (!who.success) return fail("Unknown person");
  const supabase = await createClient();
  const { error } = await supabase
    .from("run_sheet_item_assignees")
    .delete()
    .eq("item_id", itemId)
    .eq("wedding_id", wedding.id)
    .eq(columnOf(who.data), who.data.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

/** Marks one assignee the lead (or clears it). One lead per task. */
export async function setLead(itemId: string, assignee: Assignee | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from("run_sheet_item_assignees")
    .update({ is_lead: false })
    .eq("item_id", itemId)
    .eq("wedding_id", wedding.id)
    .eq("is_lead", true);
  if (clearError) return fail(clearError.message);
  if (assignee) {
    const who = assigneeSchema.safeParse(assignee);
    if (!who.success) return fail("Unknown person");
    const { data, error } = await supabase
      .from("run_sheet_item_assignees")
      .update({ is_lead: true })
      .eq("item_id", itemId)
      .eq("wedding_id", wedding.id)
      .eq(columnOf(who.data), who.data.id)
      .select("id");
    if (error) return fail(error.message);
    if (!data?.length) return fail("They aren't on this task");
  }
  revalidate();
  return ok(undefined);
}

/** Opens a task to a group with a number of places, or closes it again. */
export async function setItemOpen(itemId: string, groupId: string | null, places: number | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  if (groupId) {
    const n = z.number().int().min(1).max(20).safeParse(places);
    if (!n.success) return fail("Places are 1 to 20");
    const { error } = await supabase.from("run_sheet_items").update({ open_to_group_id: groupId, open_places: n.data }).eq("id", itemId).eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  } else {
    const { error } = await supabase.from("run_sheet_items").update({ open_to_group_id: null, open_places: null }).eq("id", itemId).eq("wedding_id", wedding.id);
    if (error) return fail(error.message);
  }
  revalidate();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Cues (§6.16): the master's Go
// ---------------------------------------------------------------------------
export async function callCue(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("run_sheet_items")
    .update({ cue_called_at: now })
    .eq("id", itemId)
    .eq("wedding_id", wedding.id)
    .eq("is_cue", true)
    .select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("That task isn't a cue");
  const { error: activityError } = await supabase
    .from("day_activity")
    .insert({ wedding_id: wedding.id, item_id: itemId, kind: "cue_go", payload: {}, tapped_at: now });
  if (activityError) return fail(activityError.message);
  revalidate();
  return ok(undefined);
}

/** Resets a cue (a rehearsal, or a mis-tap) so it can be called again. */
export async function resetCue(itemId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("run_sheet_items").update({ cue_called_at: null }).eq("id", itemId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Announcements (§6.13)
// ---------------------------------------------------------------------------
const announcementSchema = z.object({
  audience: z.enum(["everyone", "group", "link"]),
  groupId: z.string().uuid().nullable().optional(),
  linkId: z.string().uuid().nullable().optional(),
  text: z.string().trim().min(1, "Write the message").max(500),
  important: z.boolean().optional(),
});

export async function sendAnnouncement(input: z.input<typeof announcementSchema>): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the message");
  const f = parsed.data;
  if (f.audience === "group" && !f.groupId) return fail("Pick a group");
  if (f.audience === "link" && !f.linkId) return fail("Pick a person");
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("day_announcements")
    .insert({
      wedding_id: wedding.id,
      audience: f.audience,
      group_id: f.audience === "group" ? f.groupId! : null,
      link_id: f.audience === "link" ? f.linkId! : null,
      text: f.text,
      important: f.important ?? false,
      sent_by: user.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return fail(error.message);
  revalidate();
  return ok({ id: data.id });
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("day_announcements").delete().eq("id", id).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Link settings: modules, the day-before email, Good to know order
// ---------------------------------------------------------------------------
export async function setLinkModules(linkId: string, keys: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();
  const clean = [...new Set(keys)];
  for (const key of clean) {
    if (!MODULE_KEY.test(key) || !moduleByKey(key)) return fail("That module isn't available");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("day_links").update({ modules: clean }).eq("id", linkId).eq("wedding_id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

export async function setDayBeforeEmail(on: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase.from("weddings").update({ day_before_email: on }).eq("id", wedding.id);
  if (error) return fail(error.message);
  revalidate();
  return ok(undefined);
}

export async function moveInfoSection(sectionId: string, direction: "up" | "down"): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { data, error } = await supabase.from("day_info_sections").select("id").eq("wedding_id", wedding.id).order("sort_order").order("created_at");
  if (error) return fail(error.message);
  const order = (data ?? []).map((r) => r.id);
  const i = order.indexOf(sectionId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length) return ok(undefined);
  [order[i], order[j]] = [order[j]!, order[i]!];
  for (const [index, id] of order.entries()) {
    const { error: updateError } = await supabase.from("day_info_sections").update({ sort_order: index + 1 }).eq("id", id).eq("wedding_id", wedding.id);
    if (updateError) return fail(updateError.message);
  }
  revalidate();
  return ok(undefined);
}
