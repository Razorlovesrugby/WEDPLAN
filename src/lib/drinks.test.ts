import { describe, expect, it } from "vitest";
import {
  INTENSITY_PRESETS,
  MIXERS,
  SERVINGS_PER_CONTAINER,
  WATER_BOTTLES_PER_HEAD,
  containersFor,
  servingsBreakdown,
  sharesSumToOne,
  shoppingList,
  type DrinkPlanInput,
} from "./drinks";

/**
 * The sheet's own defaults: beer/wine/spirits 25/25/50, wine split
 * red/white/rose 40/40/20, average intensity — see
 * docs/planning-spreadsheet-gaps.md §5.
 */
const defaults: DrinkPlanInput = {
  hours: 5,
  intensity: 1.0,
  champagneToast: false,
  beerShare: 0.25,
  wineShare: 0.25,
  spiritShare: 0.5,
  redShare: 0.4,
  whiteShare: 0.4,
  roseShare: 0.2,
};

describe("servingsBreakdown", () => {
  it("reproduces the worked example in docs/ai-native-spec.md §6", () => {
    // headcount 118 x hours 5 x intensity 1.00 - champagne 118 = 472
    const s = servingsBreakdown({ ...defaults, champagneToast: true }, 118);
    expect(s.champagne).toBe(118);
    expect(s.total).toBe(472);
  });

  it("does not subtract a toast that is not happening", () => {
    const s = servingsBreakdown(defaults, 118);
    expect(s.champagne).toBe(0);
    expect(s.total).toBe(590);
  });

  it("splits the total by the three alcohol shares", () => {
    const s = servingsBreakdown(defaults, 100); // 100 x 5 x 1.0 = 500
    expect(s.total).toBe(500);
    expect(s.beer).toBe(125);
    expect(s.wine).toBe(125);
    expect(s.spirits).toBe(250);
  });

  it("splits the wine share again, three ways", () => {
    const s = servingsBreakdown(defaults, 100);
    expect(s.red).toBe(50); // 125 x 0.4
    expect(s.white).toBe(50);
    expect(s.rose).toBe(25); // 125 x 0.2
  });

  it("scales with intensity, which is what the four presets are for", () => {
    const light = servingsBreakdown({ ...defaults, intensity: 0.85 }, 100);
    const heavy = servingsBreakdown({ ...defaults, intensity: 1.3 }, 100);
    expect(light.total).toBe(425);
    expect(heavy.total).toBe(650);
    expect(INTENSITY_PRESETS.map((p) => p.value)).toEqual([0.85, 1.0, 1.15, 1.3]);
  });

  it("rounds servings up — you cannot pour a fractional glass", () => {
    // 33 x 2 x 1.15 = 75.9
    expect(servingsBreakdown({ ...defaults, hours: 2, intensity: 1.15 }, 33).total).toBe(76);
  });

  it("never reports negative drinks when the toast is bigger than the bar", () => {
    // A toast-only plan: no bar hours at all, so the total floors at zero
    // rather than going negative and producing nonsense downstream.
    const s = servingsBreakdown({ ...defaults, hours: 0, champagneToast: true }, 80);
    expect(s.champagne).toBe(80);
    expect(s.total).toBe(0);
    expect(s.beer).toBe(0);
    expect(s.spirits).toBe(0);
  });

  it("reports nothing at all for a headcount of zero", () => {
    const s = servingsBreakdown({ ...defaults, champagneToast: true }, 0);
    expect(s.total).toBe(0);
    expect(s.champagne).toBe(0);
  });
});

describe("containersFor", () => {
  it("always rounds up, because you buy whole bottles", () => {
    expect(containersFor(125, SERVINGS_PER_CONTAINER.wine)).toBe(25);
    expect(containersFor(126, SERVINGS_PER_CONTAINER.wine)).toBe(26);
    expect(containersFor(1, SERVINGS_PER_CONTAINER.spirits)).toBe(1);
    expect(containersFor(0, SERVINGS_PER_CONTAINER.wine)).toBe(0);
  });
});

describe("shoppingList", () => {
  const list = shoppingList(defaults, 100);
  const line = (key: string) => list.find((l) => l.key === key)!;

  it("uses the sheet's divisors per drink type", () => {
    expect(line("beer").containers).toBe(125); // 125 servings, 1 per can
    expect(line("red").containers).toBe(10); // 50 servings, 5 per 750ml
    expect(line("white").containers).toBe(10);
    expect(line("rose").containers).toBe(5); // 25 servings
    expect(line("spirits").containers).toBe(14); // 250 servings, 19 per 1L -> 13.2
  });

  it("takes mixers as a fraction of the SPIRIT servings, never of the total", () => {
    // 250 spirit servings: cola 0.2 -> 50 servings -> 12 per 2L -> 5 bottles
    expect(line("cola").servings).toBe(50);
    expect(line("cola").containers).toBe(5);
    // tonic 0.1 -> 25 servings -> 3 bottles
    expect(line("tonic").servings).toBe(25);
    expect(line("tonic").containers).toBe(3);
    // juice 0.1 -> 25 servings, but 6 per 1L carton -> 5 cartons
    expect(line("juice").servings).toBe(25);
    expect(line("juice").containers).toBe(5);
  });

  it("plans water per head rather than as a share of the alcohol", () => {
    expect(line("water").servings).toBeNull();
    expect(line("water").containers).toBe(100 * WATER_BOTTLES_PER_HEAD);
  });

  it("omits the champagne line entirely when there is no toast", () => {
    expect(list.some((l) => l.key === "champagne")).toBe(false);
  });

  it("includes champagne at six flutes to the bottle when there is one", () => {
    const withToast = shoppingList({ ...defaults, champagneToast: true }, 100);
    const champagne = withToast.find((l) => l.key === "champagne")!;
    expect(champagne.servings).toBe(100);
    expect(champagne.containers).toBe(17); // 100 / 6 -> 16.67
  });

  it("keeps a zero line rather than hiding it", () => {
    // Spirits at zero share: the row stays so the person can see the share is
    // zero, rather than wondering whether the line is missing.
    const dry = shoppingList({ ...defaults, beerShare: 0.5, wineShare: 0.5, spiritShare: 0 }, 100);
    const spirits = dry.find((l) => l.key === "spirits")!;
    expect(spirits.servings).toBe(0);
    expect(spirits.containers).toBe(0);
    for (const mixer of MIXERS) {
      expect(dry.find((l) => l.key === mixer.key)!.containers).toBe(0);
    }
  });
});

describe("sharesSumToOne", () => {
  it("accepts the sheet's defaults despite float arithmetic", () => {
    // 0.25 + 0.25 + 0.5 and 0.4 + 0.4 + 0.2 are not reliably 1 in floating
    // point, which is exactly why this helper exists rather than `=== 1`.
    expect(sharesSumToOne(0.25, 0.25, 0.5)).toBe(true);
    expect(sharesSumToOne(0.4, 0.4, 0.2)).toBe(true);
  });

  it("rejects a split that does not add up", () => {
    expect(sharesSumToOne(0.25, 0.25, 0.25)).toBe(false);
    expect(sharesSumToOne(0.5, 0.5, 0.5)).toBe(false);
  });
});
