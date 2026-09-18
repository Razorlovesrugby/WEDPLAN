import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken, looksLikeToken } from "@/lib/tokens";
import { resolveTheme, type SiteTheme } from "@/lib/theme/presets";
import { text } from "@/lib/site/sections";

/**
 * Resolving a token for the stationery card at `/i/[token]` (spec 14 §12.2).
 *
 * Deliberately *not* `resolveInvitation()`. That one loads guests, events,
 * questions, every RSVP and every answer, because the RSVP form needs them —
 * the card needs a household's name and the wedding's own details, and the
 * card is the page most likely to be opened by half a WhatsApp group at once.
 *
 * It also does not record a token attempt. The throttle on
 * `rsvp_token_attempts` exists to make enumeration of the RSVP surface
 * expensive; a card that leaks only what is already printed on the invitation
 * does not need it, and a forwarded link opened forty times would otherwise
 * count as forty failures against whichever proxy IP they share and lock the
 * household out of replying. That is a real risk for the page most likely to
 * be forwarded, and it is why this is a separate function rather than a flag
 * on the other one.
 */

export type CardContext = {
  wedding: { id: string; name: string; slug: string; wedding_date: string | null; timezone: string };
  householdName: string;
  theme: SiteTheme;
  hero: { headline: string | null; dateLabel: string | null; location: string | null };
};

export async function resolveCard(rawToken: string): Promise<CardContext | null> {
  if (!looksLikeToken(rawToken)) return null;

  const supabase = createAdminClient();
  const { data: invitation } = await supabase
    .from("invitations")
    .select("wedding_id, household_id")
    .eq("token_hash", hashInviteToken(rawToken))
    .is("deleted_at", null)
    .maybeSingle();

  if (!invitation) return null;

  const [{ data: wedding }, { data: household }, { data: blocks }] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, name, slug, wedding_date, timezone")
      .eq("id", invitation.wedding_id)
      .maybeSingle(),
    supabase
      .from("households")
      .select("display_name")
      .eq("id", invitation.household_id)
      .eq("wedding_id", invitation.wedding_id)
      .maybeSingle(),
    supabase
      .from("site_content")
      .select("block_key, payload")
      .eq("wedding_id", invitation.wedding_id)
      .in("block_key", ["theme", "hero"]),
  ]);

  if (!wedding) return null;

  const byKey = new Map((blocks ?? []).map((row) => [row.block_key, row.payload]));
  const heroPayload = byKey.get("hero") ?? null;

  return {
    wedding,
    householdName: household?.display_name ?? "Friends",
    theme: resolveTheme(byKey.get("theme") ?? null),
    hero: {
      headline: text(heroPayload, "headline"),
      dateLabel: text(heroPayload, "date_label"),
      location: text(heroPayload, "location"),
    },
  };
}
