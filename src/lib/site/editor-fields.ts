/**
 * The shape of one field in a block's form.
 *
 * Spec 14 kept a table of forms here, one per fixed section. Spec 23 replaced
 * the sections with blocks and moved the table to `block-fields.ts`; these
 * types stayed, because `FieldInput` renders from them and both the old and
 * the new table describe a form the same way.
 *
 * A description rather than twelve hand-written forms: the sections differ
 * only in their fields, and a table makes it obvious at a glance that every
 * field the renderer reads has somewhere to be typed. The failure this
 * prevents is the quiet one — a payload key the renderer supports and the
 * editor never writes, which looks like a broken feature.
 *
 * `repeat` describes a list of rows (FAQ items, party members). Its `key` is
 * the payload array; its `fields` are the columns of one row.
 */

export type FieldKind = "text" | "textarea" | "checkbox" | "select" | "email";

export type Field = {
  name: string;
  label: string;
  kind: FieldKind;
  help?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
};

export type Repeat = {
  key: string;
  /** Singular, for the "Add a …" button. */
  noun: string;
  fields: Field[];
};

export type SectionForm = {
  /** One line telling the planner what this section is for. */
  blurb: string;
  fields: Field[];
  repeat?: Repeat;
};

const INTRO: Field = {
  name: "intro",
  label: "Intro",
  kind: "textarea",
  rows: 3,
  help: "Shown under the heading, centred. One or two sentences.",
};
