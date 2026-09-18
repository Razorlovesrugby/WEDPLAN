import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { decryptToken, invitationUrl } from "@/lib/tokens";
import { qrDataUri } from "@/lib/qr";
import { body, script } from "@/lib/fonts";
import { resolveTheme, themeCssVars } from "@/lib/theme/presets";
import { Monogram } from "@/components/site/monogram";
import { FloralRule } from "@/components/site/rule";
import { text } from "@/lib/site/sections";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Print invitations" };

/**
 * The paper half of the stationery (spec 14 §12.2).
 *
 * Same theme, same faces, same monogram as `/i/[token]` and the site, so the
 * printed invitation and the one people get on their phone are recognisably
 * one thing. That is the whole point: V1's QR sheet already prints working
 * codes, and what this adds is the design.
 *
 * **Not a generated PDF.** A real PDF means a new dependency and a second
 * rendering path that would drift from the card's design the first time either
 * changed. Print-to-PDF from the browser produces the same file from the same
 * HTML, and the print stylesheet below is what makes it come out right.
 *
 * The QR points at `/rsvp`, not `/i`: somebody scanning a paper invitation is
 * holding the card already, so sending them to a digital copy of it costs a
 * tap on the way to the thing they actually came to do.
 *
 * Codes are inlined as data URIs for the three reasons V1's sheet documents —
 * all-or-nothing printing, not existing as separately fetchable credentials,
 * and working at a printer's with no network.
 */
export const dynamic = "force-dynamic";

export default async function PrintStationeryPage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const [{ data, error }, { data: blocks }] = await Promise.all([
    supabase
      .from("invitations")
      .select("id, token_encrypted, households(display_name, rank)")
      .eq("wedding_id", wedding.id)
      .is("deleted_at", null),
    supabase
      .from("site_content")
      .select("block_key, payload")
      .eq("wedding_id", wedding.id)
      .in("block_key", ["theme", "hero"]),
  ]);

  if (error) throw new Error(`Could not load invitations: ${error.message}`);

  const byKey = new Map((blocks ?? []).map((row) => [row.block_key, row.payload]));
  const theme = resolveTheme(byKey.get("theme") ?? null);
  const hero = byKey.get("hero") ?? null;

  const names = text(hero, "headline") ?? wedding.name;
  const dateLabel =
    text(hero, "date_label") ??
    (wedding.wedding_date ? formatDate(wedding.wedding_date, wedding.timezone) : null);
  const location = text(hero, "location");

  const cards = await Promise.all(
    (data ?? []).map(async (invitation) => {
      const token = decryptToken(invitation.token_encrypted);
      const url = token ? invitationUrl(token) : null;
      return {
        id: invitation.id,
        name: invitation.households?.display_name ?? "Unknown household",
        rank: invitation.households?.rank ?? "",
        url,
        qr: url ? await qrDataUri(url) : null,
      };
    }),
  );

  cards.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  const unrecoverable = cards.filter((card) => card.qr === null);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Print invitations</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            {cards.length} {cards.length === 1 ? "card" : "cards"}, in ranking order, in your
            site&rsquo;s theme. Print to PDF for a printer, or straight onto card. Each code opens
            that household&rsquo;s own RSVP page — treat the sheet like the invitations themselves.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/invitations/print" className="btn">
            Plain QR sheet
          </Link>
          <Link href="/invitations" className="btn">
            Back
          </Link>
        </div>
      </div>

      {unrecoverable.length > 0 ? (
        <p role="alert" className="no-print card border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {unrecoverable.length}{" "}
          {unrecoverable.length === 1 ? "invitation's link" : "invitations' links"} could not be
          recovered, so {unrecoverable.length === 1 ? "its card is" : "their cards are"} blank.
          Reissue them, then print again.
        </p>
      ) : null}

      <div
        style={themeCssVars(theme)}
        className={`${script.variable} ${body.variable} print-sheet grid grid-cols-1 gap-6 font-body sm:grid-cols-2`}
      >
        {cards.map((card) => (
          <article
            key={card.id}
            className="print-card flex flex-col items-center border border-line bg-paper px-6 py-8 text-center text-ink"
          >
            {theme.monogram ? (
              <Monogram name={wedding.name} className="mb-4 block text-2xl text-muted" />
            ) : null}

            <p className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">{card.name}</p>
            <p className="mt-4 text-[0.78rem] leading-relaxed text-muted">
              request the pleasure of your company at the marriage of
            </p>
            <p className="mt-2 font-script text-[2.4rem] leading-[1.05]">{names}</p>

            <FloralRule className="my-5" />

            {dateLabel ? (
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-muted">{dateLabel}</p>
            ) : null}
            {location ? <p className="mt-1 text-[0.85rem] text-muted">{location}</p> : null}

            {card.qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.qr} alt="" width={116} height={116} className="mt-5" />
                <p className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                  Scan to reply
                </p>
              </>
            ) : (
              <p className="mt-5 text-[0.7rem] text-muted">Link could not be recovered</p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
