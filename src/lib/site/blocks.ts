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
};

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
  },
  schedule: {
    type: "schedule",
    label: "The weekend",
    family: "the day",
    blurb: "Your events, grouped by day. On a guest's own page, only theirs.",
    eyebrow: "The weekend",
    max: 1,
    styles: ["width", "background"],
    personal: true,
    heading: "The weekend",
  },
  on_the_day: {
    type: "on_the_day",
    label: "On the day",
    family: "the day",
    blurb: "Your notes for each event — parking, timings, what happens when.",
    eyebrow: "On the day",
    max: 1,
    styles: ["width", "background"],
    personal: true,
    defaultAudience: "invited",
    heading: "On the day",
  },
  rsvp: {
    type: "rsvp",
    label: "RSVP",
    family: "the day",
    blurb: "The form on a guest's own page; 'find my invitation' on the shared one.",
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
    blurb: "The things everybody asks, a few open and the rest collapsed.",
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
    styles: ["width", "shape"],
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
    styles: ["shape"],
  },
  photo_band: {
    type: "photo_band",
    label: "Photo band",
    family: "photos",
    blurb: "One photograph, full width, between two sections.",
    styles: ["width", "shape"],
  },
  photo_text: {
    type: "photo_text",
    label: "Photo and words",
    family: "photos",
    blurb: "A photograph beside a paragraph.",
    styles: ["width", "background", "shape"],
  },
  map: {
    type: "map",
    label: "Map",
    family: "travel",
    blurb: "One venue, how to get there, and a link that opens Maps.",
    eyebrow: "The venue",
    styles: ["width", "background", "embed"],
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
    blurb: "What you're saving towards, and where to send something if they'd like to.",
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
  },
  guestbook: {
    type: "guestbook",
    label: "Guestbook",
    family: "the day",
    blurb: "A line from everyone. Notes from a guest's own link appear at once; the rest wait for you.",
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
 * The blocks a given reader sees, in order.
 *
 * `household` is null on the shared site. Hidden blocks are dropped here
 * rather than in the renderer, so "what does a guest see" has exactly one
 * answer and the preview can ask the same question the page does.
 */
export function visibleBlocks(blocks: SiteBlock[], forHousehold: boolean): SiteBlock[] {
  return blocks.filter((block) => {
    if (!block.visible) return false;
    if (block.audience === "invited") return forHousehold;
    if (block.audience === "public_only") return !forHousehold;
    return true;
  });
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
    // No `countdown` block: it is a switch on the hero now (spec 25 §7), and
    // a starter layout that added the deprecated one would be teaching the
    // shape we just moved away from.
    types: ["hero", "story", "schedule", "on_the_day", "travel", "dress_code", "faq", "rsvp", "footer"],
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
    types: ["hero", "schedule", "on_the_day", "rsvp", "footer"],
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
 * Only blocks with an eyebrow are numbered, which is the same judgement
 * `blockNavItems` makes about what is a destination: a photo band is
 * punctuation, and numbering it would make the page look longer than it reads.
 * Hidden blocks are expected to be filtered out by `visibleBlocks` before this
 * is called — it numbers what it is given.
 */
export type SectionMark = { number: string; label: string };

export function sectionNumbers(blocks: SiteBlock[]): Map<string, SectionMark> {
  const marks = new Map<string, SectionMark>();
  let n = 0;

  for (const block of blocks) {
    const eyebrow = BLOCKS[block.type]?.eyebrow;
    if (!eyebrow) continue;
    n += 1;
    // Two digits up to 99, which is well past the point pageNotes starts
    // telling the planner the page is too long.
    marks.set(block.id, { number: String(n).padStart(2, "0"), label: eyebrow });
  }
  return marks;
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

/**
 * The jump nav.
 *
 * Only blocks that are a destination: a photo band is not somewhere you
 * navigate to, and a nav with "Photo band · Photo band · Photo band" in it is
 * worse than no nav. Duplicate types appear once — the first one wins, which
 * is where an anchor of that id actually lands.
 */
const NOT_IN_NAV = new Set<BlockType>([
  "hero",
  "countdown",
  "footer",
  "photo_band",
  "photo_text",
  "page_break",
  "prose",
  "playlist",
]);

export function blockNavItems(blocks: SiteBlock[]): { href: string; label: string }[] {
  const seen = new Set<BlockType>();
  const items: { href: string; label: string }[] = [];

  for (const block of blocks) {
    if (NOT_IN_NAV.has(block.type) || seen.has(block.type)) continue;
    seen.add(block.type);
    const def = BLOCKS[block.type];
    items.push({ href: `#${block.type}`, label: def.heading ?? def.label });
  }
  return items;
}
