/**
 * Starter percentages for spec 19 §8 — the answer to "I'm seeing lots of
 * content about what % of budget to spend on different things" for a planner
 * staring at an empty allocation field.
 *
 * ---------------------------------------------------------------------------
 * THE NUMBERS BELOW ARE A PLACEHOLDER AWAITING THE PLANNER'S REVIEW.
 * ---------------------------------------------------------------------------
 * Spec 19 §12, decision 6: the mechanism is agreed, the specific percentages
 * are not. They're a composite of what wedding-industry budget breakdowns
 * generally publish, written without a live source to cite, and most of that
 * content assumes US weddings whose splits differ from NZ ones. A suggested
 * percentage that is confidently wrong is worse than a blank field — it is a
 * number the planner will anchor on. Correct this table before trusting it;
 * editing it is the whole maintenance story, since nothing else in the
 * feature depends on these values.
 *
 * Suggestions only ever fill a category that has no percentage yet (§8), and
 * every one stays editable afterwards.
 */

export type SuggestedAllocation = {
  /** Canonical category name, used for display in the suggestion UI. */
  name: string;
  pct: number;
  /** One line on what the percentage is meant to cover. */
  why: string;
  /** Lowercase substrings that identify an existing category as this one. */
  match: string[];
};

export const SUGGESTED_ALLOCATIONS: SuggestedAllocation[] = [
  { name: "Venue & hire", pct: 20, why: "The room, the marquee, tables, chairs and the rest of the hire list.", match: ["venue", "hire", "marquee", "location"] },
  { name: "Catering", pct: 20, why: "Food per head, plus service and staffing.", match: ["catering", "food", "meal", "caterer"] },
  { name: "Drinks", pct: 10, why: "Alcohol, non-alcoholic, and glassware.", match: ["drink", "bar", "alcohol", "beverage"] },
  { name: "Photography & video", pct: 12, why: "The one category nobody regrets and everybody underestimates.", match: ["photo", "video", "film", "videograph"] },
  { name: "Attire & beauty", pct: 8, why: "Both outfits, alterations, hair and make-up.", match: ["attire", "dress", "suit", "beauty", "hair", "make"] },
  { name: "Flowers & styling", pct: 8, why: "Bouquets, ceremony and table flowers, props and styling.", match: ["flower", "floral", "styling", "decor"] },
  { name: "Music & entertainment", pct: 7, why: "Band, DJ, ceremony musicians, anything else on a stage.", match: ["music", "band", "dj", "entertain"] },
  { name: "Stationery & website", pct: 3, why: "Save-the-dates, invitations, on-the-day printing.", match: ["stationery", "invit", "print", "website"] },
  { name: "Rings", pct: 3, why: "Both bands.", match: ["ring", "jewel"] },
  { name: "Celebrant & licence", pct: 2, why: "The person marrying you, and the paperwork that makes it count.", match: ["celebrant", "licence", "license", "registrar", "ceremony"] },
  { name: "Transport & accommodation", pct: 3, why: "Cars, the guest coach, and wedding-night rooms.", match: ["transport", "car", "coach", "accommodation", "travel"] },
  { name: "Cake & extras", pct: 2, why: "Cake, favours, and the long tail of small things.", match: ["cake", "dessert", "favour", "extra"] },
  { name: "Contingency", pct: 2, why: "Deliberately unspent. Something always comes up.", match: ["contingency", "buffer", "misc", "uncategorised"] },
];

/** Total of the table above — shown alongside the suggestion so the planner can see what it leaves unallocated. */
export const SUGGESTED_TOTAL_PCT = SUGGESTED_ALLOCATIONS.reduce((sum, s) => sum + s.pct, 0);

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The suggestion for one category name, or null when nothing in the table plausibly matches it. */
export function suggestionFor(categoryName: string): SuggestedAllocation | null {
  const normalised = normalise(categoryName);
  if (normalised === "") return null;
  return (
    SUGGESTED_ALLOCATIONS.find((s) => normalise(s.name) === normalised) ??
    SUGGESTED_ALLOCATIONS.find((s) => s.match.some((m) => normalised.includes(normalise(m)))) ??
    null
  );
}

/**
 * Percentages to apply, for categories that don't have one yet. A category
 * with a percentage already set is never touched, and a category nothing
 * matches is left alone rather than guessed at.
 */
export function suggestAllocations(
  categories: { id: string; name: string; allocation_pct: number | null }[],
): { id: string; name: string; pct: number }[] {
  return categories.flatMap((category) => {
    if (category.allocation_pct !== null) return [];
    const suggestion = suggestionFor(category.name);
    return suggestion ? [{ id: category.id, name: category.name, pct: suggestion.pct }] : [];
  });
}
