import type { PublicBank, PublicFund } from "@/lib/site/gift-funds";
import { giftReference } from "@/lib/site/bank-account";
import { ContributeDialog } from "./contribute-dialog";

/**
 * "A gift, if you are moved." (0030, reworked by spec 28 §6.1)
 *
 * What the couple are saving towards, as names with a line each — and nothing
 * about money on the page itself. No target, no total, no bar: a gift is a
 * transfer to the couple's account, not a thermometer. One **Contribute**
 * button under the list opens their bank details in a popup, each value with
 * its own Copy, and a reference worked out from the household reading the page.
 *
 * **Still not a payment integration.** Nothing here takes money or knows who
 * gave; `supabase/migrations/0033_gift_bank_details.sql` says why the account
 * number is just text the couple typed, and why the page shows it rather than
 * collecting anything.
 */
export function GiftFunds({
  funds,
  bank,
  householdName,
  dark,
}: {
  funds: PublicFund[];
  bank: PublicBank | null;
  /** The household reading the page, for the reference on their transfer. */
  householdName: string;
  dark?: boolean;
}) {
  const onlineLinks = funds.flatMap((fund) =>
    fund.contributeUrl ? [{ name: fund.name, url: fund.contributeUrl }] : [],
  );

  return (
    <div>
      {funds.length > 0 ? (
        <ul>
          {funds.map((fund) => (
            <li key={fund.id} className="border-b border-ink/[0.18] py-8 first:pt-0 last:border-b-0">
              <p className="site-event-name site-heading text-2xl">{fund.name}</p>
              {fund.blurb ? <p className="site-event-detail mt-2 italic text-muted">{fund.blurb}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {bank || onlineLinks.length > 0 ? (
        <div className="mt-6 text-center">
          <ContributeDialog
            bank={bank}
            reference={giftReference(householdName)}
            onlineLinks={onlineLinks}
            dark={dark === true}
          />
        </div>
      ) : null}
    </div>
  );
}
