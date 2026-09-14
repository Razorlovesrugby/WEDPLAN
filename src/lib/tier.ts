import type { HouseholdTier } from "@/lib/types/database";

/**
 * Which side of the cut lines a household falls on.
 *
 * This duplicates the CASE expression in `v_households`, deliberately and
 * carefully. The server is the source of truth, but during an optimistic
 * reorder the server's answer describes the order before the drag — and a cut
 * line that lags the drag is worse than no cut line at all.
 *
 * Because it is a duplicate, it is tested against exactly the cases the SQL
 * suite asserts (supabase/tests/02_derived.sql). If the two ever disagree,
 * one of those suites fails.
 *
 * Comparison is plain `<=` on the rank string, which matches Postgres only
 * because `households.rank` is pinned to COLLATE "C".
 */
export function tierFor(
  rank: string,
  cutRank: string | null,
  tierBRank: string | null,
): HouseholdTier {
  if (cutRank === null) return "A";
  if (rank <= cutRank) return "A";
  if (tierBRank === null) return "B";
  if (rank <= tierBRank) return "B";
  return "C";
}
