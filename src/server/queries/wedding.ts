import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CollaboratorRow, WeddingRow, WeddingStatsView } from "@/lib/types/database";

/**
 * `cache()` deduplicates within a single render pass, so a layout and three
 * components can each ask for the current wedding and only one query runs.
 */

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The wedding this user is planning.
 *
 * V1 is one wedding per couple, so this takes the first — but it selects
 * through RLS rather than assuming, which means the multi-wedding case in V4
 * is a UI change rather than a security review.
 */
export const getCurrentWedding = cache(async (): Promise<WeddingRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weddings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not load wedding: ${error.message}`);
  return data;
});

/** For pages that are meaningless without a wedding. Redirects rather than throwing. */
export async function requireWedding(): Promise<WeddingRow> {
  const wedding = await getCurrentWedding();
  if (!wedding) redirect("/setup");
  return wedding;
}

export const getWeddingStats = cache(async (weddingId: string): Promise<WeddingStatsView | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_wedding_stats")
    .select("*")
    .eq("wedding_id", weddingId)
    .maybeSingle();

  if (error) throw new Error(`Could not load stats: ${error.message}`);
  return data;
});

export const getEvents = cache(async (weddingId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order", { ascending: true })
    .order("starts_at", { ascending: true });

  if (error) throw new Error(`Could not load events: ${error.message}`);
  return data ?? [];
});

/**
 * Both collaborators. Used to label "assign to" pickers on the lists
 * feature — by role (owner/partner), never by email: auth.users lives
 * outside the `public` schema PostgREST exposes, and this app has never
 * needed a profile table to display who's who before now.
 */
export const getCollaborators = cache(async (weddingId: string): Promise<CollaboratorRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("collaborators").select("*").eq("wedding_id", weddingId);

  if (error) throw new Error(`Could not load collaborators: ${error.message}`);
  return data ?? [];
});

export const getTags = cache(async (weddingId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("name", { ascending: true });

  if (error) throw new Error(`Could not load tags: ${error.message}`);
  return data ?? [];
});
