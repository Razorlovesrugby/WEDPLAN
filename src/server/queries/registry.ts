import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { awaitingArrival, needsThanks } from "@/lib/registry/status";
import type {
  RegistryClaimRow,
  RegistryItemView,
  RegistrySettingsRow,
  RegistryShippingRow,
  RegistryTagRow,
} from "@/lib/types/database";

/**
 * The planner's reads for the registry (spec 36). Through the user's session,
 * so RLS scopes them; the public page has its own loader in
 * `src/server/registry/public.ts` and shares none of this.
 */

/** What a wedding that has never opened the registry looks like. Not stored until they save. */
export function defaultRegistrySettings(weddingId: string): RegistrySettingsRow {
  return {
    wedding_id: weddingId,
    enabled: false,
    open: true,
    title: null,
    intro: null,
    hero_asset_id: null,
    thanks_text: null,
    thanks_asset_id: null,
    no_gifts_line: null,
    show_prices: true,
    show_taken: false,
    show_funds: false,
    disclosure_on: false,
    disclosure_text: null,
    palette: "linen",
    type_pairing: "classic",
    last_viewed_claims_at: null,
    created_at: "",
    updated_at: "",
  };
}

export const getRegistrySettings = cache(async (weddingId: string): Promise<RegistrySettingsRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registry_settings")
    .select("*")
    .eq("wedding_id", weddingId)
    .maybeSingle();
  if (error) throw new Error(`Could not load registry settings: ${error.message}`);
  return data ?? defaultRegistrySettings(weddingId);
});

export const getRegistryShipping = cache(async (weddingId: string): Promise<RegistryShippingRow | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registry_shipping")
    .select("*")
    .eq("wedding_id", weddingId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the delivery address: ${error.message}`);
  return data;
});

export const getRegistryTags = cache(async (weddingId: string): Promise<RegistryTagRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("registry_tags")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Could not load registry tags: ${error.message}`);
  return data ?? [];
});

export type PlannerRegistryItem = RegistryItemView & { tag_ids: string[] };

export const getRegistryItems = cache(async (weddingId: string): Promise<PlannerRegistryItem[]> => {
  const supabase = await createClient();
  const [items, links] = await Promise.all([
    supabase
      .from("v_registry_items")
      .select("*")
      .eq("wedding_id", weddingId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("created_at"),
    supabase.from("registry_item_tags").select("item_id, tag_id").eq("wedding_id", weddingId),
  ]);
  if (items.error) throw new Error(`Could not load registry items: ${items.error.message}`);
  if (links.error) throw new Error(`Could not load registry tags: ${links.error.message}`);

  const byItem = new Map<string, string[]>();
  for (const link of links.data ?? []) {
    byItem.set(link.item_id, [...(byItem.get(link.item_id) ?? []), link.tag_id]);
  }
  return (items.data ?? []).map((item) => ({ ...item, tag_ids: byItem.get(item.id) ?? [] }));
});

export type PlannerClaim = RegistryClaimRow & { item_title: string; item_deleted: boolean };

/**
 * Every claim, released ones included — the couple should be able to see that
 * someone claimed and backed out. Item titles are joined here because a
 * soft-deleted item's claims must still say what was claimed.
 */
export const getRegistryClaims = cache(async (weddingId: string): Promise<PlannerClaim[]> => {
  const supabase = await createClient();
  const [claims, items] = await Promise.all([
    supabase.from("registry_claims").select("*").eq("wedding_id", weddingId).order("created_at", { ascending: false }),
    supabase.from("registry_items").select("id, title, deleted_at").eq("wedding_id", weddingId),
  ]);
  if (claims.error) throw new Error(`Could not load registry claims: ${claims.error.message}`);
  if (items.error) throw new Error(`Could not load registry items: ${items.error.message}`);

  const byId = new Map((items.data ?? []).map((item) => [item.id, item]));
  return (claims.data ?? []).map((claim) => ({
    ...claim,
    item_title: byId.get(claim.item_id)?.title ?? "(removed item)",
    item_deleted: Boolean(byId.get(claim.item_id)?.deleted_at),
  }));
});

export type RegistrySummary = {
  enabled: boolean;
  items: number;
  newClaims: number;
  awaiting: number;
  toThank: number;
};

/** The dashboard tile: one cheap read, and nothing when the registry was never started. */
export const getRegistrySummary = cache(async (weddingId: string): Promise<RegistrySummary> => {
  const [settings, items, claims] = await Promise.all([
    getRegistrySettings(weddingId),
    getRegistryItems(weddingId),
    getRegistryClaims(weddingId),
  ]);
  const since = settings.last_viewed_claims_at;
  return {
    enabled: settings.enabled,
    items: items.length,
    newClaims: claims.filter((c) => c.released_at === null && (!since || c.created_at > since)).length,
    awaiting: claims.filter(awaitingArrival).length,
    toThank: claims.filter(needsThanks).length,
  };
});
