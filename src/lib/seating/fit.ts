/**
 * "Colour by fit" (spec 53 Part G): how well each seated guest's seat suits
 * them. Green: knows someone at the table (same household, a shared tag, or a
 * "keep together" / "near" rule) and breaks no rule. Amber: knows nobody at the
 * table. Red: part of a warning. Pure.
 */

export type FitGuest = { id: string; householdId: string; tagIds: readonly string[] };
export type FitRule = { kind: string; guest_a: string; guest_b: string | null };
export type FitState = "green" | "amber" | "red";

export const FIT_COLOURS: Record<FitState, string> = { green: "#2f6f4f", amber: "#b07d2b", red: "#b3261e" };
export const FIT_LABELS: Record<FitState, string> = { green: "Knows someone", amber: "Knows nobody", red: "Part of a warning" };

export function computeFit(input: {
  guests: readonly FitGuest[];
  /** guestId → tableId, for seated guests. */
  seats: ReadonlyMap<string, string>;
  rules: readonly FitRule[];
  /** Guests who are part of a warning (spec 33 Part B). */
  warned: ReadonlySet<string>;
}): Map<string, FitState> {
  const byId = new Map(input.guests.map((g) => [g.id, g]));
  const atTable = new Map<string, string[]>();
  for (const [guestId, tableId] of input.seats) atTable.set(tableId, [...(atTable.get(tableId) ?? []), guestId]);

  const friends = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    friends.set(a, (friends.get(a) ?? new Set()).add(b));
    friends.set(b, (friends.get(b) ?? new Set()).add(a));
  };
  for (const r of input.rules) if ((r.kind === "together" || r.kind === "near") && r.guest_b) link(r.guest_a, r.guest_b);

  const out = new Map<string, FitState>();
  for (const [guestId, tableId] of input.seats) {
    const guest = byId.get(guestId);
    if (!guest) continue;
    if (input.warned.has(guestId)) {
      out.set(guestId, "red");
      continue;
    }
    const mates = (atTable.get(tableId) ?? []).filter((id) => id !== guestId);
    const knows = mates.some((id) => {
      const other = byId.get(id);
      if (!other) return false;
      if (other.householdId === guest.householdId) return true;
      if (friends.get(guestId)?.has(id)) return true;
      return other.tagIds.some((t) => guest.tagIds.includes(t));
    });
    out.set(guestId, knows ? "green" : "amber");
  }
  return out;
}

export function fitCounts(fit: ReadonlyMap<string, FitState>): Record<FitState, number> {
  const out: Record<FitState, number> = { green: 0, amber: 0, red: 0 };
  for (const state of fit.values()) out[state] += 1;
  return out;
}
