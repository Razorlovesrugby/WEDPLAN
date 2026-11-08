"use server";

import { z } from "zod";
import { getViewerKind, requireWedding } from "@/server/queries/wedding";
import { getActiveLists, searchByName } from "@/server/queries/search";
import type { Command } from "@/lib/command-palette";
import { fail, ok, type ActionResult } from "./result";

/**
 * What the ⌘K box asks the server as you type (spec 46). A read, but it has to
 * be callable from the dialog, so it's an action wrapping the cached query.
 */
export async function searchPalette(
  query: unknown,
): Promise<ActionResult<{ found: Command[]; lists: { id: string; title: string }[] }>> {
  const parsed = z.string().max(200).safeParse(query);
  if (!parsed.success) return fail("That search is too long");
  const wedding = await requireWedding();
  const viewer = (await getViewerKind()) === "planner" ? "planner" : "couple";
  const [found, lists] = await Promise.all([
    searchByName(wedding.id, parsed.data, viewer),
    getActiveLists(wedding.id),
  ]);
  return ok({ found, lists });
}
