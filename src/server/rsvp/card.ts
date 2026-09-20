import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAddress } from "@/lib/site/household-slug";
import { resolveTheme, type SiteTheme } from "@/lib/theme/presets";
import { text } from "@/lib/site/sections";

/**
 * The little that a household's page needs before it can say whose it is:
 * the couple's names, the date, the theme and the household's own name.
 *
 * Deliberately *not* `resolveInvitation()` or `resolveHouseholdAddress()`.
 * Those load guests, events, questions, every RSVP and every answer, because
 * the form needs them. This is for the `<title>`, the Open Graph image and
 * anything else that renders before — or instead of — the page body, and it
 * is the query most likely to be run by half a WhatsApp group at once.
 *
 * It also does not record a token attempt or consult the throttle. That
 * counter exists to make enumerating the RSVP surface expensive; a forwarded
 * link opened forty times would otherwise spend forty slots against whichever
 * proxy IP the group shares and lock the household out of replying. The page
 * body still resolves through `resolveHouseholdAddress()`, which does count.
 *
 * Spec 21 moved this from a token to an address. It was `resolveCard(token)`
 * for `/i/[token]`; that route is now a redirect (Q6) and the card is the top
 * of the household's own page.
 */

export type CardContext = {
  wedding: { id: string; name: string; slug: string; wedding_date: string | null; timezone: string };
  householdName: string;
  theme: SiteTheme;
  hero: { headline: string | null; dateLabel: string | null; location: string | null };
};

export async function resolveCardByAddress(
  weddingSlug: string,
  segment: string,
): Promise<CardContext | null> {
  const address = parseAddress(segment);
  if (!address) return null;

  const supabase = createAdminClient();

  const { data: wedding } = await supabase
    .from("weddings")
    .select("id, name, slug, wedding_date, timezone")
    .eq("slug", weddingSlug)
    .maybeSingle();

  if (!wedding) return null;

  const [{ data: household }, { data: blocks }] = await Promise.all([
    supabase
      .from("households")
      .select("display_name")
      .eq("wedding_id", wedding.id)
      .eq("slug", address.slug)
      .eq("slug_suffix", address.suffix)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("site_content")
      .select("block_key, payload")
      .eq("wedding_id", wedding.id)
      .in("block_key", ["theme", "hero"]),
  ]);

  // No household at that address: the caller renders the fallback rather than
  // naming the wedding, which would confirm the couple exists at this slug to
  // anyone trying addresses.
  if (!household) return null;

  const byKey = new Map((blocks ?? []).map((row) => [row.block_key, row.payload]));
  const heroPayload = byKey.get("hero") ?? null;

  return {
    wedding,
    householdName: household.display_name,
    theme: resolveTheme(byKey.get("theme") ?? null),
    hero: {
      headline: text(heroPayload, "headline"),
      dateLabel: text(heroPayload, "date_label"),
      location: text(heroPayload, "location"),
    },
  };
}
