"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { DEFAULT_NOTE_LABELS } from "@/lib/site/dress-codes";
import { fail, ok, type ActionResult } from "./result";

/**
 * Dress codes (spec 25 §4).
 *
 * A code is a record, and the events wearing it are a relationship rather than
 * a typed list — which is why "which events does this cover" is set here, by
 * writing `events.dress_code_id`, instead of being a text field on the code
 * that somebody has to remember to update.
 */

const nameSchema = z.string().trim().min(1, "A dress code needs a name").max(120);

export async function createDressCode(name: string): Promise<ActionResult<{ id: string }>> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);

  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("dress_codes")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("dress_codes")
    .insert({
      wedding_id: wedding.id,
      name: parsed.data,
      sort_order: (last?.sort_order ?? 0) + 10,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  // Pre-filled with the two labels most couples want (spec 25 Answered,
  // question 1). They are CONTENT — rename them, delete one, add a third —
  // which is the whole reason they are rows rather than columns.
  const { error: noteError } = await supabase.from("dress_code_notes").insert(
    DEFAULT_NOTE_LABELS.map((label, index) => ({
      wedding_id: wedding.id,
      dress_code_id: data.id,
      label,
      sort_order: (index + 1) * 10,
    })),
  );
  if (noteError) return fail(noteError.message);

  revalidatePath("/site/attire");
  return ok({ id: data.id });
}

export async function renameDressCode(id: string, name: string): Promise<ActionResult> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);

  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dress_codes")
    .update({ name: parsed.data })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/attire");
  return ok(undefined);
}

export async function setDressCodeBoard(id: string, boardId: string | null): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dress_codes")
    .update({ board_id: boardId })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/attire");
  return ok(undefined);
}

/**
 * Deleting a code leaves every event that wore it without one.
 *
 * The FK is `on delete set null (dress_code_id)` — column-specific, because a
 * plain `set null` on a composite key would null `wedding_id` too and detach
 * the event from its wedding.
 */
export async function deleteDressCode(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dress_codes")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/attire");
  revalidatePath("/events");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const noteSchema = z.object({
  label: z.string().trim().min(1, "A note needs a label").max(80),
  body: z.string().trim().max(4000).optional(),
  boardId: z.string().uuid().nullable().optional(),
});

export async function addNote(dressCodeId: string, label: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("dress_code_notes")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .eq("dress_code_id", dressCodeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("dress_code_notes").insert({
    wedding_id: wedding.id,
    dress_code_id: dressCodeId,
    label: label.trim() || "For everyone",
    sort_order: (last?.sort_order ?? 0) + 10,
  });

  if (error) return fail(error.message);
  revalidatePath("/site/attire");
  return ok(undefined);
}

export async function saveNote(id: string, fields: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(fields);
  if (!parsed.success) return fail(parsed.error.issues[0]!.message);

  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dress_code_notes")
    .update({
      label: parsed.data.label,
      body: parsed.data.body || null,
      board_id: parsed.data.boardId ?? null,
    })
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/attire");
  return ok(undefined);
}

export async function deleteNote(id: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();
  const { error } = await supabase
    .from("dress_code_notes")
    .delete()
    .eq("wedding_id", wedding.id)
    .eq("id", id);

  if (error) return fail(error.message);
  revalidatePath("/site/attire");
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Which events wear it
// ---------------------------------------------------------------------------

/**
 * Set (or clear) the code on one event.
 *
 * This is the only write that decides coverage. The attire section's "For
 * Welcome Dinner, Farewell Brunch" line is read back off these rows, so it
 * cannot drift from the tag the schedule prints on the event itself.
 */
export async function setEventDressCode(
  eventId: string,
  dressCodeId: string | null,
): Promise<ActionResult> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { error } = await supabase
    .from("events")
    .update({ dress_code_id: dressCodeId })
    .eq("wedding_id", wedding.id)
    .eq("id", eventId);

  if (error) return fail(error.message);
  revalidatePath("/site/attire");
  revalidatePath("/events");
  return ok(undefined);
}
