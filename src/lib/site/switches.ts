import { MOTION_EFFECTS, MOTION_EFFECT_COPY, type MotionEffect } from "./motion";

/**
 * Every switch the planner has (spec 27 §4, E9): "everything is a switch."
 *
 * Anything this work puts in front of a guest — an element, an effect, a
 * personal touch — can be turned off, has a default we state, and closes up
 * cleanly when off. This is the list, as data, so that rule is checkable rather
 * than a hope: `switches.test.ts` fails if a motion effect exists with no
 * switch, or a switch has nothing to say about what happens when it is off.
 *
 * It describes switches; it does not store them. Each lives where its `where`
 * says — the theme (`site_content['theme']`), a block's payload, or a block's
 * style — and each is read by the one component that owns the element.
 *
 * **Not here, on purpose:** the things that are correctness rather than
 * decoration — `prefers-reduced-motion` (follows the guest's device), the
 * `@supports` guards, the privacy rules, and the scrim that keeps text legible
 * over a photograph. A switch that can produce an unreadable or leaking page is
 * the failure spec 23 §7 named.
 */

export type SwitchGroup = "motion" | "layout" | "cover" | "personal" | "photos";

export type SwitchDef = {
  /** Stable, dotted. `motion.reading_line`. */
  id: string;
  group: SwitchGroup;
  label: string;
  /** Where the planner finds it. */
  where: string;
  /** True: on for a new site. "level": on or off by the motion level. */
  defaultOn: boolean | "level";
  /** What the page does when it is off — the "no hole" half of the rule. */
  whenOff: string;
};

const MOTION_WHEN_OFF: Record<MotionEffect, string> = {
  cover_handover: "The cover stays still as it scrolls away.",
  section_arrivals: "Sections are simply present.",
  reading_line: "No line across the top.",
  nav_condense: "The menu keeps its bar at all times.",
  photo_arrival: "Photographs are plain images.",
  stagger: "A list arrives together.",
};

const motionSwitches: SwitchDef[] = MOTION_EFFECTS.map((effect) => ({
  id: `motion.${effect}`,
  group: "motion",
  label: MOTION_EFFECT_COPY[effect].label,
  where: "Rail → Motion → Customise",
  defaultOn: "level",
  whenOff: MOTION_WHEN_OFF[effect],
}));

/** The hero's own switches (spec 27 E9) — each one a payload key on the hero block. */
const coverSwitches: SwitchDef[] = [
  ["show_greeting", "Address them by name", "On a guest's own page", "Names alone; the cover closes up around them."],
  ["show_cover_line", "A line of invitation", "On a guest's own page", "The names are followed directly by the date."],
  ["show_scroll_cue", "The arrow that says there is more", "On a guest's own page", "No arrow."],
  ["tall_cover", "A full-height first screen", "On a guest's own page", "The hero keeps the shared site's height."],
  ["show_date", "The date", "Hero block", "No date line; nothing is left in its place."],
  ["show_location", "The place", "Hero block", "No place line."],
  ["show_intro", "A line about why", "Hero block", "The line is not drawn and its space closes up."],
  ["show_counter", "Days-to-go in the corner", "Hero block", "No corner counter."],
  ["show_countdown", "The big countdown", "Hero block", "No countdown under the hero."],
].map(([key, label, where, whenOff]) => ({
  id: `cover.${key}`,
  group: "cover" as const,
  label: label as string,
  where: `Hero block → ${where}`,
  // Every cover line is on unless the planner chose otherwise — except the big
  // countdown, which has always been opt-in.
  defaultOn: key !== "show_countdown",
  whenOff: whenOff as string,
}));

export const SWITCHES: SwitchDef[] = [
  ...coverSwitches,
  ...motionSwitches,
  {
    id: "layout.chapter_rail",
    group: "layout",
    label: "Chapter list down the side",
    where: "Rail → Page",
    defaultOn: true,
    whenOff: "The list is not drawn; the page itself is unchanged.",
  },
  {
    id: "layout.section_numbers",
    group: "layout",
    label: "Numbers above headings",
    where: "Rail → Page",
    defaultOn: true,
    whenOff: "The heading stands alone, with no eyebrow and no ornament.",
  },
];

export function switchById(id: string): SwitchDef | undefined {
  return SWITCHES.find((entry) => entry.id === id);
}
