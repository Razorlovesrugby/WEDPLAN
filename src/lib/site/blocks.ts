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
export const BLOCK_BACKGROUNDS = ["paper", "tinted", "ink"] as const;
export const BLOCK_ALIGNS = ["left", "centre"] as const;
export const IMAGE_SHAPES = ["natural", "square", "portrait", "wide"] as const;

export type BlockStyle = {
  width?: (typeof BLOCK_WIDTHS)[number];
  background?: (typeof BLOCK_BACKGROUNDS)[number];
  align?: (typeof BLOCK_ALIGNS)[number];
  shape?: (typeof IMAGE_SHAPES)[number];
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
  "map",
  "travel",
  "stays",
  "coach",
  "song_requests",
  "playlist",
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
    blurb: "How long until the day.",
    max: 1,
    styles: ["background"],
  },
  story: {
    type: "story",
    label: "Our story",
    family: "essentials",
    blurb: "How you met, in a paragraph or as a list of moments.",
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
    max: 1,
    styles: ["width", "background"],
    heading: "Questions",
  },
  dress_code: {
    type: "dress_code",
    label: "What to wear",
    family: "the day",
    blurb: "A sentence, and a moodboard if you have published one.",
    styles: ["width", "background", "align"],
    heading: "What to wear",
  },
  party: {
    type: "party",
    label: "Who's who",
    family: "the day",
    blurb: "The people standing up with you.",
    max: 1,
    styles: ["width", "background"],
    heading: "Who's who",
  },
  things_to_do: {
    type: "things_to_do",
    label: "While you're here",
    family: "travel",
    blurb: "What to do with the rest of the weekend.",
    max: 1,
    styles: ["width", "background"],
    heading: "While you're here",
  },
  gallery: {
    type: "gallery",
    label: "Photo gallery",
    family: "photos",
    blurb: "A grid of photographs.",
    styles: ["width", "shape"],
    heading: "Photos",
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
    styles: ["width", "background", "embed"],
  },
  travel: {
    type: "travel",
    label: "Getting there",
    family: "travel",
    blurb: "Parking, taxis, the train — and the coach, if you have one.",
    max: 1,
    styles: ["width", "background"],
    heading: "Getting there",
  },
  stays: {
    type: "stays",
    label: "Where to stay",
    family: "travel",
    blurb: "Somewhere to sleep, as links.",
    max: 1,
    styles: ["width", "background"],
    heading: "Where to stay",
  },
  coach: {
    type: "coach",
    label: "The coach",
    family: "travel",
    blurb: "Times and stops. On a guest's own page, they can reserve seats.",
    max: 1,
    styles: ["width", "background"],
    personal: true,
    heading: "The coach",
  },
  song_requests: {
    type: "song_requests",
    label: "Song requests",
    family: "music",
    blurb: "Guests suggest songs; you get a list to hand the DJ.",
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
  footer: {
    type: "footer",
    label: "Footer",
    family: "essentials",
    blurb: "The bottom of the page — a note, an email address, a hashtag.",
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
    types: ["hero", "countdown", "story", "schedule", "on_the_day", "travel", "faq", "rsvp", "footer"],
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
