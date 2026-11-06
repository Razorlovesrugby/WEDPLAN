import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PersonRow } from "@/lib/types/database";

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
