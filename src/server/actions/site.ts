"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { validatePalette, isHexColor, type PaletteTokens } from "@/lib/theme/contrast";
import {
  HERO_STYLES,
  PALETTES,
  PALETTE_IDS,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  TYPOGRAPHY_IDS,
  type ThemePresetId,
} from "@/lib/theme/presets";
import {
  FONT_IDS,
  resolveTextStyle,
  serialiseTextStyle,
  textColourFailures,
  type SiteTextStyle,
} from "@/lib/theme/text-style";
import { THEME_BLOCK_KEY } from "@/lib/site/sections";
import { MOTION_EFFECTS, MOTION_LEVELS, resolveMotion, serialiseMotion } from "@/lib/site/motion";
import { fail, ok, type ActionResult } from "./result";

/**
 * Writes for the public site (spec 14 §13).
 *
 * Every section's content is a JSONB payload in `site_content`, which is a
 * deliberately loose store — so the validation has to happen here. The
 * renderer tolerates garbage by design (a malformed FAQ costs its own section,
 * never the page), and that tolerance is exactly why nothing may rely on it:
 * if this file lets a bad payload through, the failure is silent.
 *
 * Unlike the public read path, these run as the signed-in collaborator through
 * `createClient()`, so RLS is doing the tenancy work. `requireWedding()` still
 * scopes every write, because a wedding_id in the row is what the composite
 * foreign keys elsewhere hang off.
 */

// ---------------------------------------------------------------------------
// Per-section payload schemas
// ---------------------------------------------------------------------------
// These mirror the readers in src/lib/site/sections.ts. Where a reader is
// lenient, the schema is strict: the reader's job is to survive old data, this
// one's job is to stop new bad data being written.

const trimmed = z.string().trim();
const optionalText = trimmed.max(4000).optional().transform((v) => (v ? v : undefined));

const faqItemSchema = z.object({
  q: trimmed.min(1, "A question needs asking").max(300),
  a: trimmed.max(4000).default(""),
  featured: z.coerce.boolean().default(false),
  tags: z.array(trimmed.min(1).max(60)).max(5).default([]),
});

const sectionSchemas = {
  hero: z.object({
    headline: optionalText,
    date_label: optionalText,
    location: optionalText,
    // Same-origin only. SiteHero re-checks this before rendering, but a value
    // that can never work should not be storable in the first place.
    image_path: trimmed
      .max(500)
      .optional()
      .refine((v) => !v || (v.startsWith("/") && !v.startsWith("//")), {
        message: "Use a path on this site, starting with a single /",
      })
      .transform((v) => (v ? v : undefined)),
    image_alt: optionalText,
  }),
  countdown: z.object({
    enabled: z.coerce.boolean().default(false),
    label: optionalText,
  }),
  story: z.object({
    body: optionalText,
    milestones: z
      .array(
        z.object({
          date: optionalText,
          title: trimmed.min(1).max(200),
          body: optionalText,
        }),
      )
      .max(30)
      .optional(),
  }),
  schedule: z.object({
    intro: optionalText,
    events: z
      .array(
        z.object({
          id: z.string().uuid(),
          dress_code: optionalText,
          detail: optionalText,
          map_url: optionalText,
          hide_time: z.coerce.boolean().default(false),
        }),
      )
      .max(50)
      .optional(),
  }),
  travel: z.object({ intro: optionalText, body: optionalText }),
  stays: z.object({ intro: optionalText }),
  gallery: z.object({
    intro: optionalText,
    uploads_open: z.coerce.boolean().default(false),
    moderation: z.enum(["review", "auto"]).default("review"),
  }),
  faq: z.object({ intro: optionalText, items: z.array(faqItemSchema).max(100).default([]) }),
  party: z.object({
    intro: optionalText,
    members: z
      .array(
        z.object({
          name: trimmed.min(1).max(120),
          role: optionalText,
          blurb: optionalText,
        }),
      )
      .max(40)
      .default([]),
  }),
  things_to_do: z.object({
    intro: optionalText,
    items: z
      .array(z.object({ title: trimmed.min(1).max(200), body: optionalText, link: optionalText }))
      .max(40)
      .default([]),
  }),
  rsvp: z.object({ intro: optionalText, closes_label: optionalText }),
  footer: z.object({
    note: optionalText,
    contact_email: z.union([z.string().trim().email(), z.literal("")]).optional(),
    hashtag: optionalText,
  }),
} satisfies Record<string, z.ZodTypeAny>;

type SectionSchemaKey = keyof typeof sectionSchemas;

/**
 * Strip keys whose value is undefined before writing.
 *
 * `{ intro: undefined }` serialises to `{}` through JSON anyway, but going via
 * supabase-js it becomes a JSONB null, and `text()` would then read a null
 * where it expected a missing key. Same rendered result today; a trap for
 * whoever next writes a reader that distinguishes the two.
 */
function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

/**
 * NOTE, spec 23: the section writers that used to live here are gone.
 *
 * `saveSiteBlock`, `setSectionVisible`, `reorderSections` and `addStarterFaq`
 * wrote `site_content` rows, which nothing renders any more — the site is
 * `site_blocks` plus a published revision now (see
 * `src/server/actions/site-blocks.ts`). Leaving them would have left a second
 * write path into a table the app does not read, which is how somebody edits
 * for an hour and cannot work out why the site never changes.
 *
 * The theme stays here, and stays in `site_content`: it is configuration
 * rather than content, and `/site/theme` is still its screen.
 */

const themeSchema = z.object({
  preset: z.enum(THEME_PRESET_IDS),
  palette: z.enum([...PALETTE_IDS, "custom"] as [string, ...string[]]),
  hero_style: z.enum(HERO_STYLES),
  monogram: z.coerce.boolean().default(true),
  // Editorial only. Defaulted rather than required so a caller that predates
  // the pairing picker — an old form post, a test — still saves a valid theme
  // instead of failing validation on a field it has never heard of.
  typography: z.enum(TYPOGRAPHY_IDS).default("fraunces_garamond"),
  // Spec 27. Optional, and an absent value means "leave what is stored":
  // `saveTheme` writes the whole payload in one go, so a caller that predates
  // these (the old /site/theme form, a test) must not be able to reset a
  // planner's motion level just by saving a palette.
  motion: z
    .object({
      level: z.enum(MOTION_LEVELS),
      off: z.array(z.enum(MOTION_EFFECTS)).max(20).default([]),
      on: z.array(z.enum(MOTION_EFFECTS)).max(20).default([]),
    })
    .optional(),
  layout: z
    .object({
      top_nav: z.boolean().optional(),
      chapter_rail: z.boolean().optional(),
      section_numbers: z.boolean().optional(),
      reply_bar: z.boolean().optional(),
      reply_by_date: z.boolean().optional(),
    })
    .optional(),
  // Spec 31. Optional with "absent = leave what is stored", like motion: an
  // old caller must not wipe a planner's text colours by saving a palette. To
  // clear a colour, send `text_colours: {}`. The "same in every section" switch
  // is NOT here — it has its own action because turning it on is destructive.
  text_colours: z
    .object({
      ink: z.string().trim().optional(),
      muted: z.string().trim().optional(),
      accent: z.string().trim().optional(),
    })
    .optional(),
  fonts: z
    .object({
      heading: z.enum(FONT_IDS).optional(),
      body: z.enum(FONT_IDS).optional(),
    })
    .optional(),
  custom_ink: z.string().trim().optional(),
  custom_paper: z.string().trim().optional(),
  custom_muted: z.string().trim().optional(),
  custom_line: z.string().trim().optional(),
  custom_accent: z.string().trim().optional(),
});

export async function saveTheme(fields: Record<string, unknown>): Promise<ActionResult> {
  const wedding = await requireWedding();
  const parsed = themeSchema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const preset = data.preset as ThemePresetId;
  if (!THEME_PRESETS[preset].available) {
    // The other three presets are declared as a system, not built (Q3a). Saving
    // one would render the site in a theme that does not exist.
    return fail(`The ${THEME_PRESETS[preset].label} theme isn't built yet`, {
      preset: ["Only Script is available at the moment"],
    });
  }

  let customTokens: Record<string, string> | undefined;

  if (data.palette === "custom") {
    const tokens = {
      ink: data.custom_ink ?? "",
      paper: data.custom_paper ?? "",
      muted: data.custom_muted ?? "",
      line: data.custom_line ?? "",
      accent: data.custom_accent ?? "",
    };

    const badFormat = Object.entries(tokens).filter(([, value]) => !isHexColor(value));
    if (badFormat.length > 0) {
      return fail(
        "Every custom colour needs to be a hex value like #7a5c3c",
        Object.fromEntries(badFormat.map(([name]) => [`custom_${name}`, ["Not a hex colour"]])),
      );
    }

    // The point of the validator, and the first thing that calls it: a palette
    // that fails on text does not get saved, whoever picked it. A guest
    // reading a coach departure time in a car park is the use case.
    const result = validatePalette(tokens);
    if (!result.ok) {
      return fail(`That palette isn't readable enough. ${result.failures.join(" ")}`, {
        palette: result.failures,
      });
    }
    customTokens = tokens;
  }

  const supabase = await createClient();

  // Carry forward what this caller did not mention (see `themeSchema`).
  const { data: stored } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", wedding.id)
    .eq("block_key", THEME_BLOCK_KEY)
    .maybeSingle();
  const previous = (stored?.payload ?? {}) as Record<string, unknown>;
  const motion = data.motion ? serialiseMotion(resolveMotion(data.motion)) : previous["motion"];
  const layout = data.layout ?? previous["layout"];

  // Spec 31: site-wide text colours and fonts, carried forward unless sent.
  const before = resolveTextStyle(previous["text_colours"], previous["fonts"]);
  const colours = data.text_colours
    ? Object.fromEntries(Object.entries(data.text_colours).filter(([, v]) => v)) as SiteTextStyle["colours"]
    : before.colours;
  const nextText: SiteTextStyle = {
    colours,
    matchAll: before.matchAll,
    fonts: data.fonts ?? before.fonts,
  };
  // Always re-checked against the palette being saved, not just when the colours
  // changed: a dark ink that was fine on Ivory is invisible on Midnight, and
  // saving the palette would otherwise strand it. The same gate a palette passes.
  const paletteTokens =
    data.palette === "custom" && customTokens
      ? (customTokens as PaletteTokens)
      : PALETTES[data.palette as keyof typeof PALETTES]?.tokens;
  const textProblems = paletteTokens ? textColourFailures(paletteTokens, nextText.colours) : [];
  if (textProblems.length > 0) {
    return fail(`That text colour isn't readable enough. ${textProblems.join(" ")}`, {
      text_colours: textProblems,
    });
  }

  const { error } = await supabase.from("site_content").upsert(
    {
      wedding_id: wedding.id,
      block_key: THEME_BLOCK_KEY,
      payload: compact({
        preset: data.preset,
        palette: data.palette,
        hero_style: data.hero_style,
        monogram: data.monogram,
        typography: data.typography,
        custom_tokens: customTokens,
        motion,
        layout,
        ...serialiseTextStyle(nextText),
      }) as never,
      sort_order: -1, // Config, not a section. Never rendered in the list.
    },
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not save the theme: ${error.message}`);

  revalidateSite();
  return ok(undefined);
}

/**
 * "Same text colour and font in every section" (spec 31, Q7, Q8, Q13).
 *
 * **Turning it ON clears every block's own text colour, secondary colour and
 * font** — the planner chose that over keeping them, so it is destructive and the
 * caller confirms with a count first. Turning it OFF changes nothing by itself.
 * Cleared blocks are the draft; the published site changes when the planner next
 * publishes, like any other edit.
 */
export async function setMatchAllText(on: boolean): Promise<ActionResult<{ cleared: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: stored } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", wedding.id)
    .eq("block_key", THEME_BLOCK_KEY)
    .maybeSingle();
  const previous = (stored?.payload ?? {}) as Record<string, unknown>;
  const before = resolveTextStyle(previous["text_colours"], previous["fonts"]);

  let cleared = 0;
  if (on) {
    const { data: blocks, error: readError } = await supabase
      .from("site_blocks")
      .select("id, style")
      .eq("wedding_id", wedding.id);
    if (readError) return fail(`Could not read the blocks: ${readError.message}`);
    for (const block of blocks ?? []) {
      const style = (block.style ?? {}) as Record<string, unknown>;
      if (!("textColour" in style) && !("mutedColour" in style) && !("bodyFont" in style)) continue;
      const { textColour: _t, mutedColour: _m, bodyFont: _f, ...rest } = style;
      const { error } = await supabase
        .from("site_blocks")
        .update({ style: rest as never })
        .eq("wedding_id", wedding.id)
        .eq("id", block.id);
      if (error) return fail(`Could not clear a block's text style: ${error.message}`);
      cleared += 1;
    }
  }

  const { error } = await supabase.from("site_content").upsert(
    {
      wedding_id: wedding.id,
      block_key: THEME_BLOCK_KEY,
      payload: compact({
        ...previous,
        ...serialiseTextStyle({ ...before, matchAll: on }),
      }) as never,
      sort_order: -1,
    },
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not save that: ${error.message}`);

  revalidateSite();
  return ok({ cleared });
}

function revalidateSite() {
  revalidatePath("/site");
  revalidatePath("/site/theme");
  // Both the redirect and the real address: a planner who saves the theme and
  // then opens the site should see the change, not a cached page.
  revalidatePath("/w");
  revalidatePath("/w/[slug]", "page");
}
