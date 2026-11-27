import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DietaryNeed } from "@/lib/dietary";
import { DietaryNeedsEditor } from "./dietary-needs-editor";

const draw = (value: DietaryNeed[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(DietaryNeedsEditor, { value, onChange: () => undefined, ...extra }));

describe("DietaryNeedsEditor", () => {
  it("offers every standard tag, none pressed when the guest has none", () => {
    const html = draw([]);
    for (const label of ["Vegetarian", "Vegan", "Gluten free", "Dairy free", "Tree nuts", "Peanuts", "Shellfish", "Fish", "Egg", "Soy", "Sesame", "Halal", "Kosher", "Other"]) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain("Allergy");
  });

  it("presses the tags a guest has and asks allergy or preference for each", () => {
    const html = draw([
      { tag: "peanut", isAllergy: true, otherText: null },
      { tag: "vegan", isAllergy: false, otherText: null },
    ]);
    expect(html.split('aria-pressed="true"').length - 1).toBe(2);
    expect(html).toContain('aria-label="Peanuts: allergy or preference"');
    expect(html).toContain('aria-checked="true"');
    // The allergy choice for peanuts is the checked one and is drawn red.
    expect(html).toMatch(/aria-checked="true"[^>]*class="[^"]*bg-red-700/);
  });

  it("asks what else for Other, and only for Other", () => {
    expect(draw([{ tag: "vegan", isAllergy: false, otherText: null }])).not.toContain("What else?");
    expect(draw([{ tag: "other", isAllergy: false, otherText: "no mushrooms" }])).toContain('value="no mushrooms"');
  });

  it("takes the site's own classes on the RSVP form", () => {
    const html = draw([{ tag: "other", isAllergy: false, otherText: "x" }], { legendClass: "site-label", inputClass: "site-rsvp-input", label: "Dietary needs" });
    expect(html).toContain('class="site-label"');
    expect(html).toContain("site-rsvp-input");
  });
});
