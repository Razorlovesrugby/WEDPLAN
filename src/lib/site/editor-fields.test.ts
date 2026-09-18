import { describe, expect, it } from "vitest";
import { SECTION_FORMS } from "./editor-fields";
import { SECTION_KEYS, SECTIONS } from "./sections";

describe("SECTION_FORMS", () => {
  it("covers every section the renderer knows about", () => {
    // The failure this guards: a section that renders on the site with no way
    // to type anything into it.
    for (const key of SECTION_KEYS) {
      expect(SECTION_FORMS[key], key).toBeDefined();
      expect(SECTION_FORMS[key].blurb.trim(), key).not.toBe("");
    }
    expect(Object.keys(SECTION_FORMS).sort()).toEqual([...SECTION_KEYS].sort());
  });

  it("gives every field a name and a label", () => {
    for (const key of SECTION_KEYS) {
      const form = SECTION_FORMS[key];
      for (const field of [...form.fields, ...(form.repeat?.fields ?? [])]) {
        expect(field.name.trim(), `${key}.${field.name}`).not.toBe("");
        expect(field.label.trim(), `${key}.${field.name}`).not.toBe("");
      }
    }
  });

  it("has no duplicate field names within a section", () => {
    for (const key of SECTION_KEYS) {
      const names = SECTION_FORMS[key].fields.map((f) => f.name);
      expect(new Set(names).size, key).toBe(names.length);
    }
  });

  it("gives every select some options", () => {
    for (const key of SECTION_KEYS) {
      const form = SECTION_FORMS[key];
      for (const field of [...form.fields, ...(form.repeat?.fields ?? [])]) {
        if (field.kind === "select") {
          expect(field.options?.length, `${key}.${field.name}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("uses the array keys the renderer actually reads", () => {
    // sections.ts reads `items` for faq/things_to_do, `members` for party and
    // `milestones` for story. A mismatch here writes to a key nothing renders.
    expect(SECTION_FORMS.faq.repeat?.key).toBe("items");
    expect(SECTION_FORMS.things_to_do.repeat?.key).toBe("items");
    expect(SECTION_FORMS.party.repeat?.key).toBe("members");
    expect(SECTION_FORMS.story.repeat?.key).toBe("milestones");
  });

  it("only gives a repeater to sections whose content is a list", () => {
    const withRepeat = SECTION_KEYS.filter((key) => SECTION_FORMS[key].repeat);
    expect([...withRepeat].sort()).toEqual(["faq", "party", "story", "things_to_do"]);
  });

  it("labels each section consistently with the site's own heading", () => {
    // The editor and the rendered page should call a section the same thing.
    expect(SECTIONS.faq.label).toBe("Questions");
    expect(SECTIONS.stays.label).toBe("Where to stay");
  });
});
