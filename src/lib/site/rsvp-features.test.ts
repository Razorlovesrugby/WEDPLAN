import { describe, expect, it } from "vitest";
import { styleSchema } from "./block-schemas";
import {
  RSVP_FEATURES,
  RSVP_FEATURE_COPY,
  resolveRsvpOff,
  rsvpOffAttribute,
  toggleRsvpFeature,
} from "./rsvp-features";
import { switchById } from "./switches";

describe("the reply form's switches (spec 35)", () => {
  it("reads absent or rubbish as everything on", () => {
    expect(resolveRsvpOff(undefined)).toEqual([]);
    expect(resolveRsvpOff("chips")).toEqual([]);
    expect(resolveRsvpOff(["not_a_feature", 3])).toEqual([]);
  });

  it("keeps known names, once each, in the list's order", () => {
    expect(resolveRsvpOff(["chips", "answer_cards", "chips"])).toEqual(["answer_cards", "chips"]);
  });

  it("stores only what is off, and nothing once all are back on", () => {
    const one = toggleRsvpFeature([], "chips", false);
    expect(one).toEqual(["chips"]);
    expect(toggleRsvpFeature(one!, "divider", false)).toEqual(["divider", "chips"]);
    expect(toggleRsvpFeature(one!, "chips", true)).toBeUndefined();
  });

  it("writes the attribute the stylesheet reads, and none when all are on", () => {
    expect(rsvpOffAttribute([])).toEqual({});
    expect(rsvpOffAttribute(["touch_hover", "steady_chips"])).toEqual({
      "data-rsvp-off": "touch_hover steady_chips",
    });
  });

  it("is accepted by the block style schema, and nothing unknown is", () => {
    expect(styleSchema.safeParse({ rsvpOff: [...RSVP_FEATURES] }).success).toBe(true);
    expect(styleSchema.safeParse({ rsvpOff: ["made_up"] }).success).toBe(false);
  });

  it("says what each one does when off, and registers each as a switch", () => {
    for (const feature of RSVP_FEATURES) {
      expect(RSVP_FEATURE_COPY[feature].whenOff.trim(), feature).not.toBe("");
      expect(switchById(`rsvp.${feature}`), feature).toBeDefined();
    }
  });

  it("only depends on features that exist", () => {
    for (const feature of RSVP_FEATURES) {
      const needs = RSVP_FEATURE_COPY[feature].needs;
      if (needs) expect(RSVP_FEATURES).toContain(needs);
    }
  });
});
