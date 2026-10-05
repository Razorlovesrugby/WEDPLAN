import { describe, expect, it } from "vitest";
import { BLOCK_TYPES } from "./blocks";
import { BLOCK_FORMS } from "./block-fields";
import { BLOCK_SCHEMAS } from "./block-schemas";
import { SWITCHES } from "./switches";

describe("block forms", () => {
  it("has a form for every block type", () => {
    expect(Object.keys(BLOCK_FORMS).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("only offers fields the block's schema will accept", () => {
    // A field the form can write and the schema strips is a setting that saves
    // "successfully" and does nothing — the quiet failure these tables exist to
    // prevent. Zod objects drop unknown keys, so check each named field survives.
    for (const type of BLOCK_TYPES) {
      const schema = BLOCK_SCHEMAS[type] as { shape?: Record<string, unknown> };
      const known = new Set(Object.keys(schema.shape ?? {}));
      const form = BLOCK_FORMS[type];
      for (const field of form.fields) {
        if (field.kind === "heading") continue;
        expect(known.has(field.name), `${type}.${field.name}`).toBe(true);
      }
    }
  });

  it("gives headings no name that collides with a real field", () => {
    for (const type of BLOCK_TYPES) {
      const names = BLOCK_FORMS[type].fields.filter((f) => f.kind !== "heading").map((f) => f.name);
      expect(new Set(names).size, type).toBe(names.length);
    }
  });
});

describe("switches that live in a block's payload", () => {
  const stored = SWITCHES.filter((entry) => entry.payload);

  it("includes the whole cover", () => {
    expect(stored.filter((entry) => entry.group === "cover").length).toBeGreaterThan(5);
  });

  it("is offered by that block's form, as a checkbox", () => {
    for (const entry of stored) {
      const { block, key } = entry.payload!;
      const field = BLOCK_FORMS[block].fields.find((candidate) => candidate.name === key);
      expect(field, `${entry.id} has no field in the ${block} form`).toBeDefined();
      expect(field?.kind, entry.id).toBe("checkbox");
    }
  });

  it("agrees, form and registry, about whether it is on when absent", () => {
    // The form's `defaultChecked` and the renderer's default must say the same
    // thing, or the editor claims a line is off while the page shows it.
    for (const entry of stored) {
      const { block, key } = entry.payload!;
      const field = BLOCK_FORMS[block].fields.find((candidate) => candidate.name === key);
      expect(field?.defaultChecked === true, entry.id).toBe(entry.defaultOn === true);
    }
  });

  it("is accepted by that block's schema, set either way", () => {
    for (const entry of stored) {
      const { block, key } = entry.payload!;
      for (const value of [true, false]) {
        expect(BLOCK_SCHEMAS[block].safeParse({ [key]: value }).success, `${entry.id}=${value}`).toBe(true);
      }
    }
  });
});
