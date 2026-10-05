import { z } from "zod";
import { COVER_LINE_MAX_LENGTH } from "./cover";
import { validateGreeting } from "./greeting";
import {
  BLOCK_ALIGNS,
  BLOCK_BACKGROUNDS,
  BLOCK_WIDTHS,
  IMAGE_SHAPES,
  type BlockType,
} from "./blocks";

/**
 * What a block's payload and style may contain on the way in (spec 23 §4).
 *
 * Lived inside the `"use server"` action file until spec 27, which could not
 * export a schema from there (a server-action module may only export async
 * functions) and needed tests that say a starter payload passes its own
 * validation, and that `styleSchema` accepts exactly what `BlockStyle`
 * declares. The rules are unchanged; only the address moved.
 */

export const trimmed = z.string().trim();
export const optionalText = trimmed.max(4000).optional().transform((v) => (v ? v : undefined));
export const uuid = z.string().uuid();

export const styleSchema = z
  .object({
    width: z.enum(BLOCK_WIDTHS).optional(),
    background: z.enum(BLOCK_BACKGROUNDS).optional(),
    align: z.enum(BLOCK_ALIGNS).optional(),
    shape: z.enum(IMAGE_SHAPES).optional(),
    // A site_assets id, not a URL: the renderer signs it, so a block can
    // never carry a path into a bucket or a third party's image.
    bgImage: uuid.optional(),
    embed: z.coerce.boolean().optional(),
    // Off is the only value worth storing: absent already means on.
    lightbox: z.boolean().optional(),
    // A Look id. Which ones are valid depends on the block's type, which this
    // schema cannot see; `setBlockStyle` checks it against `looksFor(type)`.
    variant: z.string().max(24).optional(),
    enter: z.enum(["rise", "fade", "reveal", "none"]).optional(),
  })
  .strict();

const faqItemSchema = z.object({
  q: trimmed.min(1, "A question needs asking").max(300),
  a: trimmed.max(4000).default(""),
  featured: z.coerce.boolean().default(false),
  tags: z.array(trimmed.min(1).max(60)).max(5).default([]),
});

const listItemSchema = z.object({
  title: trimmed.min(1).max(200),
  body: optionalText,
  url: optionalText,
});

/**
 * One schema per block type, mirroring the readers in `sections.ts`.
 *
 * Where a reader is lenient, the schema is strict: the reader's job is to
 * survive old data, this one's job is to stop new bad data being written.
 */
export const BLOCK_SCHEMAS: Record<BlockType, z.ZodTypeAny> = {
  hero: z.object({
    headline: optionalText,
    date_label: optionalText,
    location: optionalText,
    // The countdown lives here now (spec 25 §7) rather than being a separate
    // block the planner stacks underneath and hopes sits well.
    show_countdown: z.coerce.boolean().optional(),
    countdown_label: optionalText,
    intro: optionalText,
    image_id: uuid.optional(),
    image_alt: optionalText,
    // The cover (spec 27 §5). Every line has a switch, and an absent switch
    // means ON, so a hero saved before these existed renders as it always did.
    show_greeting: z.boolean().optional(),
    greeting_text: z
      .string()
      .trim()
      .optional()
      .superRefine((value, ctx) => {
        if (!value) return;
        const checked = validateGreeting(value);
        if (!checked.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: checked.error });
      })
      .transform((v) => (v ? v : undefined)),
    show_cover_line: z.boolean().optional(),
    cover_line: trimmed
      .max(COVER_LINE_MAX_LENGTH)
      .optional()
      .transform((v) => (v ? v : undefined)),
    show_date: z.boolean().optional(),
    show_location: z.boolean().optional(),
    show_intro: z.boolean().optional(),
    show_counter: z.boolean().optional(),
    show_scroll_cue: z.boolean().optional(),
    tall_cover: z.boolean().optional(),
  }),
  countdown: z.object({ label: optionalText }),
  story: z.object({
    intro: optionalText,
    body: optionalText,
    milestones: z
      .array(z.object({ date: optionalText, title: trimmed.min(1).max(200), body: optionalText }))
      .max(20)
      .optional(),
  }),
  prose: z.object({ heading: optionalText, body: optionalText }),
  schedule: z.object({
    intro: optionalText,
    // Off hides the "keep your weekend" panel on a guest's own page. Absent
    // means on, so a block saved before it existed is unchanged.
    show_calendar: z.boolean().optional(),
    events: z
      .array(
        z.object({
          id: uuid,
          dress_code: optionalText,
          detail: optionalText,
          map_url: optionalText,
          hide_time: z.coerce.boolean().optional(),
        }),
      )
      .max(30)
      .optional(),
  }),
  on_the_day: z.object({ intro: optionalText }),
  rsvp: z.object({ intro: optionalText, closes_label: optionalText }),
  faq: z.object({ intro: optionalText, items: z.array(faqItemSchema).max(60).optional() }),
  dress_code: z.object({ intro: optionalText, body: optionalText, board_id: uuid.optional() }),
  party: z.object({
    intro: optionalText,
    members: z
      .array(z.object({ name: trimmed.min(1).max(120), role: optionalText, body: optionalText }))
      .max(30)
      .optional(),
  }),
  things_to_do: z.object({ intro: optionalText, items: z.array(listItemSchema).max(30).optional() }),
  gallery: z.object({ intro: optionalText }),
  photo_band: z.object({ image_id: uuid.optional(), image_alt: optionalText, caption: optionalText }),
  // An asset and its alt text, and nothing else. A band that could carry a
  // caption would be a photo_band with extra steps.
  page_break: z.object({ image_id: uuid.optional(), image_alt: optionalText }),
  photo_text: z.object({
    heading: optionalText,
    body: optionalText,
    image_id: uuid.optional(),
    image_alt: optionalText,
    side: z.enum(["left", "right"]).optional(),
  }),
  map: z.object({
    heading: optionalText,
    name: optionalText,
    address: optionalText,
    note: optionalText,
    intro: optionalText,
  }),
  travel: z.object({ intro: optionalText, body: optionalText }),
  stays: z.object({ intro: optionalText }),
  coach: z.object({ intro: optionalText }),
  // The funds live in `gift_funds`; the block holds only the line above them.
  gift_funds: z.object({ intro: optionalText }),
  song_requests: z.object({ intro: optionalText }),
  guestbook: z.object({ intro: optionalText, prompt: optionalText }),
  playlist: z.object({
    heading: optionalText,
    label: optionalText,
    note: optionalText,
    // Only https, and only somewhere a playlist could live. A javascript: URL
    // in a link the whole guest list clicks is the reason this is not free
    // text.
    url: trimmed
      .max(500)
      .optional()
      .refine((v) => !v || /^https:\/\/[\w.-]+\//.test(v), { message: "Use a full https:// link" })
      .transform((v) => (v ? v : undefined)),
  }),
  footer: z.object({
    note: optionalText,
    contact_email: trimmed.max(200).email("That isn't an email address").optional().or(z.literal("")),
    hashtag: optionalText,
  }),
};
