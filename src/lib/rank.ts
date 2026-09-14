/**
 * Fractional indexing for the household ranking list.
 *
 * Households are ordered by a string key rather than an integer position.
 * Dragging one household writes exactly one cell: the moved row gets a key
 * strictly between its new neighbours. Nothing else is touched, so two people
 * reordering the list at once cannot renumber each other's rows out from
 * under them — the failure mode that makes integer positions fall apart at a
 * few hundred rows.
 *
 * The algorithm is the standard base-62 midpoint: to place a key between `a`
 * and `b`, walk their common prefix, then find a digit strictly between them,
 * descending a character at a time when the digits are adjacent.
 *
 * INVARIANT: a key never ends in the minimum digit ('0').
 *
 * That is not arbitrary. Nothing can sort between "x" and "x0" — any string
 * starting with "x" that is smaller than "x0" would need a character below
 * '0', and there isn't one. Forbidding trailing '0' guarantees every pair of
 * adjacent keys has room between them, forever.
 *
 * Ordering must match PostgreSQL exactly, which is why households.rank is
 * pinned to COLLATE "C" — byte order, the same thing JavaScript's `<` does on
 * these ASCII keys. See the migration for the full reasoning.
 */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const MIN_DIGIT = DIGITS[0]!;

export class RankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RankError";
  }
}

/**
 * A key strictly between `a` and `b`.
 *
 * `a` is "" for "before everything"; `b` is null for "after everything".
 */
export function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new RankError(`ranks out of order: ${JSON.stringify(a)} >= ${JSON.stringify(b)}`);
  }
  if (a.endsWith(MIN_DIGIT) || (b !== null && b.endsWith(MIN_DIGIT))) {
    throw new RankError(
      `rank ends in '${MIN_DIGIT}', which leaves no room before it: ` +
        JSON.stringify(a.endsWith(MIN_DIGIT) ? a : b),
    );
  }

  if (b !== null) {
    // Copy the shared prefix, then solve the smaller problem underneath it.
    let n = 0;
    while ((a[n] ?? MIN_DIGIT) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const digitA = a === "" ? 0 : DIGITS.indexOf(a[0]!);
  const digitB = b !== null ? DIGITS.indexOf(b[0]!) : DIGITS.length;

  if (digitB - digitA > 1) {
    // Room at this position: take the middle digit and stop.
    return DIGITS[Math.round(0.5 * (digitA + digitB))]!;
  }
  if (b !== null && b.length > 1) {
    // Adjacent digits, but `b` continues past this one — b's first digit
    // alone is above `a` and below `b`.
    return b.slice(0, 1);
  }
  // Adjacent digits and nowhere left to sit: keep a's digit and go deeper.
  return DIGITS[digitA]! + midpoint(a.slice(1), null);
}

/** The first key in an empty list. Mid-range, so there is room on both sides. */
export function rankFirst(): string {
  return midpoint("", null);
}

/** A key that sorts after everything. */
export function rankAfter(a: string): string {
  return midpoint(a, null);
}

/** A key that sorts before everything. */
export function rankBefore(b: string): string {
  return midpoint("", b);
}

/**
 * A key for a row dropped between two neighbours. Either side may be absent,
 * meaning the row was dropped at one end of the list.
 */
export function rankBetween(a: string | null | undefined, b: string | null | undefined): string {
  const lower = a ?? "";
  const upper = b ?? null;
  if (lower === "" && upper === null) return rankFirst();
  return midpoint(lower, upper);
}

/** Render `value` as a fixed-width base-62 string. */
function toBase62(value: number, width: number): string {
  let out = "";
  let v = value;
  for (let i = 0; i < width; i++) {
    out = DIGITS[v % 62]! + out;
    v = Math.floor(v / 62);
  }
  return out;
}

/**
 * `count` keys in ascending order, for bulk insert (CSV import).
 *
 * Two strategies, because the naive one is a trap. Repeatedly calling
 * `rankAfter` on the previous key walks toward 'z' and gains a character
 * every few inserts — importing 300 households that way yields keys 60
 * characters long, which is slow to index and ugly to debug.
 *
 * Unbounded (appending to an empty list), keys are spaced evenly across the
 * base-62 space instead, so 300 households get two-character keys.
 *
 * Bounded (inserting into an existing gap), the gap is bisected in balanced
 * order — middle first, then each half — so key length grows with log(count)
 * rather than with count.
 */
export function rankSequence(count: number, after?: string | null, before?: string | null): string[] {
  if (count < 0 || !Number.isInteger(count)) {
    throw new RankError(`count must be a non-negative integer, got ${count}`);
  }
  if (count === 0) return [];

  const lower = after ?? "";
  const upper = before ?? null;

  if (lower === "" && upper === null) {
    // Widen until there are at least two slots per key, so a key that would
    // end in '0' can be nudged up one without colliding with its neighbour.
    let width = 1;
    while (Math.pow(62, width) < 2 * (count + 1)) width++;
    const capacity = Math.pow(62, width);
    const step = Math.floor(capacity / (count + 1));
    return Array.from({ length: count }, (_, i) => {
      const value = step * (i + 1);
      return toBase62(value % 62 === 0 ? value + 1 : value, width);
    });
  }

  // Balanced bisection of an existing gap.
  const keys: string[] = [];
  const fill = (lo: string, hi: string | null, n: number): void => {
    if (n <= 0) return;
    const leftCount = Math.floor(n / 2);
    const key = midpoint(lo, hi);
    fill(lo, key, leftCount);
    keys.push(key);
    fill(key, hi, n - leftCount - 1);
  };
  fill(lower, upper, count);
  return keys;
}

/** Plain byte comparison — the same ordering Postgres applies under C collation. */
export function compareRank(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Keys lengthen as a gap is bisected repeatedly. Nothing breaks when they do,
 * but a list that has been reordered thousands of times is worth rewriting
 * with a fresh evenly-spaced sequence. Checked on load; rebalancing is a
 * deliberate action, never automatic — it rewrites every row.
 */
export function needsRebalance(ranks: readonly string[], maxLength = 24): boolean {
  return ranks.some((r) => r.length > maxLength);
}
