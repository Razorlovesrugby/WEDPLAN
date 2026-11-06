import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CollaboratorRow, CutLineRow, WeddingRow, WeddingStatsView } from "@/lib/types/database";

/**
 * `cache()` deduplicates within a single render pass, so a layout and three
 * components can each ask for the current wedding and only one query runs.
 */

/**
 * getClaims() verifies the JWT locally against the project's cached JWKS
 * instead of making a network round trip to the Auth server (falling back
 * to getUser() automatically for older HS256 projects) — this runs on
 * nearly every page and server action, so the network call was showing up
 * as latency on every click.
 */
export const getSessionUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

/**
 * Who is looking (spec 39 part C). "couple" is a collaborator; "planner" is a
 * person with a login and `access = 'planner'` (0044), who is deliberately not a
 * collaborator and so cannot read the `weddings` table at all.
 */
export type ViewerKind = "couple" | "planner";

const loadWedding = cache(async (): Promise<{ wedding: WeddingRow | null; kind: ViewerKind | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weddings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not load wedding: ${error.message}`);
  if (data) return { wedding: data, kind: "couple" };

  // No row through the table: either there is no wedding, or this is a planner,
  // who reads the same row through a view that leaves out `total_budget`. The
  // couple never pay for this second query.
  const { data: basics, error: basicsError } = await supabase
    .from("v_wedding_basics")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (basicsError) throw new Error(`Could not load wedding: ${basicsError.message}`);
  if (basics) return { wedding: { ...basics, total_budget: null }, kind: "planner" };

  return { wedding: null, kind: null };
});

/**
 * The wedding this user is planning.
 *
 * V1 is one wedding per couple, so this takes the first — but it selects
 * through RLS rather than assuming, which means the multi-wedding case in V4
 * is a UI change rather than a security review.
 *
 * For a planner `total_budget` is always null: they cannot read it.
 */
export const getCurrentWedding = cache(async (): Promise<WeddingRow | null> => (await loadWedding()).wedding);

/** "couple", "planner", or null when this user has no wedding. Costs nothing extra: it shares `getCurrentWedding`'s query. */
export const getViewerKind = cache(async (): Promise<ViewerKind | null> => (await loadWedding()).kind);

/**
 * For the pages a planner must not open (budget, settings, the site editor,
 * the registry...). A redirect, not a security boundary: RLS is what actually
 * keeps a planner out of the data, and a planner who reached these by URL
 * would only see errors. This is so they land somewhere that works.
 */
export async function requireCouple(): Promise<WeddingRow> {
  const { wedding, kind } = await loadWedding();
  if (!wedding) redirect("/setup");
  if (kind === "planner") redirect("/");
  return wedding;
}

/** The signed-in planner's own `people` row id, for "Assigned to me". Null for the couple. */
export const getPlannerPersonId = cache(async (): Promise<string | null> => {
  if ((await getViewerKind()) !== "planner") return null;
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id)
    .eq("access", "planner")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
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

/** Every cut line for the wedding, in position order. Spec 5, part A. */
export const getCutLines = cache(async (weddingId: string): Promise<CutLineRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cut_lines")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("position", { ascending: true });

  if (error) throw new Error(`Could not load cut lines: ${error.message}`);
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
