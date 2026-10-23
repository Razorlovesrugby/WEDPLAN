import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPublicBank, toPublicFund, type PublicBank, type PublicFund } from "@/lib/site/gift-funds";
import type { GiftBankDetailsRow, GiftFundRow, RegistryItemView, RegistrySettingsRow } from "@/lib/types/database";
import { formatPrice } from "@/lib/registry/items";
import type { BrowseItem } from "@/lib/registry/browse";

/**
 * What the public registry page may read (spec 36 §4, §6.2).
 *
 * Service role, because a visitor has no session; scoped to the single wedding
 * the slug resolves to.
 *
 * **This module never reads `registry_claims` or `registry_shipping`.** That
 * is the design, not an omission: a visitor is told how many of an item are
 * still wanted (`remaining`, derived in the database) and nothing about who
 * took the rest, and the delivery address is shown only to someone who has just
 * claimed (see `registry-public.ts`). `public.test.ts` reads this file's source
 * and fails if either table name appears in it.
 */

export type PublicRegistryItem = BrowseItem & {
  url: string;
  imageUrl: string | null;
  priceText: string | null;
  quantity: number;
  remaining: number;
  specs: { label: string; value: string }[];
  /** Out of stock but kept on the page as "Someone's got this one" (the owner's switch). */
  taken: boolean;
};

export type PublicRegistry = {
  weddingName: string;
  slug: string;
  settings: RegistrySettingsRow;
  items: PublicRegistryItem[];
  tags: { id: string; name: string; sort_order: number }[];
  funds: PublicFund[];
  bank: PublicBank | null;
  heroUrl: string | null;
  /** Where the subject is, as CSS `object-position`; null = centred. */
  heroPosition: string | null;
  /** The photograph's average colour, painted behind it until it loads. */
  heroColour: string | null;
  thanksImageUrl: string | null;
  /** True only for the signed-in couple previewing their own page: nothing can be claimed. */
  preview: boolean;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

const imageUrl = (id: string | null, width: 480 | 960 = 960): string | null =>
  id ? `/api/photo/${id}?w=${width}` : null;

/**
 * Null for anything that isn't an enabled registry — unknown, off and malformed
 * all look the same.
 *
 * `preview` lets the couple see their own page while it is still off. It is a
 * parameter, not something this function decides: the PAGE must have verified
 * the caller is a collaborator of exactly this wedding before passing it, and a
 * preview can never claim (the sheet renders without its button).
 */
export async function loadPublicRegistry(
  slug: string,
  options: { preview?: boolean } = {},
): Promise<PublicRegistry | null> {
  const preview = options.preview === true;
  if (!SLUG.test(slug)) return null;
  const admin = createAdminClient();

  const { data: wedding } = await admin.from("weddings").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!wedding) return null;

  const { data: settings } = await admin
    .from("registry_settings")
    .select("*")
    .eq("wedding_id", wedding.id)
    .maybeSingle();
  if (!settings || (!settings.enabled && !preview)) return null;

  const [items, links, tags, funds, bank, hero] = await Promise.all([
    admin
      .from("v_registry_items")
      .select("*")
      .eq("wedding_id", wedding.id)
      .is("deleted_at", null)
      .eq("hidden", false)
      .order("sort_order")
      .order("created_at"),
    admin.from("registry_item_tags").select("item_id, tag_id").eq("wedding_id", wedding.id),
    admin.from("registry_tags").select("id, name, sort_order").eq("wedding_id", wedding.id).order("sort_order").order("name"),
    settings.show_funds
      ? admin.from("gift_funds").select("*").eq("wedding_id", wedding.id).order("sort_order")
      : Promise.resolve({ data: [] as GiftFundRow[] }),
    settings.show_funds
      ? admin.from("gift_bank_details").select("*").eq("wedding_id", wedding.id).maybeSingle()
      : Promise.resolve({ data: null as GiftBankDetailsRow | null }),
    settings.hero_asset_id
      ? admin
          .from("site_assets")
          .select("focal_x, focal_y, colour")
          .eq("wedding_id", wedding.id)
          .eq("id", settings.hero_asset_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (items.error) throw new Error(`Could not load the registry: ${items.error.message}`);

  const tagsByItem = new Map<string, string[]>();
  for (const link of links.data ?? []) {
    tagsByItem.set(link.item_id, [...(tagsByItem.get(link.item_id) ?? []), link.tag_id]);
  }

  const shaped: PublicRegistryItem[] = [];
  for (const row of (items.data ?? []) as RegistryItemView[]) {
    const taken = row.remaining <= 0;
    // A finished item leaves the page, unless the couple chose to show it as taken.
    if (taken && !settings.show_taken) continue;
    shaped.push({
      id: row.id,
      title: row.title,
      store: row.store,
      // A taken card shows nothing but that it is taken (§6.2): no note, no specs.
      note: taken ? null : row.note,
      price_minor: settings.show_prices ? row.price_minor : null,
      starred: row.starred,
      sort_order: row.sort_order,
      created_at: row.created_at,
      tag_ids: tagsByItem.get(row.id) ?? [],
      url: row.url,
      imageUrl: imageUrl(row.image_asset_id, 960),
      priceText: settings.show_prices ? formatPrice(row.price_minor) : null,
      quantity: row.quantity,
      remaining: row.remaining,
      specs: taken ? [] : row.specs,
      taken,
    });
  }

  return {
    weddingName: wedding.name,
    slug: wedding.slug,
    settings,
    items: shaped,
    tags: tags.data ?? [],
    funds: ((funds.data ?? []) as GiftFundRow[]).map(toPublicFund),
    bank: toPublicBank(bank.data as GiftBankDetailsRow | null),
    heroUrl: imageUrl(settings.hero_asset_id, 960),
    heroPosition:
      hero.data && hero.data.focal_x !== null && hero.data.focal_y !== null
        ? `${Math.round(hero.data.focal_x * 100)}% ${Math.round(hero.data.focal_y * 100)}%`
        : null,
    heroColour: hero.data?.colour ?? null,
    thanksImageUrl: imageUrl(settings.thanks_asset_id, 960),
    preview,
  };
}
