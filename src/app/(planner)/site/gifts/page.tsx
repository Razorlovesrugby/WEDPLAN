import Link from "next/link";
import { requireWedding } from "@/server/queries/wedding";
import { getGiftBankDetails, getGiftFunds } from "@/server/queries/site-extras";
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
 * **What this screen is honest about:** nothing here takes a payment. The
 * account details are text the couple typed, shown to a guest so they can type
 * them into their own banking app (spec 28 §6.1). There is no target and no
 * "raised so far" any more — the columns are still in the database, because
 * the couple typed into them, but nothing reads them.
 */
export default async function GiftFundsPage() {
  const wedding = await requireWedding();
  const [funds, bank] = await Promise.all([getGiftFunds(wedding.id), getGiftBankDetails(wedding.id)]);

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
          Guests see your account details when they press <em>Contribute</em> and type them into
          their own banking app. You tell who sent what by the reference &mdash; each household is
          asked to use its own name.
        </p>
      </div>

      <GiftFundEditor funds={funds} bank={bank} />
    </div>
  );
}
