import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { personLoads, type PersonLoad } from "@/lib/people";
import type { PersonRow } from "@/lib/types/database";
import { getLists } from "./lists";

/**
 * Everyone a task can be handed to who isn't one of the two collaborators
 * (spec 39). Removed people are included — a task that still holds one needs
 * its name — and callers filter on `deleted_at` where they offer a choice.
 */
export const getPeople = cache(async (weddingId: string): Promise<PersonRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load people: ${error.message}`);
  return data ?? [];
});

/**
 * The email of each person who has a login, keyed by person id (spec 39 part C).
 * Emails live in Supabase Auth, not in our tables, so this asks the admin API --
 * for the couple's settings screen only, one lookup per person with a login.
 */
export const getPersonEmails = cache(async (people: readonly PersonRow[]): Promise<Record<string, string>> => {
  const withLogin = people.filter((p) => p.user_id && !p.deleted_at);
  if (withLogin.length === 0) return {};
  const admin = createAdminClient();
  const out: Record<string, string> = {};
  await Promise.all(
    withLogin.map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.user_id as string);
      if (data?.user?.email) out[p.id] = data.user.email;
    }),
  );
  return out;
});

/**
 * Jobs on the day and open planning tasks per person, for the People list in
 * Settings (spec 56 §7). Tasks in archived lists don't count, as in every
 * other task view.
 */
export const getPersonLoads = cache(async (weddingId: string): Promise<Record<string, PersonLoad>> => {
  const supabase = await createClient();
  const listIds = (await getLists(weddingId)).map((list) => list.id);
  const [jobs, tasks] = await Promise.all([
    supabase.from("run_sheet_item_assignees").select("person_id").eq("wedding_id", weddingId).not("person_id", "is", null),
    listIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("list_items")
          .select("assigned_person_id")
          .eq("wedding_id", weddingId)
          .not("assigned_person_id", "is", null)
          .neq("status", "done")
          .in("list_id", listIds),
  ]);
  if (jobs.error) throw new Error(`Could not count people's jobs: ${jobs.error.message}`);
  if (tasks.error) throw new Error(`Could not count people's tasks: ${tasks.error.message}`);
  return personLoads(jobs.data ?? [], tasks.data ?? []);
});
