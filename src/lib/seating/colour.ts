/**
 * "Colour by" (spec 33 §A.2, Q18) — a view switch, never stored. Side, one
 * tag, or the answer to one single-choice RSVP question (typically the meal).
 * What Aisle Planner and Prismm call meal indicators, built from questions the
 * RSVP already asks: there is no meal schema.
 */

import { sideLabel } from "@/lib/format";
import type { GuestSide } from "@/lib/types/database";
import type { SeatingGuest } from "./model";

export type ColourBy =
  | { kind: "none" }
  | { kind: "side" }
  | { kind: "tag"; tagId: string }
  | { kind: "question"; questionId: string };

/** Eight colours that stay distinct from each other on paper and on screen. */
export const PALETTE = [
  "#2f6f4f",
  "#b0532b",
  "#4a5b8c",
  "#b07d2b",
  "#8c2f4a",
  "#3f8a8c",
  "#6b4a8c",
  "#6d6a63",
] as const;

export const NO_ANSWER_COLOUR = "#c9c4bb";

/** `side`, `tag:<id>`, `q:<id>`, or anything else for none — the URL form. */
export function parseColourBy(raw: string | null | undefined): ColourBy {
  if (raw === "side") return { kind: "side" };
  if (raw?.startsWith("tag:") && raw.length > 4) return { kind: "tag", tagId: raw.slice(4) };
  if (raw?.startsWith("q:") && raw.length > 2) return { kind: "question", questionId: raw.slice(2) };
  return { kind: "none" };
}

export function serialiseColourBy(c: ColourBy): string {
  switch (c.kind) {
    case "side":
      return "side";
    case "tag":
      return `tag:${c.tagId}`;
    case "question":
      return `q:${c.questionId}`;
    default:
      return "";
  }
}

export type ColourContext = {
  collaborators: { role: "owner" | "partner"; display_name: string | null }[];
  tags: { id: string; name: string; colour: string }[];
  /** Single-choice, guest-scoped questions only. */
  questions: { id: string; label: string; options: string[] }[];
  /** questionId → guestId → the chosen option. A plain object so it crosses to the browser. */
  answers: Record<string, Record<string, string>>;
};

export type ColourKeyEntry = { label: string; colour: string };

const SIDES: GuestSide[] = ["partner_a", "partner_b", "both", "other"];

/** The key, in display order. Empty for `none`. */
export function colourLegend(c: ColourBy, ctx: ColourContext): ColourKeyEntry[] {
  switch (c.kind) {
    case "side":
      return [
        ...SIDES.map((s, i) => ({ label: sideLabel(s, ctx.collaborators), colour: PALETTE[i]! })),
        { label: "No side", colour: NO_ANSWER_COLOUR },
      ];
    case "tag": {
      const tag = ctx.tags.find((t) => t.id === c.tagId);
      if (!tag) return [];
      return [
        { label: tag.name, colour: tag.colour },
        { label: `Not ${tag.name}`, colour: NO_ANSWER_COLOUR },
      ];
    }
    case "question": {
      const q = ctx.questions.find((x) => x.id === c.questionId);
      if (!q) return [];
      return [
        ...q.options.map((o, i) => ({ label: o, colour: PALETTE[i % PALETTE.length]! })),
        { label: "No answer", colour: NO_ANSWER_COLOUR },
      ];
    }
    default:
      return [];
  }
}

/** This guest's colour and what it means, or null for `none`. */
export function guestColour(g: SeatingGuest, c: ColourBy, ctx: ColourContext): ColourKeyEntry | null {
  const legend = colourLegend(c, ctx);
  if (legend.length === 0) return null;
  const fallback = legend[legend.length - 1]!;
  switch (c.kind) {
    case "side": {
      const i = g.side ? SIDES.indexOf(g.side) : -1;
      return i >= 0 ? legend[i]! : fallback;
    }
    case "tag":
      return g.tagIds.includes(c.tagId) ? legend[0]! : fallback;
    case "question": {
      const answer = ctx.answers[c.questionId]?.[g.id];
      return legend.find((e, i) => i < legend.length - 1 && e.label === answer) ?? fallback;
    }
    default:
      return null;
  }
}

/** Per-answer counts for a set of guests, in legend order, zero rows dropped. */
export function colourCounts(
  guests: readonly SeatingGuest[],
  c: ColourBy,
  ctx: ColourContext,
): { label: string; colour: string; count: number }[] {
  const legend = colourLegend(c, ctx);
  const counts = new Map<string, number>();
  for (const g of guests) {
    const e = guestColour(g, c, ctx);
    if (e) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
  }
  return legend.map((e) => ({ ...e, count: counts.get(e.label) ?? 0 })).filter((e) => e.count > 0);
}
