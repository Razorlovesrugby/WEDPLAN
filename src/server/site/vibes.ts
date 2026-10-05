import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { styleSchema } from "@/lib/site/block-schemas";
import type { SiteBlock } from "@/lib/site/blocks";
import { serialiseMotion } from "@/lib/site/motion";
import { THEME_BLOCK_KEY } from "@/lib/site/sections";
import { vibeVariants, type Vibe } from "@/lib/site/vibes";
import { THEME_PRESETS } from "@/lib/theme/presets";

/**
 * Applying a Vibe to a wedding's draft, and taking it back (spec 27 E3, E6).
 *
 * Not a server action itself — the actions in `actions/site-vibes.ts` and
 * `applyStarterLayout` both call these, and a `"use server"` file may only
 * export async functions the browser can call.
 *
 * **It restyles and never rewrites.** The theme's preset, palette, type pairing,
 * hero style and motion level change, and so does `style.variant` on blocks that
 * have Looks. No payload is touched, no block is added or removed, and the
 * planner's layout switches (chapter rail, section numbers, reply bar) are
 * carried over as they were.
 *
 * What it returns is a **snapshot of what it overwrote**, which is what makes a
 * one-click restyle safe to offer: `restoreSnapshot` puts every one of those
 * values back exactly.
 */

export type StyleSnapshot = {
  /** The theme row's payload before, or null if the wedding had never saved one. */
  theme: Record<string, unknown> | null;
  /** The whole `style` of each block whose Look was changed, before. */
  blocks: { id: string; style: Record<string, unknown> }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== ""));
}

export async function applyVibeToDraft(
  supabase: SupabaseClient,
  weddingId: string,
  vibe: Vibe,
  blocks: Pick<SiteBlock, "id" | "type" | "style">[],
): Promise<{ ok: true; snapshot: StyleSnapshot } | { ok: false; error: string }> {
  // `saveTheme` refuses an unavailable preset; so does this, before it has
  // written anything, rather than applying the Looks and failing on the theme.
  if (!THEME_PRESETS[vibe.theme.preset].available) {
    return { ok: false, error: `The ${THEME_PRESETS[vibe.theme.preset].label} theme isn't built yet` };
  }

  const { data: stored } = await supabase
    .from("site_content")
    .select("payload")
    .eq("wedding_id", weddingId)
    .eq("block_key", THEME_BLOCK_KEY)
    .maybeSingle();
  const previous = isRecord(stored?.payload) ? (stored.payload as Record<string, unknown>) : null;

  const wanted = vibeVariants(vibe, blocks);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const snapshot: StyleSnapshot = {
    theme: previous,
    blocks: [...wanted.keys()].map((id) => ({
      id,
      style: { ...((byId.get(id)?.style ?? {}) as Record<string, unknown>) },
    })),
  };

  const payload = compact({
    // Whatever else the planner had on the theme — their layout switches — stays.
    ...previous,
    preset: vibe.theme.preset,
    palette: vibe.theme.palette,
    hero_style: vibe.theme.heroStyle,
    monogram: vibe.theme.monogram,
    typography: vibe.theme.typography,
    // A fresh motion level, with no stale overrides: a Vibe is a whole feeling.
    motion: serialiseMotion({ level: vibe.theme.motion, off: [], on: [] }),
    // A saved custom palette is replaced by the Vibe's own.
    custom_tokens: undefined,
  });

  const { error: themeError } = await supabase.from("site_content").upsert(
    {
      wedding_id: weddingId,
      block_key: THEME_BLOCK_KEY,
      payload: payload as never,
      sort_order: -1, // Config, not a section. Never rendered in the list.
    },
    { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
  );
  if (themeError) return { ok: false, error: `Could not save the theme: ${themeError.message}` };

  for (const [id, variant] of wanted) {
    const block = byId.get(id);
    if (!block) continue;
    const { error } = await supabase
      .from("site_blocks")
      .update({ style: compact({ ...(block.style as Record<string, unknown>), variant }) as never })
      .eq("wedding_id", weddingId)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, snapshot };
}

/** Put back exactly what `applyVibeToDraft` overwrote. */
export async function restoreSnapshot(
  supabase: SupabaseClient,
  weddingId: string,
  snapshot: StyleSnapshot,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (snapshot.theme) {
    const { error } = await supabase.from("site_content").upsert(
      {
        wedding_id: weddingId,
        block_key: THEME_BLOCK_KEY,
        payload: snapshot.theme as never,
        sort_order: -1,
      },
      { onConflict: "wedding_id,block_key", ignoreDuplicates: false },
    );
    if (error) return { ok: false, error: error.message };
  } else {
    // There was no theme row before: put the wedding back to having none, which
    // is the default theme, rather than leaving the Vibe's behind.
    const { error } = await supabase
      .from("site_content")
      .delete()
      .eq("wedding_id", weddingId)
      .eq("block_key", THEME_BLOCK_KEY);
    if (error) return { ok: false, error: error.message };
  }

  for (const block of snapshot.blocks) {
    // The style came from the database, but it comes back through the browser,
    // so it is validated like any other write rather than trusted.
    const parsed = styleSchema.safeParse(block.style);
    if (!parsed.success) continue;
    const { error } = await supabase
      .from("site_blocks")
      .update({ style: compact(parsed.data) as never })
      .eq("wedding_id", weddingId)
      .eq("id", block.id);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
