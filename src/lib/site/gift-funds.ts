import type { GiftFundRow } from "@/lib/types/database";

/**
 * The gift-fund block's arithmetic (0030).
 *
 * Separate from the renderer because "how full is the bar" has edge cases —
 * no target, an over-subscribed fund, a target of nothing — and each of them
 * is a line on a real wedding site rather than a hypothetical.
 */

export type PublicFund = {
  id: string;
  name: string;
  blurb: string | null;
  raisedMinor: number;
  targetMinor: number | null;
  contributeUrl: string | null;
  /** 0–1, or null when the fund has no target and therefore no rule to draw. */
  progress: number | null;
};

/**
 * How full the rule is drawn.
 *
 * **Clamped at 1.** A fund that has passed its target is a good thing that
 * happened, and a bar drawn past its own container is a rendering bug the
 * couple would report. The figures underneath still say `$1,400 / $1,200`,
 * so nothing is hidden — the bar is simply full.
 *
 * Null with no target: a fund that says "anything towards the honeymoon" has
 * nothing to be a proportion of, and an empty rule under it would read as
 * "nobody has given anything".
 */
export function fundProgress(raisedMinor: number, targetMinor: number | null): number | null {
  if (targetMinor === null || targetMinor <= 0) return null;
  return Math.min(1, Math.max(0, raisedMinor / targetMinor));
}

/** A stored row as the public block reads it. */
export function toPublicFund(row: GiftFundRow): PublicFund {
  return {
    id: row.id,
    name: row.name,
    blurb: row.blurb,
    raisedMinor: row.raised_minor,
    targetMinor: row.target_minor,
    contributeUrl: safeContributeUrl(row.contribute_url),
    progress: fundProgress(row.raised_minor, row.target_minor),
  };
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
