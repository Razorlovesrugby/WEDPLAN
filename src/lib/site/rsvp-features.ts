/**
 * The RSVP form's switches (spec 35, "make sure all of the changes are optional
 * and toggleable").
 *
 * Every change spec 35 made to the guest reply form can be turned off on the
 * RSVP block, one by one. Off restores what the form did before that change.
 *
 * **Stored as what is off**, on the block's style (`BlockStyle.rsvpOff`), like
 * `lightbox`: absent means every feature on, so every existing RSVP block keeps
 * the form it already shows and nothing needs migrating.
 *
 * The petals and the people arriving one by one are motion, so they are not
 * here: they are `reply_petals` and `reply_arrivals` in `motion.ts`, switched
 * with the rest of the page's movement.
 *
 * **These include fixes, not only decoration** — contrast, touch, nesting. The
 * switch registry's rule (`switches.ts`) is that correctness is not a switch;
 * the planner asked for these anyway (spec 35, Answered 2026-10-23), so each
 * one's help says plainly what turning it off costs.
 */

export const RSVP_FEATURES = [
  // Round one: the look.
  "answer_cards",
  "person_cards",
  "divider",
  "event_times",
  "pill_toggles",
  "ruled_fields",
  "chips",
  "pill_button",
  "soft_panels",
  "new_wording",
  // Round two: fixes and behaviour.
  "readable_text",
  "touch_hover",
  "flat_card_look",
  "steady_chips",
  "skip_not_coming",
  "own_required_check",
  "round_calendar",
  "banner_style",
] as const;
export type RsvpFeature = (typeof RSVP_FEATURES)[number];

export type RsvpFeatureGroup = "look" | "fixes" | "behaviour";

export const RSVP_FEATURE_COPY: Record<
  RsvpFeature,
  { group: RsvpFeatureGroup; label: string; whenOff: string; needs?: RsvpFeature }
> = {
  answer_cards: {
    group: "look",
    label: "Rounded “all of us” answers with icons",
    whenOff: "Two plain square boxes, as before.",
  },
  person_cards: {
    group: "look",
    label: "A card per person, with their initial",
    whenOff: "Each person is a plain box headed by their name.",
  },
  divider: {
    group: "look",
    label: "“Or answer one by one” line",
    whenOff: "No line between the answers and the people.",
  },
  event_times: {
    group: "look",
    label: "Times under each event",
    whenOff: "Just the event's name.",
  },
  pill_toggles: {
    group: "look",
    label: "Rounded Yes / No switches",
    whenOff: "Two small square buttons per event.",
  },
  ruled_fields: {
    group: "look",
    label: "Fields as a line to write on",
    whenOff: "Boxed fields with plain labels.",
  },
  chips: {
    group: "look",
    label: "Options as tappable buttons",
    whenOff: "Round radio buttons, tick boxes and a yes/no dropdown.",
  },
  pill_button: {
    group: "look",
    label: "Rounded send button",
    whenOff: "A square button on the left.",
  },
  soft_panels: {
    group: "look",
    label: "Rounded confirmation, closed note and Card layout",
    whenOff: "Square boxes, and a hairline progress bar in the Card layout.",
  },
  new_wording: {
    group: "look",
    label: "New wording",
    whenOff: "“Not able to” and “Confirm our RSVP”, as before.",
  },
  readable_text: {
    group: "fixes",
    label: "Stronger hint text and field lines",
    whenOff: "Fainter hints and lines. They no longer pass accessibility contrast checks.",
    needs: "ruled_fields",
  },
  touch_hover: {
    group: "fixes",
    label: "No stuck highlight after a tap on a phone",
    whenOff: "On phones, the last thing tapped stays highlighted until the next tap.",
  },
  flat_card_look: {
    group: "fixes",
    label: "No cards inside the Card layout",
    whenOff: "In the Card layout, each person is a card inside the card. It's tight on a phone.",
  },
  steady_chips: {
    group: "fixes",
    label: "Option buttons keep their size when picked",
    whenOff: "A picked option grows to fit its tick and nudges the ones beside it.",
    needs: "chips",
  },
  skip_not_coming: {
    group: "behaviour",
    label: "Don't ask people who aren't coming",
    whenOff: "Everyone is asked every question, even after saying no to everything.",
  },
  own_required_check: {
    group: "behaviour",
    label: "Our own “please pick one” messages",
    whenOff:
      "The browser's own warning, which can appear in an odd place. A required pick-several question is not enforced.",
    needs: "chips",
  },
  round_calendar: {
    group: "look",
    label: "Rounded calendar box after replying",
    whenOff: "A square box.",
  },
  banner_style: {
    group: "look",
    label: "Matching banner when they reply from the email",
    whenOff: "The banner keeps its older square look.",
  },
};

/** Read `BlockStyle.rsvpOff`. Unknown names are dropped, never thrown. */
export function resolveRsvpOff(value: unknown): RsvpFeature[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(RSVP_FEATURES);
  return RSVP_FEATURES.filter((feature) => value.includes(feature) && known.has(feature));
}

/** Switch one feature, returning what to store: `undefined` once nothing is off. */
export function toggleRsvpFeature(
  off: readonly RsvpFeature[],
  feature: RsvpFeature,
  on: boolean,
): RsvpFeature[] | undefined {
  const next = on ? off.filter((entry) => entry !== feature) : [...new Set([...off, feature])];
  const ordered = RSVP_FEATURES.filter((entry) => next.includes(entry));
  return ordered.length > 0 ? ordered : undefined;
}

/** The attribute the stylesheet reads: `data-rsvp-off="touch_hover chips"`. */
export function rsvpOffAttribute(off: readonly RsvpFeature[]): { "data-rsvp-off"?: string } {
  return off.length > 0 ? { "data-rsvp-off": off.join(" ") } : {};
}
