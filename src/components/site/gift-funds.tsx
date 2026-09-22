import { formatMoneyShort } from "@/lib/format";
import type { PublicFund } from "@/lib/site/gift-funds";
import { Label } from "./section";

/**
 * "A gift, if you are moved." (0030)
 *
 * Two or three things the couple would like help with, each with a rule
 * showing how far along it is, and a button that sends a guest to whatever
 * actually takes the money.
 *
 * **The button is a link out, not a checkout**, and the copy says "raised so
 * far" rather than implying a live total. There is no payment integration
 * here and the page does not pretend there is — `supabase/migrations/
 * 0030_gift_funds.sql` explains why that is the schema rather than an empty
 * ledger with a progress bar on top.
 */
export function GiftFunds({ funds, dark }: { funds: PublicFund[]; dark?: boolean }) {
  if (funds.length === 0) return null;

  return (
    <ul>
      {funds.map((fund) => (
        <li
          key={fund.id}
          className="border-b border-ink/[0.18] py-8 last:border-b-0"
        >
          <p className="site-event-name site-heading text-2xl">{fund.name}</p>
          {fund.blurb ? (
            <p className="site-event-detail mt-2 italic text-muted">{fund.blurb}</p>
          ) : null}

          {fund.progress === null ? null : (
            <div
              className={`mt-5 h-0.5 w-full ${dark ? "bg-paper/25" : "bg-ink/10"}`}
              role="img"
              aria-label={`${formatMoneyShort(fund.raisedMinor)} of ${formatMoneyShort(fund.targetMinor)} raised`}
            >
              {/* The filled portion. Accent on paper, paper on a dark ground:
                  the accent colours are chosen to carry on `paper` and several
                  of them disappear on ink. */}
              <div
                className={`h-full ${dark ? "bg-paper" : "bg-accent"}`}
                style={{ width: `${Math.round(fund.progress * 100)}%` }}
              />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <Label className={dark ? "!text-paper/80" : undefined}>
              {fund.targetMinor === null
                ? `${formatMoneyShort(fund.raisedMinor)} raised so far`
                : `${formatMoneyShort(fund.raisedMinor)} / ${formatMoneyShort(fund.targetMinor)}`}
            </Label>

            {fund.contributeUrl ? (
              <a
                href={fund.contributeUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={`inline-block border px-5 py-2 text-[0.72rem] uppercase tracking-[0.14em] transition-colors ${
                  dark
                    ? "border-paper hover:bg-paper hover:!text-ink"
                    : "border-accent text-accent hover:bg-accent hover:text-paper"
                }`}
              >
                Contribute
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
