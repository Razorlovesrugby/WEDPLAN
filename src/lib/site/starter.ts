import { BLOCKS, type BlockType, type SiteBlock } from "./blocks";
import { FAQ_LIBRARY } from "./faq-library";

/**
 * What a block arrives with, and how to tell it has not been finished
 * (spec 27 step 0, from spec 24 §5).
 *
 * An empty payload is honest and unusable: the planner presses a palette entry,
 * nothing appears, and the only recovery is to guess that the block exists and
 * needs filling in. So a new block arrives with **sample prose** that shows
 * what the block looks like when it is full.
 *
 * The cost, which spec 24 §5 named and spec 27 answered: somebody will publish
 * "We met in a queue for coffee" to a real wedding site. So **publish refuses a
 * block that is still carrying untouched sample text** — see `blocksNeedingWork`
 * — rather than relying on anybody noticing. The way out is to edit it, or hide
 * the block (a hidden block is not checked).
 *
 * Two things mark a block unfinished:
 *
 *   - a key listed in `sample` whose value is still exactly what the starter
 *     wrote. Edit one word and it is yours.
 *   - any text containing `[square brackets]`, which is the convention the FAQ
 *     library already uses for "the couple must supply this".
 *
 * Pure, no I/O, so the whole rule is unit-testable.
 */

type StarterDef = {
  /** Written into a new block. Must pass `BLOCK_SCHEMAS` — a test checks. */
  payload: Record<string, unknown>;
  /** Top-level keys whose starter value is sample prose rather than a default. */
  sample: string[];
  /**
   * Keys that make a block worth showing. A block with none of them filled is
   * blank. Empty means the block draws from elsewhere (events, travel, the
   * gallery) and `{}` is a perfectly good state.
   */
  essential: string[];
};

const NONE: StarterDef = { payload: {}, sample: [], essential: [] };

const STARTERS: Record<BlockType, StarterDef> = {
  hero: NONE,
  countdown: NONE,
  story: {
    payload: {
      body: "We met in a queue for coffee. One of us had the last oat flat white and the other has never let it go. Tell it in your own words — this is only here to show you how it looks.",
      milestones: [
        { date: "2019", title: "We met", body: "A queue, a coffee, an argument about oat milk." },
        { date: "2024", title: "We got engaged", body: "On a walk we have done a hundred times." },
      ],
    },
    sample: ["body", "milestones"],
    essential: ["body", "milestones"],
  },
  prose: {
    payload: {
      heading: "A note from us",
      body: "Write whatever you need here — a note about children, a word on parking, anything that has no block of its own. This is sample text.",
    },
    sample: ["heading", "body"],
    essential: ["body"],
  },
  schedule: NONE,
  on_the_day: NONE,
  rsvp: NONE,
  faq: {
    // The library marks what the couple must supply in [square brackets], so
    // these are caught by the bracket rule and need no `sample` key.
    payload: {
      items: FAQ_LIBRARY.slice(0, 4).map((item) => ({
        q: item.q,
        a: item.a,
        featured: true,
        tags: item.tags,
      })),
    },
    sample: [],
    essential: ["items"],
  },
  dress_code: {
    payload: { body: "Smart casual — something you can dance in, and comfortable shoes for the lawn." },
    sample: ["body"],
    essential: ["body"],
  },
  party: {
    payload: {
      members: [
        { name: "Name", role: "Best man", body: "A line about them goes here." },
        { name: "Name", role: "Maid of honour", body: "A line about them goes here." },
      ],
    },
    sample: ["members"],
    essential: ["members"],
  },
  things_to_do: {
    payload: {
      items: [
        {
          title: "A walk by the river",
          body: "Twenty minutes from the venue, and lovely before dinner.",
        },
      ],
    },
    sample: ["items"],
    essential: ["items"],
  },
  gallery: NONE,
  page_break: { payload: {}, sample: [], essential: ["image_id"] },
  photo_band: { payload: {}, sample: [], essential: ["image_id"] },
  photo_text: {
    payload: {
      heading: "Where it began",
      body: "A paragraph that sits beside the photograph. Say what the picture cannot.",
      side: "left",
    },
    sample: ["heading", "body"],
    essential: ["image_id"],
  },
  map: {
    payload: {
      heading: "The venue",
      name: "Venue name",
      address: "Street, Town",
      note: "Where to park and which door to use.",
    },
    sample: ["name", "address", "note"],
    essential: ["name", "address"],
  },
  travel: NONE,
  stays: NONE,
  coach: NONE,
  gift_funds: NONE,
  song_requests: NONE,
  guestbook: NONE,
  playlist: {
    payload: { heading: "The playlist", label: "Have a listen", note: "The songs we love, and the ones we will dance to." },
    sample: ["note"],
    essential: ["url"],
  },
  footer: { payload: { note: "We cannot wait to see you" }, sample: [], essential: [] },
};

/** A fresh copy, so a caller can never mutate the table. */
export function starterPayload(type: BlockType): Record<string, unknown> {
  return JSON.parse(JSON.stringify(STARTERS[type].payload)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filled(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

const BRACKETED = /\[[^\]]+\]/;

function hasBracket(value: unknown): boolean {
  if (typeof value === "string") return BRACKETED.test(value);
  if (Array.isArray(value)) return value.some(hasBracket);
  if (isRecord(value)) return Object.values(value).some(hasBracket);
  return false;
}

/** Keys still carrying exactly what the starter wrote, plus any bracketed text. */
export function sampleLeft(type: BlockType, payload: unknown): string[] {
  if (!isRecord(payload)) return [];
  const starter = STARTERS[type];
  const keys = new Set<string>();

  for (const key of starter.sample) {
    if (filled(payload[key]) && JSON.stringify(payload[key]) === JSON.stringify(starter.payload[key])) {
      keys.add(key);
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (hasBracket(value)) keys.add(key);
  }
  return [...keys];
}

export type BlockStatus = "blank" | "sample" | null;

/**
 * Whether a block still needs the planner's attention.
 *
 * `blank`: nothing essential is filled in. `sample`: it carries starter text.
 * Null: finished, or a block that draws from somewhere else and has nothing to
 * finish. A block set up from a starter and then fully rewritten is null.
 */
export function blockStatus(block: Pick<SiteBlock, "type" | "payload">): BlockStatus {
  const starter = STARTERS[block.type];
  const payload = isRecord(block.payload) ? block.payload : {};

  if (sampleLeft(block.type, payload).length > 0) return "sample";
  if (starter.essential.length > 0 && !starter.essential.some((key) => filled(payload[key]))) {
    return "blank";
  }
  return null;
}

/**
 * The visible blocks publish must refuse.
 *
 * Hidden blocks are skipped: hiding is the legitimate way to say "not yet".
 * A deprecated block is skipped too — a revision restored from months ago may
 * hold one, and it is not the planner's to finish.
 */
export function blocksNeedingWork(
  blocks: SiteBlock[],
): { id: string; type: BlockType; label: string; status: Exclude<BlockStatus, null> }[] {
  return blocks.flatMap((block) => {
    if (!block.visible || BLOCKS[block.type].deprecated) return [];
    const status = blockStatus(block);
    return status ? [{ id: block.id, type: block.type, label: BLOCKS[block.type].label, status }] : [];
  });
}

const SNIPPET_KEYS = [
  "headline",
  "heading",
  "title",
  "name",
  "caption",
  "note",
  "intro",
  "body",
  "image_alt",
  "prompt",
  "label",
] as const;

const REPEAT_KEYS: [string, string][] = [
  ["items", "q"],
  ["items", "title"],
  ["members", "name"],
  ["milestones", "title"],
];

/**
 * A few words of the block's own content, so three `Photo band` rows are three
 * distinguishable rows. Twenty-odd characters; null when there is nothing.
 */
export function blockSnippet(block: Pick<SiteBlock, "payload">, max = 26): string | null {
  const payload = isRecord(block.payload) ? block.payload : null;
  if (!payload) return null;

  let found: string | null = null;
  for (const key of SNIPPET_KEYS) {
    const value = payload[key];
    if (typeof value === "string" && value.trim() !== "") {
      found = value.trim();
      break;
    }
  }
  if (!found) {
    for (const [list, field] of REPEAT_KEYS) {
      const rows = payload[list];
      if (!Array.isArray(rows)) continue;
      const first = rows.find(isRecord);
      const value = first?.[field];
      if (typeof value === "string" && value.trim() !== "") {
        found = value.trim();
        break;
      }
    }
  }
  if (!found) return null;

  const oneLine = found.replace(/\s+/g, " ");
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1).trimEnd()}…`;
}
