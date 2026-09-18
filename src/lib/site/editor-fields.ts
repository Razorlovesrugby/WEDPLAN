import type { SectionKey } from "./sections";

/**
 * What the `/site` editor renders for each section (spec 14 §13).
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

export const SECTION_FORMS: Record<SectionKey, SectionForm> = {
  hero: {
    blurb: "The top of the page: your names, the date, and a photo if you have one.",
    fields: [
      { name: "headline", label: "Headline", kind: "text", help: "Defaults to the wedding's name." },
      { name: "date_label", label: "Date", kind: "text", placeholder: "Saturday 12 June 2027" },
      { name: "location", label: "Place", kind: "text", placeholder: "The Swan, Wells" },
      {
        name: "image_path",
        label: "Photo",
        kind: "text",
        placeholder: "/hero.jpg",
        help: "A path on this site, starting with a single /. Uploading photos isn't built yet — for now, put the file in public/ and point at it. Leave empty for a type-only hero.",
      },
      {
        name: "image_alt",
        label: "Photo description",
        kind: "text",
        help: "For anyone using a screen reader. Describe the picture, not the occasion.",
      },
    ],
  },
  countdown: {
    blurb: "A single line of days-to-go under the hero.",
    fields: [
      { name: "enabled", label: "Show the countdown", kind: "checkbox" },
      { name: "label", label: "After the number", kind: "text", placeholder: "until we say I do" },
    ],
  },
  story: {
    blurb: "How you met, if you want to tell it.",
    fields: [{ name: "body", label: "The story", kind: "textarea", rows: 8 }],
    repeat: {
      key: "milestones",
      noun: "milestone",
      fields: [
        { name: "date", label: "When", kind: "text", placeholder: "August 2019" },
        { name: "title", label: "What", kind: "text", placeholder: "We met" },
        { name: "body", label: "More", kind: "textarea", rows: 2 },
      ],
    },
  },
  schedule: {
    blurb:
      "Times and places come from your events. Add a dress code or a map link to each one here.",
    fields: [INTRO],
  },
  travel: {
    blurb: "Parking, taxis, the nearest station — how people actually get there.",
    fields: [{ name: "intro", label: "Getting there", kind: "textarea", rows: 8 }],
  },
  stays: {
    blurb: "A few places to stay. Links, not a booking system.",
    fields: [{ name: "intro", label: "Where to stay", kind: "textarea", rows: 8 }],
  },
  gallery: {
    blurb: "Photos. Any moodboard you've published to the site appears here too.",
    fields: [
      INTRO,
      {
        name: "uploads_open",
        label: "Let guests add photos",
        kind: "checkbox",
        help: "Guests upload from their own RSVP link, so the open internet can't post here. Not built yet — this setting is stored but does nothing until it is.",
      },
      {
        name: "moderation",
        label: "Guest photos",
        kind: "select",
        options: [
          { value: "review", label: "Wait for my approval" },
          { value: "auto", label: "Appear straight away" },
        ],
      },
    ],
  },
  faq: {
    blurb:
      "The most-read part of any wedding site. Six show open, the rest are grouped and collapsed. Two to four sentences each, and link to anything a guest actually has to use.",
    fields: [INTRO],
    repeat: {
      key: "items",
      noun: "question",
      fields: [
        { name: "q", label: "Question", kind: "text" },
        { name: "a", label: "Answer", kind: "textarea", rows: 3 },
        { name: "tags", label: "Group", kind: "text", placeholder: "Getting there" },
        { name: "featured", label: "Show open", kind: "checkbox" },
      ],
    },
  },
  party: {
    blurb: "Who's standing up with you.",
    fields: [INTRO],
    repeat: {
      key: "members",
      noun: "person",
      fields: [
        { name: "name", label: "Name", kind: "text" },
        { name: "role", label: "Role", kind: "text", placeholder: "Best woman" },
        { name: "blurb", label: "A line about them", kind: "textarea", rows: 2 },
      ],
    },
  },
  things_to_do: {
    blurb: "For anyone making a weekend of it.",
    fields: [INTRO],
    repeat: {
      key: "items",
      noun: "thing",
      fields: [
        { name: "title", label: "What", kind: "text" },
        { name: "body", label: "Why", kind: "textarea", rows: 2 },
        { name: "link", label: "Link", kind: "text" },
      ],
    },
  },
  rsvp: {
    blurb: "A signpost. The form itself lives on each household's own invitation link.",
    fields: [
      { name: "intro", label: "What to say", kind: "textarea", rows: 3 },
      { name: "closes_label", label: "Deadline", kind: "text", placeholder: "Please reply by 1 May" },
    ],
  },
  footer: {
    blurb: "The bottom of the page.",
    fields: [
      { name: "note", label: "Sign off", kind: "text", placeholder: "We can't wait to see you" },
      { name: "contact_email", label: "Contact email", kind: "email" },
      { name: "hashtag", label: "Hashtag", kind: "text", placeholder: "#alexandsam2027" },
    ],
  },
};
