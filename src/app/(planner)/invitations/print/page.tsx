import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { decryptToken, householdSiteUrl } from "@/lib/tokens";
import { qrDataUri } from "@/lib/qr";

export const metadata = { title: "Print QR codes" };

/**
 * A sheet of RSVP cards, one per invitation, for printing and trimming.
 *
 * The codes are inlined as data URIs rather than pointed at /api/qr. Three
 * reasons, in order of how much they cost when ignored:
 *
 *   Printing is all-or-nothing. A browser printing 90 cards fires 90 image
 *   requests and prints whatever has arrived when the dialog opens; the
 *   misses come out as empty boxes, and nobody notices until the cards are
 *   cut. Inlined, the page cannot render half-finished.
 *
 *   Each code is a live credential. As data URIs they never exist as
 *   separately fetchable URLs that could sit in a proxy log.
 *
 *   It works offline, which matters at a printer's.
 *
 * Rendered on demand, never statically, because the tokens are decrypted
 * per request.
 */
export const dynamic = "force-dynamic";

export default async function PrintCodesPage() {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invitations")
    .select("id, token_encrypted, households(display_name, rank, slug, slug_suffix)")
    .eq("wedding_id", wedding.id)
    .is("deleted_at", null);

  if (error) throw new Error(`Could not load invitations: ${error.message}`);

  const cards = await Promise.all(
    (data ?? []).map(async (invitation) => {
      // The printed code carries the household's address (spec 21 Q6). The
      // token is still checked, because the RSVP form behind that address
      // needs it and a card is printed once.
      const token = decryptToken(invitation.token_encrypted);
      if (!token || !invitation.households) {
        return {
          id: invitation.id,
          name: invitation.households?.display_name ?? "Unknown household",
          rank: invitation.households?.rank ?? "",
          url: null,
          qr: null,
        };
      }
      const url = householdSiteUrl(wedding.slug, {
        slug: invitation.households.slug,
        suffix: invitation.households.slug_suffix,
      });
      return {
        id: invitation.id,
        name: invitation.households?.display_name ?? "Unknown household",
        rank: invitation.households?.rank ?? "",
        url,
        qr: await qrDataUri(url),
      };
    }),
  );

  // Ranking order, so the printed stack matches the order the planner thinks
  // of the list in rather than whatever order the rows came back.
  cards.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));

  const unrecoverable = cards.filter((card) => card.qr === null);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">Print QR codes</h1>
          <p className="mt-1 text-sm text-muted">
            {cards.length} {cards.length === 1 ? "card" : "cards"}, in ranking order. Each code
            opens that household&rsquo;s RSVP page — treat the sheet like the invitations
            themselves.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/invitations" className="btn">
            Back
          </Link>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="card p-5 text-sm">
          No invitations yet. Create some on the{" "}
          <Link href="/invitations" className="underline">
            invitations screen
          </Link>{" "}
          and they will appear here.
        </p>
      ) : null}

      {unrecoverable.length > 0 ? (
        <p role="alert" className="no-print card border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {unrecoverable.length}{" "}
          {unrecoverable.length === 1 ? "invitation's link" : "invitations' links"} could not be
          recovered, so {unrecoverable.length === 1 ? "its card is" : "their cards are"} blank
          below. That happens when the token pepper has changed since they were issued — reissue
          them, then print again.
        </p>
      ) : null}

      <div className="print-sheet grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.id}
            className="print-card flex flex-col items-center gap-2 rounded-lg border border-line bg-white p-4 text-center"
          >
            {card.qr ? (
              /* eslint-disable-next-line @next/next/no-img-element -- a data
                 URI, so next/image would only add a loader around bytes that
                 are already in the document. */
              <img src={card.qr} alt="" width={140} height={140} className="h-[140px] w-[140px]" />
            ) : (
              <div className="flex h-[140px] w-[140px] items-center justify-center rounded border border-dashed border-line text-xs text-muted">
                Link not recoverable
              </div>
            )}
            <p className="font-serif text-sm">{card.name}</p>
            <p className="break-all text-[10px] leading-tight text-muted">
              {card.url ?? "Reissue this invitation"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
