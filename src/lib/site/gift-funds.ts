import type { GiftBankDetailsRow, GiftFundRow } from "@/lib/types/database";

/**
 * What the gift block shows (0030, reworked by spec 28 §6.1).
 *
 * A fund is a name and a line about it. It used to carry a target, a "raised so
 * far" figure and a progress rule; the couple's reading was that a gift is a
 * transfer to their account, not a thermometer, so the page no longer reads
 * `target_minor` or `raised_minor` at all. They stay in the database — the
 * couple typed them, migrations are append-only, and dropping a column people
 * have written into is a data loss — they are simply not drawn.
 */

export type PublicFund = {
  id: string;
  name: string;
  blurb: string | null;
  /** The optional "or give online" link, already checked. */
  contributeUrl: string | null;
};

/** A stored row as the public block reads it. */
export function toPublicFund(row: GiftFundRow): PublicFund {
  return {
    id: row.id,
    name: row.name,
    blurb: row.blurb,
    contributeUrl: safeContributeUrl(row.contribute_url),
  };
}

/**
 * The couple's account details as the popup reads them (`0033`). The account
 * number is digits only — grouping it is the renderer's job.
 */
export type PublicBank = {
  accountName: string | null;
  accountNumber: string | null;
  /** The warm line at the top of the popup; null means the default. */
  message: string | null;
  note: string | null;
};

export const DEFAULT_GIFT_MESSAGE = "Thank you — truly. If you'd like to, here's where to send it.";

/**
 * Null when there is nothing to show — a row the couple created and left
 * empty is the same as none, and the Contribute button must not open an empty
 * popup.
 */
export function toPublicBank(row: GiftBankDetailsRow | null | undefined): PublicBank | null {
  if (!row) return null;
  const bank: PublicBank = {
    accountName: row.account_name?.trim() || null,
    accountNumber: row.account_number?.trim() || null,
    message: row.message?.trim() || null,
    note: row.note?.trim() || null,
  };
  return bank.accountName || bank.accountNumber ? bank : null;
}

/**
 * The href, or null.
 *
 * `0030` already refuses anything but http(s) with a check constraint, so
 * this is the second of two gates rather than the only one. It is here
 * because the column is text a planner typed, the value ends up in an `href`
 * in front of every guest, and a constraint added in a migration is a
 * constraint somebody can drop in a later one without the renderer noticing.
 */
export function safeContributeUrl(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}
