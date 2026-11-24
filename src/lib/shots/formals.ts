/**
 * Suggested family groups (spec 52 §4.5). Given each side's parents,
 * siblings, grandparents and step-parents, proposes the standard formals.
 * Step-parents and separated parents are proposed as separate groups, never
 * merged. Nothing is created until the couple ticks them. Pure.
 */

export type Who = { kind: "guest" | "person"; id: string } | { kind: "role"; role: string };

export type FamilySide = {
  /** "Aroha's" / "Sam's", for titles. */
  label: string;
  /** This side's partner (a person or a guest), if they are in the list. */
  partner: Who | null;
  parents: Who[];
  siblings: Who[];
  grandparents: Who[];
  stepParents: Who[];
  /** A named parent, for "with Mum" style titles, aligned to `parents` by index. */
  parentNames?: string[];
  stepParentNames?: string[];
};

export type FormalProposal = {
  key: string;
  title: string;
  people: Who[];
  minutes: number;
};

const same = (a: Who, b: Who) =>
  a.kind === b.kind && (a.kind === "role" ? a.role === (b as typeof a).role : a.id === (b as { id: string }).id);

function unique(list: Who[]): Who[] {
  const out: Who[] = [];
  for (const w of list) if (!out.some((x) => same(x, w))) out.push(w);
  return out;
}

export function suggestFormals(sides: readonly FamilySide[], couple: readonly Who[]): FormalProposal[] {
  const out: FormalProposal[] = [];
  const add = (key: string, title: string, people: Who[], minutes: number) => {
    const list = unique(people);
    if (list.length > 0) out.push({ key, title, people: list, minutes });
  };
  const withCouple = (...rest: Who[][]) => [...couple, ...rest.flat()];

  const everyone = sides.flatMap((s) => [...s.parents, ...s.siblings, ...s.grandparents]);
  if (everyone.length > 0) add("everyone", "Everyone in the family", withCouple(everyone), 4);

  for (const [i, s] of sides.entries()) {
    const whole = [...s.parents, ...s.siblings, ...s.grandparents];
    if (whole.length > 0) add(`family-${i}`, `The couple with ${s.label} whole family`, withCouple(whole), 3);
  }

  const grandparents = sides.flatMap((s) => s.grandparents);
  if (grandparents.length > 0) add("grandparents", "The couple with all the grandparents", withCouple(grandparents), 2);

  for (const [i, s] of sides.entries()) {
    if (s.parents.length > 0 && s.siblings.length > 0)
      add(`parents-siblings-${i}`, `The couple with ${s.label} parents and siblings`, withCouple(s.parents, s.siblings), 2);
    if (s.parents.length > 0) add(`parents-${i}`, `The couple with ${s.label} parents`, withCouple(s.parents), 2);
    if (s.grandparents.length > 0) add(`grandparents-${i}`, `The couple with ${s.label} grandparents`, withCouple(s.grandparents), 2);
  }

  // Each partner with each parent, on their own. Step-parents get their own group, never merged with a parent's.
  for (const [i, s] of sides.entries()) {
    if (!s.partner) continue;
    for (const [j, parent] of s.parents.entries()) {
      const name = s.parentNames?.[j];
      add(`partner-parent-${i}-${j}`, `${s.label.replace(/'s$/, "")} with ${name ?? `parent ${j + 1}`}`, [s.partner, parent], 1);
    }
    for (const [j, step] of s.stepParents.entries()) {
      const name = s.stepParentNames?.[j];
      add(`partner-step-${i}-${j}`, `${s.label.replace(/'s$/, "")} with ${name ?? `step-parent ${j + 1}`}`, [s.partner, step], 1);
    }
  }

  // Step-parents with the couple and their own parent: separate from the parents' group.
  for (const [i, s] of sides.entries()) {
    for (const [j, step] of s.stepParents.entries()) {
      add(`couple-step-${i}-${j}`, `The couple with ${s.stepParentNames?.[j] ?? `${s.label} step-parent ${j + 1}`}`, withCouple([step]), 1);
    }
  }
  return out;
}
