/**
 * Trigram similarity, for catching near-duplicate names on import.
 *
 * "Kate Fitzgerald" is already in the list and the spreadsheet says
 * "Katherine Fitzgerald"; "Jon Okafor" and "John Okafor" are one person.
 * Exact matching finds neither, and importing both leaves the planner to
 * spot it months later when two place cards appear for one guest.
 *
 * WHY THIS IS IN JAVASCRIPT AND NOT IN POSTGRES
 *
 * `0001_core_schema.sql` enables pg_trgm and builds `guests_name_trgm_idx`
 * for exactly this, so the obvious implementation is a `%` query against it.
 * This does it in memory instead, for two reasons:
 *
 *   The migrations are frozen. Since 0001 has been applied for real, reaching
 *   the index through a similarity query would mean shipping a 0004 with an
 *   RPC, and an import that cannot run until someone pastes SQL into a
 *   dashboard is an import that does not get used. The index is still there
 *   and still the right answer if this ever needs to scale.
 *
 *   The scale does not warrant it. A wedding is hundreds of guests, not
 *   millions. Comparing an import of 300 rows against 400 existing guests is
 *   120,000 string comparisons — single-digit milliseconds, once, behind a
 *   preview screen the user is already waiting on.
 *
 * The algorithm is pg_trgm's: lowercase, split on non-alphanumerics, pad each
 * word with two leading spaces and one trailing, take every 3-character
 * window, and score as Jaccard overlap. It is not asserted to return bitwise
 * identical scores to Postgres — nothing here compares the two — but it ranks
 * the same pairs the same way, which is what a threshold needs.
 */

/** pg_trgm's default similarity threshold. */
export const DEFAULT_TRIGRAM_THRESHOLD = 0.3;

/**
 * High enough that it means "almost certainly the same person". Used to flag
 * a row for review, never to merge one automatically — see `plan.ts`.
 */
export const NAME_MATCH_THRESHOLD = 0.55;

/**
 * The trigrams of a string, as a set.
 *
 * Padding is what makes short words comparable: without it "jo" has no
 * trigrams at all and every two-letter name scores zero against everything.
 */
export function trigrams(value: string): Set<string> {
  const out = new Set<string>();
  const words = value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word !== "");

  for (const word of words) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      out.add(padded.slice(i, i + 3));
    }
  }
  return out;
}

/**
 * Jaccard overlap of two trigram sets, in [0, 1].
 *
 * Two empty strings score 0, not 1. They are not evidence of a match — a row
 * with no name should never be flagged as a duplicate of another row with no
 * name, and returning 1 for that case is how every unnamed row collapses into
 * the first one.
 */
export function similarity(a: string, b: string): number {
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const gram of setA) {
    if (setB.has(gram)) shared++;
  }

  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * The best match in `candidates`, or null if nothing clears `threshold`.
 *
 * Ties go to the earliest candidate, which makes the result stable across
 * runs — an import preview that reshuffles its own suggestions between two
 * loads is one nobody trusts.
 */
export function bestMatch<T>(
  needle: string,
  candidates: readonly T[],
  toName: (candidate: T) => string,
  threshold = NAME_MATCH_THRESHOLD,
): { candidate: T; score: number } | null {
  let best: { candidate: T; score: number } | null = null;

  for (const candidate of candidates) {
    const score = similarity(needle, toName(candidate));
    if (score >= threshold && (best === null || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best;
}
