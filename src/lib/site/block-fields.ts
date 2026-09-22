import type { BlockType } from "./blocks";
import type { Field, Repeat } from "./editor-fields";

/**
 * What the builder's inspector renders for each block (spec 23 §5).
 *
 * A description rather than twenty-one hand-written forms: blocks differ only
 * in their fields, and a table makes it obvious at a glance that every payload
 * key the renderer reads has somewhere to be typed. The failure this prevents
 * is the quiet one — a key the renderer supports and the editor never writes,
 * which looks like a broken feature rather than a missing form.
 *
 * Some blocks have no fields at all. `coach`, `stays` and `travel` render data
 * the planner keeps on `/travel`; the block is a decision about where on the
 * page it goes, not a second place to type it. Those say so in their blurb
 * rather than showing an empty form.
 */

export type BlockForm = {
  /** One line telling the planner what this block is for. */
  blurb: string;
  fields: Field[];
  repeat?: Repeat;
  /** A block whose content lives on another screen; the blurb says where. */
  managedElsewhere?: string;
  /** Shows the photo picker above the fields. */
  image?: "hero" | "band" | "side";
};

const INTRO: Field = {
  name: "intro",
  label: "Intro",
  kind: "textarea",
  rows: 3,
  help: "Shown under the heading, centred. One or two sentences.",
};

const ALT: Field = {
  name: "image_alt",
  label: "Photo description",
  kind: "text",
  help: "For anyone using a screen reader. Describe the picture, not the occasion.",
};

export const BLOCK_FORMS: Record<BlockType, BlockForm> = {
  hero: {
    blurb:
      "The top of the page: your names, the date, a line about why, and the countdown if you want it.",
    image: "hero",
    fields: [
      { name: "headline", label: "Headline", kind: "text", help: "Defaults to the wedding's name." },
      { name: "date_label", label: "Date", kind: "text", placeholder: "Saturday 12 June 2027" },
      { name: "location", label: "Place", kind: "text", placeholder: "The Swan, Wells" },
      {
        name: "intro",
        label: "A line about why",
        kind: "text",
        placeholder: "to celebrate those closest to us",
      },
      {
        name: "show_countdown",
        label: "Show the countdown here",
        kind: "checkbox",
        help: "Days and hours, under the date. It used to be a block of its own; keeping it in the hero is what stops it drifting away from the date it counts to.",
      },
      {
        name: "countdown_label",
        label: "After the number",
        kind: "text",
        placeholder: "until we say I do",
      },
      ALT,
    ],
  },
  countdown: {
    blurb: "A single line of days-to-go.",
    fields: [{ name: "label", label: "After the number", kind: "text", placeholder: "until we say I do" }],
  },
  story: {
    blurb: "How you met, if you want to tell it.",
    fields: [INTRO, { name: "body", label: "The story", kind: "textarea", rows: 8 }],
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
  prose: {
    blurb: "A heading and some paragraphs, for anything with no block of its own.",
    fields: [
      { name: "heading", label: "Heading", kind: "text", placeholder: "A note about the kids" },
      { name: "body", label: "Words", kind: "textarea", rows: 8 },
    ],
  },
  schedule: {
    blurb:
      "Times and places come from your events. On a guest's own page this shows only the events they're invited to.",
    fields: [INTRO],
  },
  on_the_day: {
    blurb:
      "Your note for each event — parking, timings, what happens when. Written on the event itself, under Events.",
    managedElsewhere: "/events",
    fields: [INTRO],
  },
  rsvp: {
    blurb:
      "The form, on a guest's own page. On the shared site it becomes 'find my invitation' instead.",
    fields: [
      INTRO,
      { name: "closes_label", label: "Closing line", kind: "text", placeholder: "Please reply by 30 April" },
    ],
  },
  faq: {
    blurb:
      "The most-read part of any wedding site. Six show open, the rest are grouped and collapsed.",
    fields: [INTRO],
    repeat: {
      key: "items",
      noun: "question",
      fields: [
        { name: "q", label: "Question", kind: "text", placeholder: "Can I bring a plus one?" },
        { name: "a", label: "Answer", kind: "textarea", rows: 3 },
        { name: "featured", label: "Show open", kind: "checkbox" },
      ],
    },
  },
  dress_code: {
    managedElsewhere: "/site/attire",
    blurb: "A sentence about what to wear, and a moodboard if you have published one.",
    fields: [
      INTRO,
      { name: "body", label: "What to wear", kind: "textarea", rows: 4 },
      {
        name: "board_id",
        label: "Moodboard id",
        kind: "text",
        help: "From the moodboard's address. Leave empty for words only.",
      },
    ],
  },
  party: {
    blurb: "The people standing up with you.",
    fields: [INTRO],
    repeat: {
      key: "members",
      noun: "person",
      fields: [
        { name: "name", label: "Name", kind: "text" },
        { name: "role", label: "Role", kind: "text", placeholder: "Best man" },
        { name: "body", label: "A line about them", kind: "textarea", rows: 2 },
      ],
    },
  },
  things_to_do: {
    blurb: "What to do with the rest of the weekend.",
    fields: [INTRO],
    repeat: {
      key: "items",
      noun: "suggestion",
      fields: [
        { name: "title", label: "What", kind: "text" },
        { name: "body", label: "Why", kind: "textarea", rows: 2 },
        { name: "url", label: "Link", kind: "text" },
      ],
    },
  },
  gallery: {
    blurb: "Every approved photo, as a grid. Guests add theirs from their own page.",
    managedElsewhere: "/gallery",
    fields: [INTRO],
  },
  photo_band: {
    blurb: "One photograph, full width, between two sections.",
    image: "band",
    fields: [ALT, { name: "caption", label: "Caption", kind: "text" }],
  },
  page_break: {
    blurb: "A full-width photograph with nothing on it. Punctuation between two sections.",
    image: "band",
    // Alt text and nothing else. A band carries no words on purpose, but a
    // reader using a screen reader still deserves to know a photograph is
    // there, and an empty alt would say "decorative" about a photograph of
    // the venue.
    fields: [ALT],
  },
  photo_text: {
    blurb: "A photograph beside a paragraph.",
    image: "side",
    fields: [
      { name: "heading", label: "Heading", kind: "text" },
      { name: "body", label: "Words", kind: "textarea", rows: 6 },
      ALT,
      {
        name: "side",
        label: "Photo on the",
        kind: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
    ],
  },
  map: {
    blurb: "One venue, how to get there, and a button that opens the reader's own maps app.",
    fields: [
      { name: "heading", label: "Heading", kind: "text", placeholder: "The church" },
      { name: "name", label: "Place", kind: "text", placeholder: "St Mary's Church" },
      { name: "address", label: "Address", kind: "text", placeholder: "Church Lane, Bath" },
      { name: "note", label: "Note", kind: "textarea", rows: 3, help: "Parking, the gate that sticks, where to wait." },
    ],
  },
  travel: {
    blurb: "Parking, taxis and the coach — all kept under Travel. This decides where they appear.",
    managedElsewhere: "/travel",
    fields: [{ name: "intro", label: "Getting there", kind: "textarea", rows: 6 }],
  },
  stays: {
    blurb: "Somewhere to sleep. Kept under Travel; this decides where it appears.",
    managedElsewhere: "/travel",
    fields: [INTRO],
  },
  coach: {
    blurb:
      "Runs and stops come from Travel. On a guest's own page they can reserve seats here.",
    managedElsewhere: "/travel",
    fields: [INTRO],
  },
  gift_funds: {
    blurb: "Two or three things you'd like help with. The funds themselves live on their own screen.",
    managedElsewhere: "/site/gifts",
    fields: [INTRO],
  },
  song_requests: {
    blurb: "Guests suggest songs; you get a list to hand the DJ.",
    managedElsewhere: "/site/songs",
    fields: [INTRO],
  },
  guestbook: {
    blurb:
      "A line from everyone. A note left from a guest's own link appears straight away; one from the shared address waits for you.",
    managedElsewhere: "/site/guestbook",
    fields: [
      INTRO,
      {
        name: "prompt",
        label: "The prompt",
        kind: "text",
        placeholder: "Write something we will read on a slow afternoon in twenty years…",
        help: "Shown inside the empty box. A good prompt is most of what makes people write the good version.",
      },
    ],
  },
  playlist: {
    blurb: "A link to your playlist — or the player itself, if you switch the embed on.",
    fields: [
      { name: "heading", label: "Heading", kind: "text", placeholder: "The playlist" },
      { name: "url", label: "Link", kind: "text", placeholder: "https://open.spotify.com/playlist/…" },
      { name: "label", label: "Button", kind: "text", placeholder: "Have a listen" },
      { name: "note", label: "Note", kind: "textarea", rows: 2 },
    ],
  },
  footer: {
    blurb: "The bottom of the page.",
    fields: [
      { name: "note", label: "Sign-off", kind: "text", placeholder: "We cannot wait to see you" },
      { name: "contact_email", label: "Email", kind: "email" },
      { name: "hashtag", label: "Hashtag", kind: "text", placeholder: "#rayandolivia" },
    ],
  },
};
