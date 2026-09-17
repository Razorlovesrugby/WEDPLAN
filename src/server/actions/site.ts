"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { validatePalette, isHexColor } from "@/lib/theme/contrast";
import {
  HERO_STYLES,
  PALETTE_IDS,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  type ThemePresetId,
} from "@/lib/theme/presets";
import { FAQ_LIBRARY } from "@/lib/site/faq-library";
import { SECTION_KEYS, THEME_BLOCK_KEY, isSectionKey, SECTIONS } from "@/lib/site/sections";
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
 * The sort_order a write should carry.
 *
 * Reads the row's current value rather than assuming the designed default,
 * because an upsert names every column it sets — so writing the default here
 * would silently undo a planner's reordering the next time they edited a
 * section's text. Only a row that does not exist yet gets the default.
 */
async function currentSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  weddingId: string,
  blockKey: string,
  fallback: number,
): Promise<number> {
  const { data } = await supabase
    .from("site_content")
    .select("sort_order")
    .eq("wedding_id", weddingId)
    .eq("block_key", blockKey)
    .maybeSingle();
  return data?.sort_order ?? fallback;
}

export async function saveSiteBlock(
  blockKey: string,
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  const wedding = await requireWedding();

  if (!isSectionKey(blockKey) || !(blockKey in sectionSchemas)) {
    return fail("That isn't a section of the site");
  }
  const schema = sectionSchemas[blockKey as SectionSchemaKey];
  const parsed = schema.safeParse(fields);
  if (!parsed.success) return fail("Some fields need fixing", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const sortOrder = await currentSortOrder(
    supabase,
    wedding.id,
    blockKey,
    SECTIONS[blockKey].defaultOrder,
  );
  const { error } = await supabase.from("site_content").upsert(
    {
      wedding_id: wedding.id,
      block_key: blockKey,
      payload: compact(parsed.data as Record<string, unknown>) as never,
      sort_order: sortOrder,
    },
    // The unique key is (wedding_id, block_key); without naming it, an upsert
    // collides on the primary key instead and inserts a duplicate row.
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not save that section: ${error.message}`);

  revalidateSite();
  return ok(undefined);
}

export async function setSectionVisible(blockKey: string, visible: boolean): Promise<ActionResult> {
  const wedding = await requireWedding();
  if (!isSectionKey(blockKey)) return fail("That isn't a section of the site");

  const supabase = await createClient();
  const sortOrder = await currentSortOrder(
    supabase,
    wedding.id,
    blockKey,
    SECTIONS[blockKey].defaultOrder,
  );
  const { error } = await supabase.from("site_content").upsert(
    { wedding_id: wedding.id, block_key: blockKey, visible, sort_order: sortOrder },
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not change that: ${error.message}`);

  revalidateSite();
  return ok(undefined);
}

/**
 * Renumber the sections.
 *
 * Takes the whole order rather than a from/to pair, for the same reason
 * `reorderLists` (spec 12) does: the client already knows the order it wants,
 * and computing it from a move server-side means reconstructing state the
 * client has and the server does not.
 */
export async function reorderSections(orderedKeys: string[]): Promise<ActionResult> {
  const wedding = await requireWedding();

  const keys = orderedKeys.filter(isSectionKey);
  if (keys.length !== orderedKeys.length) return fail("That isn't a section of the site");
  if (new Set(keys).size !== keys.length) return fail("A section was listed twice");

  const supabase = await createClient();
  const { error } = await supabase.from("site_content").upsert(
    keys.map((key, index) => ({
      wedding_id: wedding.id,
      block_key: key,
      // Gaps of 10 so a later single insert has somewhere to land without
      // renumbering everything again.
      sort_order: index * 10,
    })),
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not reorder the sections: ${error.message}`);

  revalidateSite();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const themeSchema = z.object({
  preset: z.enum(THEME_PRESET_IDS),
  palette: z.enum([...PALETTE_IDS, "custom"] as [string, ...string[]]),
  hero_style: z.enum(HERO_STYLES),
  monogram: z.coerce.boolean().default(true),
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
  const { error } = await supabase.from("site_content").upsert(
    {
      wedding_id: wedding.id,
      block_key: THEME_BLOCK_KEY,
      payload: compact({
        preset: data.preset,
        palette: data.palette,
        hero_style: data.hero_style,
        monogram: data.monogram,
        custom_tokens: customTokens,
      }) as never,
      sort_order: -1, // Config, not a section. Never rendered in the list.
    },
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not save the theme: ${error.message}`);

  revalidateSite();
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// The FAQ starter library
// ---------------------------------------------------------------------------

/**
 * Add the starter questions to whatever is already there.
 *
 * Appends rather than replaces, and skips any question already present, so
 * pressing it twice is safe and it can never eat an answer somebody wrote.
 */
export async function addStarterFaq(): Promise<ActionResult<{ added: number }>> {
  const wedding = await requireWedding();
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("site_content")
    .select("payload, sort_order")
    .eq("wedding_id", wedding.id)
    .eq("block_key", "faq")
    .maybeSingle();
  if (readError) return fail(`Could not read the current questions: ${readError.message}`);

  const payload = (existing?.payload ?? {}) as Record<string, unknown>;
  const current = Array.isArray(payload["items"]) ? (payload["items"] as Record<string, unknown>[]) : [];
  const have = new Set(
    current.map((item) => String(item["q"] ?? "").trim().toLowerCase()).filter(Boolean),
  );

  const additions = FAQ_LIBRARY.filter((item) => !have.has(item.q.toLowerCase()));
  if (additions.length === 0) return ok({ added: 0 });

  const { error } = await supabase.from("site_content").upsert(
    {
      wedding_id: wedding.id,
      block_key: "faq",
      payload: { ...payload, items: [...current, ...additions] } as never,
      sort_order: existing?.sort_order ?? SECTIONS.faq.defaultOrder,
    },
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (error) return fail(`Could not add the questions: ${error.message}`);

  revalidateSite();
  return ok({ added: additions.length });
}

// ---------------------------------------------------------------------------

function revalidateSite() {
  revalidatePath("/site");
  revalidatePath("/site/theme");
  // Both the redirect and the real address: a planner who saves a section and
  // then opens the site should see the change, not a cached page.
  revalidatePath("/w");
  revalidatePath("/w/[slug]", "page");
}
