import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { getGiftFunds } from "@/server/queries/site-extras";
import { GiftFundEditor } from "@/components/site/editor/gift-fund-editor";

export const metadata = { title: "A gift" };

/**
 * `/site/gifts` — the gift list (0030).
 *
 * Its own screen rather than a repeat field inside the block, for the same
 * reason the song list has one: a fund carries money, and money belongs
 * somewhere the couple can see all of it at once rather than in a form that
 * only opens when a particular block is selected.
 *
 * **What this screen is honest about:** nothing here takes a payment.
 * "Raised so far" is a figure the couple types from whatever account the
 * money actually lands in, and the button on the guest site is a link out.
 * The copy says so, because a progress bar implies a system behind it.
 */
export default async function GiftFundsPage() {
  const wedding = await requireWedding();
  const funds = await getGiftFunds(wedding.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl">A gift</h1>
          <p className="mt-1 text-sm text-muted">
            Two or three things you&rsquo;d like help with. Add the <em>A gift</em> block to your
            site and these appear on it.
          </p>
        </div>
        <Link href="/site" className="btn">
          Back to the site
        </Link>
      </div>

      <div className="card space-y-1 p-4 text-sm text-muted">
        <p className="font-medium text-ink">Nothing here takes a payment.</p>
        <p>
          The <em>Contribute</em> button sends a guest to the link you give — your bank&rsquo;s
          request page, a transfer link, a charity&rsquo;s own donation page. &ldquo;Raised so
          far&rdquo; is a number you keep up to date from wherever the money actually arrives.
        </p>
      </div>

      <GiftFundEditor funds={funds} />
    </div>
  );
}
