"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWedding } from "@/server/queries/wedding";
import { listDraftBlocks } from "@/server/queries/site-blocks";
import { getVibe } from "@/lib/site/vibes";
import {
  applyVibeToDraft,
  restoreSnapshot,
  type StyleSnapshot,
} from "@/server/site/vibes";
import { fail, ok, type ActionResult } from "./result";

/**
 * One-click restyles (spec 27 E3), and taking them back (E6).
 *
 * The work is in `server/site/vibes.ts`; these are the two doors to it.
 * `applyVibe` returns a snapshot of exactly what it overwrote, and the builder
 * holds it for the length of an undo toast — a restyle that rewrites nobody's
 * words is safe to offer as one click only because it can be undone as one.
 */

function revalidateSite() {
  revalidatePath("/site");
  revalidatePath("/site/preview");
  revalidatePath("/w", "layout");
}

export async function applyVibe(vibeId: string): Promise<ActionResult<{ snapshot: StyleSnapshot }>> {
  const vibe = getVibe(vibeId);
  if (!vibe) return fail("That isn't one of the vibes");

  const wedding = await requireWedding();
  const supabase = await createClient();
  const blocks = await listDraftBlocks(wedding.id);

  const result = await applyVibeToDraft(supabase, wedding.id, vibe, blocks);
  if (!result.ok) return fail(result.error);

  revalidateSite();
  return ok({ snapshot: result.snapshot });
}

const snapshotSchema = z.object({
  theme: z.record(z.unknown()).nullable(),
  blocks: z
    .array(z.object({ id: z.string().uuid(), style: z.record(z.unknown()) }))
    .max(200),
});

export async function restoreVibe(snapshot: unknown): Promise<ActionResult> {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) return fail("That can't be undone any more");

  const wedding = await requireWedding();
  const supabase = await createClient();
  const result = await restoreSnapshot(supabase, wedding.id, parsed.data);
  if (!result.ok) return fail(result.error);

  revalidateSite();
  return ok(undefined);
}
