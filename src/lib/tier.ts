/**
 * Which cut line a household falls under.
 *
 * This duplicates the lateral-join CASE in `v_households`, deliberately and
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

export type CutLine = {
  label: string;
  position: number;
  boundaryRank: string | null;
};

export type Tier = { label: string; position: number };

/**
 * Walks the cut lines in position order and returns the first whose
 * boundary the household's rank falls within — a null boundary always
 * matches, which is what makes the last line (or an unset first line) a
 * catch-all. `cutLines` need not already be sorted.
 */
export function tierFor(rank: string, cutLines: CutLine[]): Tier {
  const ordered = [...cutLines].sort((a, b) => a.position - b.position);
  for (const line of ordered) {
    if (line.boundaryRank === null || rank <= line.boundaryRank) {
      return { label: line.label, position: line.position };
    }
  }
  // Unreachable for a valid configuration — the last line by position always
  // has a null boundary — but a household must resolve to something even if
  // the data is momentarily inconsistent mid-edit.
  const last = ordered[ordered.length - 1];
  return last ? { label: last.label, position: last.position } : { label: "A", position: 0 };
}
