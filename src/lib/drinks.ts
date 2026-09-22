/**
 * Pure drink-plan arithmetic for `docs/planning-spreadsheet-gaps.md` §5,
 * Pattern C.
 *
 * Every formula and every constant below is taken from the source sheet's
 * cells rather than its prose, and is listed in that section. The one thing
 * this module changes is where the headcount comes from: the sheet takes a
 * number typed into a yellow box, and `v_drink_plans` resolves it from live
 * RSVPs. Nothing here knows that — a headcount arrives as a number and this
 * module multiplies it out.
 *
 * WHY THE CONSTANTS LIVE HERE AND NOT IN SQL
 *
 * Nothing in the database needs a bottle count: no view aggregates one, no
 * digest reads one, no policy depends on one. `0030_drink_plans.sql`'s header
 * has the full argument. Keeping "5 servings per 750ml" in one language means
 * one place to correct it when someone buys magnums.
 *
 * Deliberately decoupled from src/lib/types/database.ts, same reasoning as
 * src/lib/budget.ts's GuestCounts — a narrow shape any caller (server query,
 * client preview, test fixture) can build without this module needing to know
 * the database's row types at all.
 */

/**
 * The sheet's four intensity settings. Stored on the row as a number, not an
 * enum, so a room that drinks like 1.42 can be recorded honestly — these are
 * the presets a picker offers, not the set of legal values.
 */
export const INTENSITY_PRESETS = [
  { key: "light", label: "Light", value: 0.85 },
  { key: "average", label: "Average", value: 1.0 },
  { key: "heavy", label: "Heavy", value: 1.15 },
  { key: "extra_heavy", label: "Extra heavy", value: 1.3 },
] as const;

export type HeadcountSource = "confirmed" | "invited" | "manual";

/**
 * How many servings come out of one container, per drink type.
 *
 * A "serving" is what the sheet counts: one can of beer, one glass of wine,
 * one measure of spirits, one flute of champagne. The divisors are the
 * sheet's own.
 */
export const SERVINGS_PER_CONTAINER = {
  /** Sold by the can, so a can is a serving. */
  beer: 1,
  /** 750ml bottle, five glasses. */
  wine: 5,
  /** 1L bottle, nineteen measures. */
  spirits: 19,
  /** 750ml bottle, six flutes — smaller pour than wine. */
  champagne: 6,
  /** 2L bottle of a fizzy mixer. */
  mixer2L: 12,
  /** 1L carton of juice. */
  juice1L: 6,
} as const;

/** Still water is planned per head, not as a share of the alcohol. */
export const WATER_BOTTLES_PER_HEAD = 2;

/**
 * Mixers are a fraction of the SPIRIT servings, never of the total — nobody
 * mixes tonic into beer. Fractions are the sheet's.
 */
export const MIXERS = [
  { key: "cola", label: "Cola", shareOfSpirits: 0.2, servingsPerContainer: SERVINGS_PER_CONTAINER.mixer2L, container: "2L bottle" },
  { key: "diet_cola", label: "Diet cola", shareOfSpirits: 0.2, servingsPerContainer: SERVINGS_PER_CONTAINER.mixer2L, container: "2L bottle" },
  { key: "tonic", label: "Tonic", shareOfSpirits: 0.1, servingsPerContainer: SERVINGS_PER_CONTAINER.mixer2L, container: "2L bottle" },
  { key: "ginger_ale", label: "Ginger ale", shareOfSpirits: 0.2, servingsPerContainer: SERVINGS_PER_CONTAINER.mixer2L, container: "2L bottle" },
  { key: "soda_water", label: "Soda water", shareOfSpirits: 0.2, servingsPerContainer: SERVINGS_PER_CONTAINER.mixer2L, container: "2L bottle" },
  { key: "juice", label: "Juice", shareOfSpirits: 0.1, servingsPerContainer: SERVINGS_PER_CONTAINER.juice1L, container: "1L carton" },
] as const;

/** The inputs a human chooses. Mirrors `drink_plans`, minus the bookkeeping columns. */
export type DrinkPlanInput = {
  hours: number;
  intensity: number;
  champagneToast: boolean;
  beerShare: number;
  wineShare: number;
  spiritShare: number;
  redShare: number;
  whiteShare: number;
  roseShare: number;
};

export type ServingsBreakdown = {
  headcount: number;
  /** One flute per head when there is a toast, and these come OUT of the total below. */
  champagne: number;
  /** Everything except the toast, split by the three alcohol shares. */
  total: number;
  beer: number;
  wine: number;
  red: number;
  white: number;
  rose: number;
  spirits: number;
};

/**
 * Whether a trio of shares sums to 1.
 *
 * `0030_drink_plans.sql` enforces this as a CHECK on exact `numeric`, so the
 * database cannot hold a row that fails it. This is the same rule for the
 * editor, where the numbers are JavaScript floats and 0.25 + 0.25 + 0.5 is
 * not reliably 1 — hence the epsilon. The sheet asks the user to check this
 * by eye and silently produces nonsense when they get it wrong.
 */
export function sharesSumToOne(...shares: number[]): boolean {
  return Math.abs(shares.reduce((sum, s) => sum + s, 0) - 1) < 1e-9;
}

/** Servings, rounded up at each split — you cannot pour a fractional glass. */
export function servingsBreakdown(plan: DrinkPlanInput, headcount: number): ServingsBreakdown {
  const champagne = plan.champagneToast ? Math.max(0, Math.ceil(headcount)) : 0;

  // The toast is subtracted from the running total: a glass of fizz at 5pm is
  // a drink that guest then does not have from the bar. Floored at zero so a
  // toast-only plan (hours = 0) reports no bar rather than negative beer.
  const total = Math.max(0, Math.ceil(headcount * plan.hours * plan.intensity) - champagne);

  const beer = Math.ceil(total * plan.beerShare);
  const wine = Math.ceil(total * plan.wineShare);
  const spirits = Math.ceil(total * plan.spiritShare);

  return {
    headcount,
    champagne,
    total,
    beer,
    wine,
    red: Math.ceil(wine * plan.redShare),
    white: Math.ceil(wine * plan.whiteShare),
    rose: Math.ceil(wine * plan.roseShare),
    spirits,
  };
}

export type ShoppingLine = {
  key: string;
  label: string;
  /** Null for water, which is planned per head and has no serving count of its own. */
  servings: number | null;
  containers: number;
  /** What one container is, for the line's "x 750ml bottle" suffix. */
  container: string;
};

/** Containers for a serving count — always rounded up, since you buy whole bottles. */
export function containersFor(servings: number, servingsPerContainer: number): number {
  return Math.ceil(servings / servingsPerContainer);
}

/**
 * The shopping list: what to actually buy.
 *
 * Zero-serving lines are kept rather than filtered out. A plan with no
 * spirits should say "Gin/vodka/whisky — 0" so the person can see the share
 * is zero, rather than leaving them wondering whether the row is missing or
 * the maths is broken.
 */
export function shoppingList(plan: DrinkPlanInput, headcount: number): ShoppingLine[] {
  const s = servingsBreakdown(plan, headcount);
  const lines: ShoppingLine[] = [
    { key: "beer", label: "Beer", servings: s.beer, containers: containersFor(s.beer, SERVINGS_PER_CONTAINER.beer), container: "can" },
    { key: "red", label: "Red wine", servings: s.red, containers: containersFor(s.red, SERVINGS_PER_CONTAINER.wine), container: "750ml bottle" },
    { key: "white", label: "White wine", servings: s.white, containers: containersFor(s.white, SERVINGS_PER_CONTAINER.wine), container: "750ml bottle" },
    { key: "rose", label: "Rosé", servings: s.rose, containers: containersFor(s.rose, SERVINGS_PER_CONTAINER.wine), container: "750ml bottle" },
    { key: "spirits", label: "Spirits", servings: s.spirits, containers: containersFor(s.spirits, SERVINGS_PER_CONTAINER.spirits), container: "1L bottle" },
  ];

  if (s.champagne > 0) {
    lines.push({
      key: "champagne",
      label: "Champagne (toast)",
      servings: s.champagne,
      containers: containersFor(s.champagne, SERVINGS_PER_CONTAINER.champagne),
      container: "750ml bottle",
    });
  }

  for (const mixer of MIXERS) {
    const servings = Math.ceil(s.spirits * mixer.shareOfSpirits);
    lines.push({
      key: mixer.key,
      label: mixer.label,
      servings,
      containers: containersFor(servings, mixer.servingsPerContainer),
      container: mixer.container,
    });
  }

  lines.push({
    key: "water",
    label: "Still water",
    servings: null,
    containers: Math.ceil(Math.max(0, headcount) * WATER_BOTTLES_PER_HEAD),
    container: "bottle",
  });

  return lines;
}
