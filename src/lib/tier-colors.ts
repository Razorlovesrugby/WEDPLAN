/**
 * Fixed 8-colour palette for cut-line tiers, indexed by `tier_position`
 * (spec 5, part A, A6 decision 4). Not planner-choosable — deliberately a
 * flat lookup, not a formula, so every class name appears literally here for
 * Tailwind's content scanner to find (a computed class string like
 * `text-cut${n}` is invisible to it).
 *
 * The cap on cut lines (8, enforced in src/server/actions/rank.ts) is sized
 * to match this array exactly, so there is no cycling case to handle.
 */
const TEXT_CLASSES = [
  "text-cut0",
  "text-cut1",
  "text-cut2",
  "text-cut3",
  "text-cut4",
  "text-cut5",
  "text-cut6",
  "text-cut7",
] as const;

const BADGE_CLASSES = [
  "bg-cut0/10 text-cut0",
  "bg-cut1/10 text-cut1",
  "bg-cut2/10 text-cut2",
  "bg-cut3/10 text-cut3",
  "bg-cut4/10 text-cut4",
  "bg-cut5/10 text-cut5",
  "bg-cut6/10 text-cut6",
  "bg-cut7/10 text-cut7",
] as const;

export const MAX_CUT_LINES = TEXT_CLASSES.length;

export function tierTextClass(position: number): string {
  return TEXT_CLASSES[position] ?? TEXT_CLASSES[TEXT_CLASSES.length - 1]!;
}

export function tierBadgeClass(position: number): string {
  return BADGE_CLASSES[position] ?? BADGE_CLASSES[BADGE_CLASSES.length - 1]!;
}
