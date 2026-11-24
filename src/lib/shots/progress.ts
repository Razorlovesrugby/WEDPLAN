/**
 * Where a section stands (spec 52 §4.6, §5): missed shots, whether it is
 * behind its run sheet slot, and whether its shots fit the slot. Advice only,
 * never a block. Pure.
 */

export type ProgressShot = { id: string; kind: string; minutes: number; status: "todo" | "taken" | "skipped" | "later" };

/** One minute of changeover per group (§4.6). */
export const CHANGEOVER_MINUTES = 1;

export function estimatedMinutes(shots: readonly Pick<ProgressShot, "kind" | "minutes">[]): number {
  return shots.reduce((sum, s) => sum + s.minutes + (s.kind === "group" ? CHANGEOVER_MINUTES : 0), 0);
}

export type SlotFit = { groups: number; minutes: number; slotMinutes: number; over: boolean };

/** "8 groups · about 19 minutes of a 45 minute slot", and whether it is over. */
export function slotFit(shots: readonly ProgressShot[], startsAt: string | null, endsAt: string | null): SlotFit | null {
  if (!startsAt || !endsAt) return null;
  const slotMinutes = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000);
  if (!(slotMinutes > 0)) return null;
  const minutes = estimatedMinutes(shots);
  return { groups: shots.filter((s) => s.kind === "group").length, minutes, slotMinutes, over: minutes > slotMinutes };
}

export function counts(shots: readonly ProgressShot[]) {
  return {
    total: shots.length,
    taken: shots.filter((s) => s.status === "taken").length,
    skipped: shots.filter((s) => s.status === "skipped").length,
    later: shots.filter((s) => s.status === "later").length,
    todo: shots.filter((s) => s.status === "todo").length,
  };
}

/** Skipped, or still to do (or put off) once the section's slot has ended. */
export function missedShots<T extends ProgressShot>(shots: readonly T[], endsAt: string | null, now: Date): T[] {
  const ended = endsAt ? now.getTime() > Date.parse(endsAt) : false;
  return shots.filter((s) => s.status === "skipped" || (ended && (s.status === "todo" || s.status === "later")));
}

/**
 * Behind when the slot is under way and the shots still to do won't fit in
 * the time left, or when it has ended with shots left. A section with no
 * slot is never behind.
 */
export function behindSchedule(shots: readonly ProgressShot[], startsAt: string | null, endsAt: string | null, now: Date): boolean {
  if (!startsAt || !endsAt) return false;
  const t = now.getTime();
  if (t < Date.parse(startsAt)) return false;
  const remaining = shots.filter((s) => s.status === "todo" || s.status === "later");
  if (remaining.length === 0) return false;
  if (t >= Date.parse(endsAt)) return true;
  const leftMinutes = (Date.parse(endsAt) - t) / 60_000;
  return estimatedMinutes(remaining) > leftMinutes;
}

/** The shot to do next: the first still to do, else the first put off. */
export function nextShot<T extends Pick<ProgressShot, "status">>(shots: readonly T[]): T | null {
  return shots.find((s) => s.status === "todo") ?? shots.find((s) => s.status === "later") ?? null;
}
