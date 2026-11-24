/**
 * A plan's settings sheet (spec 57 Part I): the thresholds that were the
 * app's own guesses, each changeable per plan. Stored as one jsonb on
 * `seating_plans`; anything missing or out of range takes its default.
 */

export type PlanSettings = {
  /** Walkway between two tables' edges: at least `comfortable` cm is fine, at least `tight` cm is tight, below that is too tight. */
  walkway: { comfortable: number; tight: number };
  /** Shared dishes need the middle of the table: a long or banquet table narrower than `longWidthCm`, a round one under `roundCm` across. */
  tightForShared: { longWidthCm: number; roundCm: number };
  /** A centrepiece taller than this (cm) gets in the way of passing dishes. */
  tallCm: number;
  /** Long and banquet tables at least this long (cm) get two of each shared dish. Null = no minimum. */
  longTableCm: number | null;
  /** Default footprint per fixture kind, over the built-in ones. */
  defaultSizes: Record<string, { width: number; depth: number }>;
};

export const DEFAULT_SETTINGS: PlanSettings = {
  walkway: { comfortable: 120, tight: 90 },
  tightForShared: { longWidthCm: 80, roundCm: 150 },
  tallCm: 30,
  longTableCm: null,
  defaultSizes: {},
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function int(v: unknown, lo: number, hi: number): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null;
}

export function parseSettings(raw: unknown): PlanSettings {
  const s: PlanSettings = {
    walkway: { ...DEFAULT_SETTINGS.walkway },
    tightForShared: { ...DEFAULT_SETTINGS.tightForShared },
    tallCm: DEFAULT_SETTINGS.tallCm,
    longTableCm: null,
    defaultSizes: {},
  };
  if (!isObj(raw)) return s;
  if (isObj(raw.walkway)) {
    const c = int(raw.walkway.comfortable, 30, 400);
    const t = int(raw.walkway.tight, 20, 400);
    if (c !== null) s.walkway.comfortable = c;
    if (t !== null) s.walkway.tight = t;
    if (s.walkway.tight > s.walkway.comfortable) s.walkway.tight = s.walkway.comfortable;
  }
  if (isObj(raw.tightForShared)) {
    const l = int(raw.tightForShared.longWidthCm, 30, 300);
    const r = int(raw.tightForShared.roundCm, 60, 500);
    if (l !== null) s.tightForShared.longWidthCm = l;
    if (r !== null) s.tightForShared.roundCm = r;
  }
  const tall = int(raw.tallCm, 5, 300);
  if (tall !== null) s.tallCm = tall;
  s.longTableCm = int(raw.longTableCm, 100, 2000);
  if (isObj(raw.defaultSizes)) {
    for (const [kind, v] of Object.entries(raw.defaultSizes).slice(0, 40)) {
      if (!isObj(v)) continue;
      const w = int(v.width, 10, 5000);
      const d = int(v.depth, 10, 5000);
      if (w !== null && d !== null) s.defaultSizes[kind] = { width: w, depth: d };
    }
  }
  return s;
}

export type Walkway = "comfortable" | "tight" | "too_tight";

export function classifyWalkway(distanceCm: number, s: Pick<PlanSettings, "walkway">): Walkway {
  if (distanceCm >= s.walkway.comfortable) return "comfortable";
  if (distanceCm >= s.walkway.tight) return "tight";
  return "too_tight";
}
