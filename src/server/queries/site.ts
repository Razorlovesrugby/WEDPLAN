import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Finding the wedding a public URL points at (spec 14 §3).
 *
 * Everything else the public page needs now comes from
 * `site-blocks.ts` (the published revision) and `site-render.ts` (the data
 * the blocks draw). This file is the door: slug in, wedding out.
 *
 * The service role reads here because there is no session: a guest opening
 * `/w/<slug>` is not signed in and never will be. That is one of the allowed
 * service-role callers listed in `src/lib/supabase/admin.ts`, and the scoping
 * rule applies in full — every query below is pinned to the single wedding the
 * slug resolved to, and the slug is the only thing a caller controls.
 */

export type SiteWedding = {
  id: string;
  name: string;
  slug: string;
  wedding_date: string | null;
  timezone: string;
};

/** The wedding a public URL points at, or null. Never throws on a bad slug. */
export async function findWeddingBySlug(slug: string): Promise<SiteWedding | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("weddings")
    .select("id, name, slug, wedding_date, timezone")
    .eq("slug", slug)
    .maybeSingle();
  return (data as SiteWedding | null) ?? null;
}

/**
 * The slug of the wedding `/w` used to serve implicitly.
 *
 * Exists only so the bare `/w` that shipped in V1 — and is linked from the
 * privacy page, and from whatever guests have already bookmarked — keeps
 * working by redirecting rather than 404ing. New links should carry the slug.
 */
export async function firstWeddingSlug(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("weddings")
    .select("slug")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.slug ?? null;
}
