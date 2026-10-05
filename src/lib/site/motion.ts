/**
 * How much the guest page moves (spec 27 §6, E4, E9).
 *
 * One control and a short list of switches behind it, not a settings screen:
 * the planner picks a **level** — Still, Gentle, Cinematic — and the level says
 * which **effects** are on. An override can then turn one effect off (or on)
 * from there, so "Gentle, but no reading line" is
 * `{ level: "gentle", off: ["reading_line"] }`, and an effect added next year
 * ships with a default for each level and needs no migration of anybody's saved
 * theme.
 *
 * The page root carries the result as two attributes (`motionAttributes`), and
 * the **stylesheet** decides what each effect means — the same way
 * `data-site-theme` already works. Nothing in React reads the level.
 *
 * **Still means still.** It removes scroll animation entirely, and overrides do
 * not bring any of it back: somebody who asked for a quiet document has asked
 * for one. That is separate from `prefers-reduced-motion`, which follows the
 * guest's own system setting and which the planner cannot override either way
 * (`globals.css` keeps the fade and drops the movement).
 *
 * Pure, and never throws: this is read from JSONB written by an editor that has
 * changed shape before, and a guest must never see an unstyled page because a
 * key was renamed.
 */

export const MOTION_LEVELS = ["still", "gentle", "cinematic"] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];

/**
 * Every effect that exists. An effect is added here when it is *built*, never
 * before: a switch for something that does nothing is a lie in the editor.
 */
export const MOTION_EFFECTS = [
  "cover_handover",
  "section_arrivals",
  "reading_line",
  "nav_condense",
  "photo_arrival",
  "stagger",
] as const;
export type MotionEffect = (typeof MOTION_EFFECTS)[number];

/** What each level switches on. `still` is empty on purpose. */
export const LEVEL_EFFECTS: Record<MotionLevel, readonly MotionEffect[]> = {
  still: [],
  gentle: ["section_arrivals", "reading_line", "nav_condense"],
  cinematic: [
    "cover_handover",
    "section_arrivals",
    "reading_line",
    "nav_condense",
    "photo_arrival",
    "stagger",
  ],
};

export type MotionSettings = {
  level: MotionLevel;
  /** Effects turned off from the level's default. */
  off: MotionEffect[];
  /** Effects turned on beyond the level's default. */
  on: MotionEffect[];
};

export const DEFAULT_MOTION: MotionSettings = { level: "gentle", off: [], on: [] };

export const MOTION_LEVEL_COPY: Record<MotionLevel, { label: string; description: string }> = {
  still: {
    label: "Still",
    description: "Nothing moves on scroll. A quiet document.",
  },
  gentle: {
    label: "Gentle",
    description: "Sections ease in, a thin line tracks how far down they are, the menu settles.",
  },
  cinematic: {
    label: "Cinematic",
    description: "Everything in Gentle, plus photographs that arrive and lists that stagger in.",
  },
};

export const MOTION_EFFECT_COPY: Record<MotionEffect, { label: string; help: string }> = {
  cover_handover: {
    label: "The cover drifts away",
    help: "The first photograph eases back and darkens as they scroll, with the names moving slower than the page.",
  },
  section_arrivals: { label: "Sections ease in", help: "Each section fades up as it scrolls into view." },
  reading_line: { label: "Reading line", help: "A thin line across the top that fills as they scroll." },
  nav_condense: { label: "Menu settles", help: "The menu is bare at the top and gains its bar once they scroll." },
  photo_arrival: { label: "Photographs arrive", help: "Photos settle into place as they enter." },
  stagger: { label: "Lists stagger in", help: "Rows of a list arrive one after another." },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function effectList(value: unknown): MotionEffect[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(MOTION_EFFECTS);
  // Unknown names are dropped, not thrown: a theme saved by a later version of
  // this app, read by an earlier one, must still render.
  return [...new Set(value.filter((entry): entry is MotionEffect => typeof entry === "string" && known.has(entry)))];
}

/** Read `site_content['theme'].payload.motion`. Absent or rubbish is Gentle. */
export function resolveMotion(value: unknown): MotionSettings {
  if (!isRecord(value)) return DEFAULT_MOTION;
  const level = MOTION_LEVELS.find((candidate) => candidate === value["level"]) ?? DEFAULT_MOTION.level;
  return { level, off: effectList(value["off"]), on: effectList(value["on"]) };
}

/** The effects that are actually running. `still` ignores overrides. */
export function activeEffects(settings: MotionSettings): MotionEffect[] {
  if (settings.level === "still") return [];
  const effects = new Set<MotionEffect>(LEVEL_EFFECTS[settings.level]);
  for (const effect of settings.on) effects.add(effect);
  for (const effect of settings.off) effects.delete(effect);
  // Declared order, so the attribute is stable and a snapshot of it is readable.
  return MOTION_EFFECTS.filter((effect) => effects.has(effect));
}

/** The two attributes the page root carries; `globals.css` reads them. */
export function motionAttributes(settings: MotionSettings): {
  "data-motion": MotionLevel;
  "data-fx": string;
} {
  return { "data-motion": settings.level, "data-fx": activeEffects(settings).join(" ") };
}

/**
 * What is stored. Overrides that say what the level already says are dropped,
 * so changing the level later is not fought by stale overrides: pick Cinematic,
 * turn the reading line off, move to Gentle, and the reading line is off
 * because *that* was asked for — not because of a leftover.
 */
export function serialiseMotion(settings: MotionSettings): {
  level: MotionLevel;
  off: MotionEffect[];
  on: MotionEffect[];
} {
  const base = new Set<MotionEffect>(LEVEL_EFFECTS[settings.level]);
  return {
    level: settings.level,
    off: settings.off.filter((effect) => base.has(effect)),
    on: settings.on.filter((effect) => !base.has(effect)),
  };
}

/** Flip one effect from where the current settings have it. */
export function toggleEffect(settings: MotionSettings, effect: MotionEffect): MotionSettings {
  const running = activeEffects(settings).includes(effect);
  const off = settings.off.filter((entry) => entry !== effect);
  const on = settings.on.filter((entry) => entry !== effect);
  return serialiseMotion({
    level: settings.level,
    off: running ? [...off, effect] : off,
    on: running ? on : [...on, effect],
  });
}

/** Changing level keeps only the overrides that still mean something. */
export function setLevel(settings: MotionSettings, level: MotionLevel): MotionSettings {
  return serialiseMotion({ ...settings, level });
}

// ---------------------------------------------------------------------------
// Layout switches that are not motion (E9): the chapter rail and section numbers.
// ---------------------------------------------------------------------------

export type SiteLayout = {
  /** The chapter list down the right edge (Editorial, wide screens). */
  chapterRail: boolean;
  /** `04 · ATTIRE` above a heading. Off leaves the heading alone. */
  sectionNumbers: boolean;
};

export const DEFAULT_LAYOUT: SiteLayout = { chapterRail: true, sectionNumbers: true };

export function resolveLayout(value: unknown): SiteLayout {
  if (!isRecord(value)) return DEFAULT_LAYOUT;
  return {
    chapterRail: typeof value["chapter_rail"] === "boolean" ? value["chapter_rail"] : DEFAULT_LAYOUT.chapterRail,
    sectionNumbers:
      typeof value["section_numbers"] === "boolean" ? value["section_numbers"] : DEFAULT_LAYOUT.sectionNumbers,
  };
}
