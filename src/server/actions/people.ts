"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { cleanPersonName } from "@/lib/people";
import { fail, ok, type ActionResult } from "./result";

/**
 * People you can hand a task to (spec 39). A person is a name; whether they
 * can sign in is part C and lives in `people-access.ts`. Removing is a soft
 * delete: their tasks keep their name, and the audit log keeps the row.
 */

function revalidatePeople() {
  revalidatePath("/settings");
  revalidatePath("/lists", "layout");
  revalidatePath("/calendar");
  revalidatePath("/timeline");
  revalidatePath("/board");
  revalidatePath("/");
}

export async function addPerson(name: string): Promise<ActionResult<{ id: string }>> {
  const wedding = await requireWedding();
  const clean = cleanPersonName(name);
  if (!clean) return fail("Give them a name (up to 80 characters)");

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("people")
    .select("sort_order")
    .eq("wedding_id", wedding.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("people")
    .insert({ wedding_id: wedding.id, name: clean, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(error.message);

  revalidatePeople();
  return ok({ id: data.id });
}

export async function renamePerson(personId: string, name: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!z.string().uuid().safeParse(personId).success) return fail("Unknown person");
  const clean = cleanPersonName(name);
  if (!clean) return fail("Give them a name (up to 80 characters)");

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ name: clean })
    .eq("id", personId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePeople();
  return ok(undefined);
}

/**
 * Soft delete. A person who can sign in cannot be removed until their access
 * is taken away first — otherwise removing a row would leave a live login with
 * no screen that mentions it.
 */
export async function removePerson(personId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!z.string().uuid().safeParse(personId).success) return fail("Unknown person");

  const supabase = await createClient();
  const { data: person, error: readError } = await supabase
    .from("people")
    .select("access")
    .eq("id", personId)
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (readError) return fail(readError.message);
  if (!person) return fail("That person no longer exists");
  if (person.access !== "none") return fail("Take away their access first, then remove them");

  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", personId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePeople();
  return ok(undefined);
}

export async function restorePerson(personId: string): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!z.string().uuid().safeParse(personId).success) return fail("Unknown person");

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ deleted_at: null })
    .eq("id", personId)
    .eq("wedding_id", wedding.id);
  if (error) return fail(error.message);

  revalidatePeople();
  return ok(undefined);
}
