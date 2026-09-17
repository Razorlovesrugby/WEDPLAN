import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPublishedBoards } from "@/server/moodboards/resolve";
import { resolveTheme, type SiteTheme } from "@/lib/theme/presets";
import { THEME_BLOCK_KEY, type SiteContentRow } from "@/lib/site/sections";
import type { PublicEvent } from "@/components/site/content";

/**
 * Reads for the public site (spec 14 §3).
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

export type SiteData = {
  wedding: SiteWedding;
  theme: SiteTheme;
  blocks: SiteContentRow[];
  events: PublicEvent[];
  boards: Awaited<ReturnType<typeof listPublishedBoards>>;
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

export async function loadSite(slug: string): Promise<SiteData | null> {
  const wedding = await findWeddingBySlug(slug);
  if (!wedding) return null;

  const supabase = createAdminClient();
  const [{ data: blocks }, { data: events }] = await Promise.all([
    supabase
      .from("site_content")
      .select("block_key, payload, sort_order, visible")
      .eq("wedding_id", wedding.id)
      .eq("visible", true)
      .order("sort_order"),
    supabase
      .from("events")
      .select("id, name, starts_at, ends_at, venue, address")
      .eq("wedding_id", wedding.id)
      .eq("is_public", true)
      .order("sort_order")
      .order("starts_at"),
  ]);

  const rows = (blocks ?? []) as SiteContentRow[];
  const themeRow = rows.find((row) => row.block_key === THEME_BLOCK_KEY);

  return {
    wedding,
    theme: resolveTheme(themeRow?.payload ?? null),
    blocks: rows,
    events: (events ?? []) as PublicEvent[],
    boards: await listPublishedBoards(wedding.id, "public_site"),
  };
}
