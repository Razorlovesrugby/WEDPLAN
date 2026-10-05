/**
 * The block catalogue (spec 23 §4, §7, §8).
 *
 * A page is a list of blocks. This file says which kinds exist, what each one
 * is for, how many of it a page may hold, which audience it makes sense for,
 * and which presentation choices it offers. Everything else — the editor's
 * palette, the renderer's switch, the write path's validation — reads from
 * here, so adding a widget is a row in this table plus a renderer case.
 *
 * Two rules worth stating before the data:
 *
 * **Style is a closed set.** Width, background, alignment, image shape. Not
 * free-form CSS and no per-block colour or font picker: colour and type come
 * from the theme, which is where a non-designer's decisions stay good. A
 * builder that can produce an unreadable page has failed at the thing it was
 * bought for.
 *
 * **Type is not unique per page.** Three photo bands and two prose blocks are
 * a normal wedding site. The few genuinely-once blocks say so themselves
 * (`max: 1`), because two heroes is a bug rather than a choice.
 */

export const BLOCK_AUDIENCES = ["everyone", "invited", "public_only"] as const;
export type BlockAudience = (typeof BLOCK_AUDIENCES)[number];

export const BLOCK_FAMILIES = ["essentials", "photos", "the day", "music", "travel"] as const;
export type BlockFamily = (typeof BLOCK_FAMILIES)[number];

export const BLOCK_WIDTHS = ["contained", "wide", "full"] as const;
export const BLOCK_BACKGROUNDS = ["paper", "tinted", "ink", "photograph"] as const;
export const BLOCK_ALIGNS = ["left", "centre"] as const;
export const IMAGE_SHAPES = ["natural", "square", "portrait", "wide"] as const;

export type BlockStyle = {
  width?: (typeof BLOCK_WIDTHS)[number];
  background?: (typeof BLOCK_BACKGROUNDS)[number];
  align?: (typeof BLOCK_ALIGNS)[number];
  shape?: (typeof IMAGE_SHAPES)[number];
  /**
   * The asset behind a `photograph` background — a `site_assets` id, never a
   * URL or a storage path. Ignored under every other background, so switching
   * to Plain and back does not lose the choice.
   *
   * A photograph background with no asset falls back to Plain rather than
   * rendering a scrim over nothing, which would be an unexplained dark band.
   */
  bgImage?: string;
  /**
   * Load this block's third-party embed (spec 23 Q1). Off by default, always:
   * an embed discloses every viewer to that company, and on a personalised
   * page the URL it hands over in the referrer *is* the household's
   * credential.
   */
  embed?: boolean;
  /**
   * Let guests enlarge this block's photographs. **On unless this is `false`**,
   * so every existing block keeps what it had the day the viewer shipped, and a
   * block with no `lightbox` key means "yes" (spec 27 E9).
   */
  lightbox?: boolean;
  /**
   * The block's Look (spec 27 E1): a curated alternate layout, from the closed
   * set in `looks.ts`. Absent means the block's default, so every existing block
   * renders as it did; an unknown value falls back to that default.
   */
  variant?: string;
  /**
   * How this one block arrives as the page scrolls (spec 27 E4): `rise`, `fade`,
   * `reveal` or `none`. Absent means "match the page".
   */
  enter?: "rise" | "fade" | "reveal" | "none";
};

/**
 * Every key a block's `style` may carry, as data.
 *
 * `BlockStyle` is a type and cannot be enumerated at runtime, but two other
 * things have to agree with it — the server's `styleSchema` (which is
 * `.strict()` and refuses a key it does not list, so a save of a styled block
 * fails outright) and the revision snapshot. A test compares this list to the
 * schema; the line below makes forgetting to extend it a compile error.
 */
export const BLOCK_STYLE_KEYS = [
  "width",
  "background",
  "align",
  "shape",
  "bgImage",
  "embed",
  "lightbox",
  "variant",
  "enter",
] as const satisfies readonly (keyof BlockStyle)[];

// Fails to compile if `BlockStyle` gains a key this list does not name.
type StyleKeysAreExhaustive =
  Exclude<keyof BlockStyle, (typeof BLOCK_STYLE_KEYS)[number]> extends never ? true : never;
export const STYLE_KEYS_ARE_EXHAUSTIVE: StyleKeysAreExhaustive = true;

export type BlockDef = {
  type: BlockType;
  label: string;
  family: BlockFamily;
  /** One line in the palette, in the planner's language rather than ours. */
  blurb: string;
  /** How many of it a page may hold. Undefined means as many as you like. */
  max?: number;
  /** Which style controls this block offers. */
  styles: (keyof BlockStyle)[];
  /**
   * True when the block renders differently for a household than for the
   * shared site — their events, their RSVP, their notes (spec 23 §6).
   */
  personal?: boolean;
  /** Blocks that only make sense to somebody who is invited. */
  defaultAudience?: BlockAudience;
  /** Heading shown above the block, when the renderer draws one. */
  heading?: string;
  /**
   * The short category label above the heading — `04 · ATTIRE` (spec 25 §8).
   *
   * It names the block's JOB, where `heading` is whatever the couple wanted to
   * call it. A block with none is not a destination: a hero has no eyebrow
   * because nobody arrives at it, and a photo band has none because it is
   * punctuation rather than a section.
   */
  eyebrow?: string;
  /**
   * Kept renderable, hidden from the palette.
   *
   * `countdown` moved into the hero, and REMOVING the type would be a
   * data-loss bug rather than a cleanup: `toBlock()` drops any entry whose
   * type it does not know, so a revision published last month would silently
   * lose its countdown the next time somebody opened it.
   */
  deprecated?: boolean;
};

export const BLOCK_TYPES = [
  "hero",
  "countdown",
  "story",
  "prose",
  "schedule",
  "on_the_day",
  "rsvp",
  "faq",
  "dress_code",
  "party",
  "things_to_do",
  "gallery",
  "photo_band",
  "photo_text",
  "page_break",
  "map",
  "travel",
  "stays",
  "coach",
  "gift_funds",
  "song_requests",
  "playlist",
  "guestbook",
  "footer",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCKS: Record<BlockType, BlockDef> = {
  hero: {
    type: "hero",
    label: "Hero",
    family: "essentials",
    blurb: "Your names, the date, and a photo behind them.",
    max: 1,
    styles: ["background", "shape"],
  },
  countdown: {
    type: "countdown",
    label: "Countdown",
    family: "essentials",
    blurb: "How long until the day. Now part of the hero — this block still renders.",
    max: 1,
    styles: ["background"],
    deprecated: true,
  },
  story: {
    type: "story",
    label: "Our story",
    family: "essentials",
    blurb: "How you met, in a paragraph or as a list of moments.",
    eyebrow: "Our story",
    styles: ["width", "background", "align"],
    heading: "Our story",
  },
  prose: {
    type: "prose",
    label: "Words",
    family: "essentials",
    blurb: "A heading and some paragraphs. For anything with no block of its own.",
    styles: ["width", "background", "align"],
    // Untitled until the planner titles it (spec 28 §7.2): "" is a default of
    // *no* heading, which is not the same as having none to offer.
    heading: "",
  },
  schedule: {
    type: "schedule",
    label: "The weekend",
    family: "the day",
    blurb: "Your events, grouped by day. Each guest sees only the ones they're invited to.",
    eyebrow: "The weekend",
    max: 1,
    styles: ["width", "background"],
    personal: true,
    // What every reader sees now that there is no shared page (spec 28 §7a.4).
    heading: "You're invited to",
  },
  on_the_day: {
    type: "on_the_day",
    label: "On the day",
    family: "the day",
    blurb: "Now part of The weekend — each event's note sits under it. This block still renders on a page with no weekend section.",
    eyebrow: "On the day",
    max: 1,
    styles: ["width", "background"],
    personal: true,
    defaultAudience: "invited",
    heading: "On the day",
    // Spec 28 §5.3. Not removed: a published revision may hold one, and
    // `toBlock()` drops a type it does not know. See `visibleBlocks`.
    deprecated: true,
  },
  rsvp: {
    type: "rsvp",
    label: "RSVP",
    family: "the day",
    blurb: "The reply form. Each household sees its own people and events.",
    eyebrow: "Your reply",
    max: 1,
    styles: ["background"],
    personal: true,
    heading: "Will you be there?",
  },
  faq: {
    type: "faq",
    label: "Questions",
    family: "the day",
    blurb: "The things everybody asks, every one shown open.",
    eyebrow: "Questions",
    max: 1,
    styles: ["width", "background"],
    heading: "Questions",
  },
  dress_code: {
    type: "dress_code",
    label: "What to wear",
    family: "the day",
    blurb: "A sentence, and a moodboard if you have published one.",
    eyebrow: "Attire",
    styles: ["width", "background", "align"],
    heading: "What to wear",
  },
  party: {
    type: "party",
    label: "Who's who",
    family: "the day",
    blurb: "The people standing up with you.",
    eyebrow: "Who's who",
    max: 1,
    styles: ["width", "background"],
    heading: "Who's who",
  },
  things_to_do: {
    type: "things_to_do",
    label: "While you're here",
    family: "travel",
    blurb: "What to do with the rest of the weekend.",
    eyebrow: "While you're here",
    max: 1,
    styles: ["width", "background"],
    heading: "While you're here",
  },
  gallery: {
    type: "gallery",
    label: "Photo gallery",
    family: "photos",
    blurb: "A grid of photographs.",
    eyebrow: "Photographs",
    styles: ["width", "shape", "lightbox"],
    heading: "Photos",
  },
  /**
   * A full-bleed photograph with nothing on it, between two chapters.
   *
   * Deliberately separate from `photo_band`, which is a figure inside the
   * page's measure and can carry a caption. This one is punctuation: no
   * heading, no eyebrow — so `sectionNumbers` never numbers it and the page
   * still reads 01…N — no caption, and nothing in its payload but an asset
   * id. Repeatable, because a long page wants more than one.
   */
  page_break: {
    type: "page_break",
    label: "Page break",
    family: "photos",
    blurb: "A full-width photograph with nothing on it, to separate two sections.",
    styles: ["shape", "lightbox"],
  },
  photo_band: {
    type: "photo_band",
    label: "Photo band",
    family: "photos",
    blurb: "One photograph, full width, between two sections.",
    styles: ["width", "shape", "lightbox"],
  },
  photo_text: {
    type: "photo_text",
    label: "Photo and words",
    family: "photos",
    blurb: "A photograph beside a paragraph.",
    styles: ["width", "background", "shape", "lightbox"],
    heading: "",
  },
  map: {
    type: "map",
    label: "Map",
    family: "travel",
    blurb: "One venue, how to get there, and a link that opens Maps.",
    eyebrow: "The venue",
    styles: ["width", "background", "embed"],
    heading: "Where",
  },
  travel: {
    type: "travel",
    label: "Getting there",
    family: "travel",
    blurb: "Parking, taxis, the train — and the coach, if you have one.",
    eyebrow: "Arrival",
    max: 1,
    styles: ["width", "background"],
    heading: "Getting there",
  },
  stays: {
    type: "stays",
    label: "Where to stay",
    family: "travel",
    blurb: "Somewhere to sleep, as links.",
    eyebrow: "Where to stay",
    max: 1,
    styles: ["width", "background"],
    heading: "Where to stay",
  },
  coach: {
    type: "coach",
    label: "The coach",
    family: "travel",
    blurb: "Times and stops. On a guest's own page, they can reserve seats.",
    eyebrow: "The coach",
    max: 1,
    styles: ["width", "background"],
    personal: true,
    heading: "The coach",
  },
  gift_funds: {
    type: "gift_funds",
    label: "A gift",
    family: "the day",
    blurb: "What you're saving towards, and a Contribute button that opens your bank details.",
    eyebrow: "A gift",
    max: 1,
    styles: ["width", "background"],
    heading: "A gift, if you are moved.",
  },
  song_requests: {
    type: "song_requests",
    label: "Song requests",
    family: "music",
    blurb: "Guests suggest songs; you get a list to hand the DJ.",
    eyebrow: "The playlist",
    max: 1,
    styles: ["width", "background"],
    heading: "Songs",
  },
  playlist: {
    type: "playlist",
    label: "Playlist",
    family: "music",
    blurb: "A link to your playlist, or the player itself.",
    styles: ["width", "background", "embed"],
    heading: "The playlist",
  },
  guestbook: {
    type: "guestbook",
    label: "Guestbook",
    family: "the day",
    blurb: "A line from everyone. Notes appear at once; you can hide one.",
    max: 1,
    styles: ["width", "background"],
    personal: true,
    heading: "Leave a note",
    eyebrow: "Leave a note",
  },
  footer: {
    type: "footer",
    label: "Footer",
    family: "essentials",
    blurb: "The bottom of the page — a note, an email address, a hashtag.",
    eyebrow: "With love",
    max: 1,
    styles: ["background"],
  },
};

export function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

/** One block, as the app holds it — draft row or revision entry alike. */
export type SiteBlock = {
  id: string;
  type: BlockType;
  payload: unknown;
  style: BlockStyle;
  visible: boolean;
  audience: BlockAudience;
};

/**
 * The blocks a guest sees, in order.
 *
 * Hidden blocks are dropped here rather than in the renderer, so "what does a
 * guest see" has exactly one answer and the preview can ask the same question
 * the page does.
 *
 * `audience` is stored and not read (spec 28 §7a.4). It only ever differed on
 * the shared page, which no longer exists: every reader holds a household's own
 * link and is, by definition, invited. The column and the old values stay so
 * a revision keeps its shape; nothing consults them.
 */
export function visibleBlocks(blocks: SiteBlock[]): SiteBlock[] {
  const live = blocks.filter((block) => block.visible);

  // "On the day" is part of "You're invited to" now (spec 28 §5.3): each event's
  // note is drawn under the event. On a page that has both, the old block would
  // print the same notes a second time, so it is dropped here — before the
  // numbering, the chapter list and the top bar are worked out, so none of them
  // is left with a gap or an entry for a section that is not there.
  return live.some((block) => block.type === "schedule")
    ? live.filter((block) => block.type !== "on_the_day")
    : live;
}

/** True when this "On the day" block is one that `visibleBlocks` folds away. */
export function isFoldedIntoSchedule(block: SiteBlock, blocks: SiteBlock[]): boolean {
  return (
    block.type === "on_the_day" &&
    blocks.some((other) => other.type === "schedule" && other.visible)
  );
}

/**
 * Which types are already at their limit.
 *
 * The palette greys these out rather than hiding them: "why can't I add
 * another hero" is answerable, "where did the hero go" is not.
 */
export function typesAtLimit(blocks: SiteBlock[]): Set<BlockType> {
  const counts = new Map<BlockType, number>();
  for (const block of blocks) counts.set(block.type, (counts.get(block.type) ?? 0) + 1);

  const full = new Set<BlockType>();
  for (const [type, count] of counts) {
    const max = BLOCKS[type]?.max;
    if (max !== undefined && count >= max) full.add(type);
  }
  return full;
}

/**
 * Sanity notes about the page as a whole (spec 23 §7).
 *
 * Advisory, never blocking. The planner's page is theirs; this is the thing a
 * friend who builds websites would say while looking over their shoulder.
 */
export type PageNote = { tone: "thin" | "bloated"; text: string };

export function pageNotes(blocks: SiteBlock[]): PageNote[] {
  const notes: PageNote[] = [];
  const live = blocks.filter((block) => block.visible);
  const types = new Set(live.map((block) => block.type));

  if (live.length > 0 && live.length < 4) {
    notes.push({
      tone: "thin",
      text: "A hero and an RSVP is a bit bare — most couples add the schedule and a photo.",
    });
  }
  if (!types.has("schedule") && live.length > 0) {
    notes.push({ tone: "thin", text: "No schedule yet. It is the thing guests look for first." });
  }
  if (!types.has("rsvp") && live.length > 0) {
    notes.push({
      tone: "thin",
      text: "No RSVP block — guests can still reply from the form on their own page, but nothing on the site points at it.",
    });
  }
  if (live.length > 12) {
    notes.push({
      tone: "bloated",
      text: `${live.length} blocks is a long scroll. Anything a guest will not read on a phone is worth cutting.`,
    });
  }

  // Three photo blocks in a row reads as an album rather than a page.
  let run = 0;
  for (const block of live) {
    const isPhoto = BLOCKS[block.type]?.family === "photos";
    run = isPhoto ? run + 1 : 0;
    if (run >= 3) {
      notes.push({
        tone: "bloated",
        text: "Three photo blocks in a row — one of them will do more work than all three.",
      });
      break;
    }
  }

  return notes;
}

/**
 * The starting page for a wedding with nothing on it (spec 23 §7).
 *
 * An empty builder is the worst first screen a builder can have: it asks
 * somebody with no design training to invent a page. These are three real
 * pages, in the wedding's own theme, and the first thing anybody does is
 * delete the bits they do not want — which is a much easier job.
 */
export type StarterLayout = { id: string; label: string; blurb: string; types: BlockType[] };

export const STARTER_LAYOUTS: StarterLayout[] = [
  {
    id: "classic",
    label: "Classic",
    blurb: "The usual order, and the one nobody has to think about.",
    // No `countdown` or `on_the_day`: the first is a switch on the hero now
    // (spec 25 §7), the second is part of The weekend (spec 28 §5.3), and a
    // starter layout that added a deprecated block would be teaching the shape
    // we just moved away from.
    types: ["hero", "story", "schedule", "travel", "dress_code", "faq", "rsvp", "footer"],
  },
  {
    id: "photo_led",
    label: "Photo-led",
    blurb: "For couples who already have the photographs.",
    types: [
      "hero",
      "photo_band",
      "story",
      "photo_text",
      "schedule",
      "photo_band",
      "dress_code",
      "gallery",
      "rsvp",
      "footer",
    ],
  },
  {
    id: "short",
    label: "One-pager",
    blurb: "A small wedding, told in one screen and a bit.",
    types: ["hero", "schedule", "rsvp", "footer"],
  },
];

/**
 * The number and label above each section — `04 · ATTIRE` (spec 25 §8).
 *
 * **Numbers are computed, never stored** (Answered question 6). Hiding a block
 * renumbers everything after it, so the page always reads 01 to N with no gaps
 * — a guest counting "01, 02, 04" wonders what they missed, and the answer
 * "nothing, the couple hid a block" is not one the page can give them.
 *
 * Only blocks with an eyebrow are numbered — the ones that are a destination:
 * a photo band is punctuation, and numbering it would make the page look longer
 * than it reads.
 * Hidden blocks are expected to be filtered out by `visibleBlocks` before this
 * is called — it numbers what it is given.
 */
export type SectionMark = { number: string; label: string };

export function sectionNumbers(blocks: SiteBlock[]): Map<string, SectionMark> {
  const marks = new Map<string, SectionMark>();
  let n = 0;

  for (const block of blocks) {
    // The planner's own label when they wrote one (spec 28 §7.2), else the
    // block's category. Whether a block is numbered at all is still the
    // catalogue's call — a label cannot turn a photo band into a chapter — and
    // the number is still computed, so renaming never leaves a gap.
    const label = blockLabel(block);
    if (!label) continue;
    // "No title" means a section that speaks for itself: there is no heading
    // for a number to sit above, so it is not a chapter — and not numbering it
    // is what keeps the page reading 01 to N rather than skipping its place.
    if (blockHeading(block) === "" && defaultHeading(block.type) !== "") continue;
    n += 1;
    // Two digits up to 99, which is well past the point pageNotes starts
    // telling the planner the page is too long.
    marks.set(block.id, { number: String(n).padStart(2, "0"), label });
  }
  return marks;
}

// ---------------------------------------------------------------------------
// Titles, labels and anchors (spec 28 §7.2, §9.6)
// ---------------------------------------------------------------------------

function payloadText(payload: unknown, key: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Blocks that draw no heading of their own, and so have no title to edit: the
 * cover, the countdown, and the three that are punctuation or a sign-off.
 */
const UNTITLED = new Set<BlockType>(["hero", "countdown", "page_break", "photo_band", "footer"]);

export function isTitled(type: BlockType): boolean {
  return !UNTITLED.has(type);
}

/**
 * The heading a block draws until the planner changes it — what the editor
 * shows as the Title field's placeholder. "" means it has none by default
 * (Words, Photo and words), which is a different thing from not being titled.
 */
export function defaultHeading(type: BlockType): string {
  return BLOCKS[type].heading ?? "";
}

/** The title the planner typed, or null. Clearing the field is "use the default". */
export function customHeading(block: SiteBlock): string | null {
  return isTitled(block.type) ? payloadText(block.payload, "heading") : null;
}

/**
 * The heading this block draws: the planner's, else the default — unless they
 * turned the title off, which draws nothing and closes the space up.
 */
export function blockHeading(block: SiteBlock): string {
  if (!isTitled(block.type)) return "";
  if ((block.payload as Record<string, unknown> | null)?.["hide_heading"] === true) return "";
  return customHeading(block) ?? defaultHeading(block.type);
}

/**
 * The small line above the heading, without its number: the planner's label,
 * else the block's category. Null for a block that is not a destination.
 */
export function blockLabel(block: SiteBlock): string | null {
  const category = BLOCKS[block.type]?.eyebrow;
  if (!category) return null;
  return payloadText(block.payload, "eyebrow") ?? category;
}

/**
 * What the chapter list down the side calls a block: the planner's title when
 * they wrote one, else the label above it. Both follow what the planner typed,
 * so the list and the page cannot disagree about what a section is called.
 */
export function chapterName(block: SiteBlock): string {
  return customHeading(block) ?? blockLabel(block) ?? BLOCKS[block.type].label;
}

/**
 * The anchor a section answers to.
 *
 * A once-only block keeps its type — `#rsvp`, `#faq` — so every link already
 * sent and every place that says `#rsvp` still lands. A repeatable one gets its
 * own, because two "What to wear" sections sharing an id means the second is
 * unreachable and the chapter list silently skips it (spec 28 §9.6). Derived
 * from the block's id, so reordering never moves it.
 */
export function blockAnchor(block: SiteBlock): string {
  return BLOCKS[block.type].max === 1 ? block.type : `${block.type}-${block.id}`;
}

/**
 * What the palette offers.
 *
 * Deprecated types are excluded — `countdown` lives in the hero now — but they
 * stay in `BLOCKS` and stay renderable, because a published revision may hold
 * one and dropping the type would blank it silently.
 */
export function palletableBlocks(): BlockDef[] {
  return Object.values(BLOCKS).filter((def) => !def.deprecated);
}
