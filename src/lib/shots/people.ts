import { personKey, type ShotPerson } from "./model";

/** A person as the shot actions take them (spec 58). Mirrors `ShotPersonInput`. */
export type PersonInput = { kind: "guest" | "person"; id: string } | { kind: "role"; role: string };

export const inputKey = (p: PersonInput) => (p.kind === "role" ? personKey("role", p.role.trim()) : personKey(p.kind, p.id));

export function toInput(p: ShotPerson): PersonInput {
  return p.kind === "role" ? { kind: "role", role: p.role } : { kind: p.kind, id: p.id };
}

/** `existing` followed by whoever in `add` isn't already there. Never removes anyone (spec 58 §3.2). */
export function mergePeople(existing: PersonInput[], add: PersonInput[]): PersonInput[] {
  const seen = new Set(existing.map(inputKey));
  const out = [...existing];
  for (const p of add) {
    const key = inputKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * The people of the nearest preceding shots, most recent first, no repeats
 * (spec 58 §3.3). `shots` is the section in order; `index` is the shot being
 * edited, or `shots.length` for a new one.
 */
export function recentPeople(shots: { people: ShotPerson[] }[], index: number, shotCount = 3, max = 8): ShotPerson[] {
  const seen = new Set<string>();
  const out: ShotPerson[] = [];
  for (let i = Math.min(index, shots.length) - 1; i >= Math.max(0, index - shotCount); i--) {
    for (const p of shots[i]!.people) {
      if (seen.has(p.key)) continue;
      seen.add(p.key);
      out.push(p);
    }
  }
  return out.slice(0, max);
}

/** Guests in a household or on a side, as people inputs. */
export function groupPeople(
  guests: { id: string; householdId: string | null; side: string | null }[],
  by: { household: string } | { side: string },
): PersonInput[] {
  return guests
    .filter((g) => ("household" in by ? g.householdId === by.household : g.side === by.side))
    .map((g) => ({ kind: "guest" as const, id: g.id }));
}
