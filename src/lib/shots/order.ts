/**
 * Shooting order (spec 52 §4.4). A **call-back** is someone who steps out of
 * the line-up for a shot and is needed again later; the couple are ignored
 * (they are in nearly every shot). Pure.
 */

export type OrderShot = {
  id: string;
  /** Keys of the people in the shot (guest, person or role keys). */
  people: readonly string[];
};

const set = (shot: OrderShot) => new Set(shot.people);

/** The call-backs in this order, counting each gap between a person's appearances once. */
export function callBacks(order: readonly OrderShot[], ignore: ReadonlySet<string> = new Set()): number {
  const sets = order.map(set);
  const everyone = new Set<string>();
  for (const s of sets) for (const p of s) if (!ignore.has(p)) everyone.add(p);

  let total = 0;
  for (const person of everyone) {
    let inShot = false;
    let seen = false;
    for (const s of sets) {
      const here = s.has(person);
      if (here && !inShot && seen) total += 1;
      if (here) seen = true;
      inShot = here;
    }
  }
  return total;
}

/** Who to call up for shot `index`: in it, and not in the shot before. */
export function callUp(order: readonly OrderShot[], index: number, ignore: ReadonlySet<string> = new Set()): string[] {
  const here = order[index];
  if (!here) return [];
  const before = index > 0 ? set(order[index - 1]!) : new Set<string>();
  return here.people.filter((p) => !ignore.has(p) && !before.has(p));
}

/** Who can go after shot `index - 1`: in the last shot, not in this one, and not in any later one. */
export function canGo(order: readonly OrderShot[], index: number, ignore: ReadonlySet<string> = new Set()): string[] {
  if (index <= 0) return [];
  const last = order[index - 1];
  if (!last) return [];
  const later = new Set<string>();
  for (let i = index; i < order.length; i++) for (const p of order[i]!.people) later.add(p);
  return last.people.filter((p) => !ignore.has(p) && !later.has(p));
}

/** "Bigger groups earlier": lower is better. Sum of position times the group's size. */
function lateness(order: readonly OrderShot[]): number {
  return order.reduce((sum, shot, i) => sum + i * shot.people.length, 0);
}

function better(a: readonly OrderShot[], b: readonly OrderShot[], ignore: ReadonlySet<string>): boolean {
  const ca = callBacks(a, ignore);
  const cb = callBacks(b, ignore);
  return ca < cb || (ca === cb && lateness(a) < lateness(b));
}

export const EXHAUSTIVE_LIMIT = 8;

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i]!, ...tail];
  }
}

export type OrderSuggestion = {
  /** Shot ids in the suggested order. */
  order: string[];
  callBacks: number;
  /** The call-backs of the order the couple has now. */
  before: number;
  /** True when it already is the best this search found. */
  unchanged: boolean;
};

/**
 * The order with the fewest call-backs; ties shoot bigger groups earlier.
 * Up to 8 shots the search is exhaustive; above that it is a greedy pass
 * followed by pairwise swaps until no swap improves it.
 */
export function suggestOrder(shots: readonly OrderShot[], ignore: ReadonlySet<string> = new Set()): OrderSuggestion {
  const before = callBacks(shots, ignore);
  let best: OrderShot[];

  if (shots.length <= EXHAUSTIVE_LIMIT) {
    best = [...shots];
    for (const candidate of permutations(shots)) if (better(candidate, best, ignore)) best = candidate;
  } else {
    // Greedy: start with the biggest group, then add whichever shot adds the fewest call-backs.
    const remaining = [...shots].sort((a, b) => b.people.length - a.people.length);
    best = [remaining.shift()!];
    while (remaining.length > 0) {
      let pick = 0;
      for (let i = 1; i < remaining.length; i++) {
        if (better([...best, remaining[i]!], [...best, remaining[pick]!], ignore)) pick = i;
      }
      best.push(remaining.splice(pick, 1)[0]!);
    }
    // Pairwise swaps until nothing improves.
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < best.length; i++) {
        for (let j = i + 1; j < best.length; j++) {
          const swapped = [...best];
          [swapped[i], swapped[j]] = [swapped[j]!, swapped[i]!];
          if (better(swapped, best, ignore)) {
            best = swapped;
            improved = true;
          }
        }
      }
    }
  }

  // Keep the couple's own order when the suggestion is no better, so "Use this order" never churns.
  const keep = !better(best, shots, ignore);
  const order = (keep ? [...shots] : best).map((s) => s.id);
  return { order, callBacks: keep ? before : callBacks(best, ignore), before, unchanged: keep };
}
